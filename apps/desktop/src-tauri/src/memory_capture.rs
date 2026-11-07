//! Opt-in synthetic Owner-root Runtime capture through Memory's in-process
//! native producer API. Independent of Workspace v1, read-1 and read-2.
mod fixture;
use enouia_memory_contract::{
    common::Sensitivity, error::Violation, json::canonical_bytes, next::*,
};
use enouia_memory_host::automation::{
    application::ApplicationFault,
    catalog::{CatalogReadOptions, CatalogReadRequest},
};
use enouia_memory_vault::automation::AutomationFault;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicBool, Ordering},
};

pub const CAPABILITY: &str = "memory-runtime-owner-capture-native-1";

#[derive(Clone, Default)]
pub struct NativeCapture(Arc<Inner>);
#[derive(Default)]
struct Inner {
    requested: AtomicBool,
    started: AtomicBool,
    closing: AtomicBool,
    withdrawn: AtomicBool,
    unavailable: AtomicBool,
    state: Mutex<Binding>,
}

#[cfg(test)]
#[path = "memory_capture/tests.rs"]
mod tests;
#[derive(Default)]
struct Binding {
    initializing: bool,
    failed: bool,
    fixture: Option<fixture::Fixture>,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct CaptureRequest {
    schema_version: NextVersion,
    capability: String,
    query: CaptureQuery,
}
impl NextDocument for CaptureRequest {
    fn validate(&self) -> Vec<Violation> {
        vec![]
    }
}
/// Exchanges are indexes into the fixed synthetic conversations; the page
/// never supplies turn text, identities or scope.
#[derive(Serialize, Deserialize)]
#[serde(tag = "operation", rename_all = "snake_case", deny_unknown_fields)]
enum CaptureQuery {
    Status,
    Preflight {
        exchange: usize,
    },
    Write {
        exchange: usize,
    },
    Jobs {
        exchange: usize,
    },
    Page {
        cursor: Option<Box<CatalogCursor>>,
        limit: usize,
    },
    Lock,
}
fn status(phase: &str) -> Value {
    json!({"schema_version":2,"kind":"runtime_memory_capture_status","capability":CAPABILITY,
        "effect":"native_read","mode":"synthetic_owner_only","state":phase,"available":phase=="open",
        "exchanges":fixture::EXCHANGES.len()})
}
fn fault(error: ApplicationFault) -> &'static str {
    match error {
        ApplicationFault::Locked => "capture_locked",
        ApplicationFault::Vault(AutomationFault::OutcomeUnknown) => "capture_outcome_unknown",
        ApplicationFault::Vault(AutomationFault::Stale) => "capture_stale",
        ApplicationFault::Vault(AutomationFault::Busy) => "capture_busy",
        ApplicationFault::Vault(AutomationFault::Conflict) => "capture_conflict",
        _ => "capture_refused",
    }
}
impl NativeCapture {
    pub fn enabled(&self) -> bool {
        self.0.requested.load(Ordering::SeqCst)
    }
    pub fn request_synthetic_mode(&self) {
        self.0.requested.store(true, Ordering::SeqCst);
    }
    pub fn initialize_synthetic(&self) -> Result<(), &'static str> {
        self.initialize_with(fixture::create)
    }
    fn initialize_with(
        &self,
        create: impl FnOnce(&AtomicBool) -> Result<fixture::Fixture, &'static str>,
    ) -> Result<(), &'static str> {
        if self.0.closing.load(Ordering::SeqCst) {
            return Err("runtime_closing");
        }
        if self.0.withdrawn.load(Ordering::SeqCst) {
            return Err("capture_locked");
        }
        if self.0.started.swap(true, Ordering::SeqCst) {
            return Err("capture_busy");
        }
        self.request_synthetic_mode();
        self.0
            .state
            .lock()
            .map_err(|_| "capture_busy")?
            .initializing = true;
        let result = create(&self.0.withdrawn);
        let mut state = self.0.state.lock().map_err(|_| "capture_busy")?;
        state.initializing = false;
        if self.0.closing.load(Ordering::SeqCst) || self.0.withdrawn.load(Ordering::SeqCst) {
            state.failed = true;
            if let Ok(fixture) = result {
                stop(fixture);
            }
            return Err(if self.0.closing.load(Ordering::SeqCst) {
                "runtime_closing"
            } else {
                "capture_locked"
            });
        }
        match result {
            Ok(fixture) => {
                state.fixture = Some(fixture);
                Ok(())
            }
            Err(error) => {
                state.failed = true;
                Err(error)
            }
        }
    }
    pub fn begin_close(&self) {
        self.0.closing.store(true, Ordering::SeqCst);
        self.lock();
    }
    pub fn close_failed(&self) {
        self.0.unavailable.store(true, Ordering::SeqCst);
        self.0.closing.store(false, Ordering::SeqCst);
    }
    /// Withdrawal is permanent for this enrollment: revoke it, signal the
    /// worker and lock the reader. A fresh launch is the only new enrollment.
    pub fn lock(&self) {
        self.0.withdrawn.store(true, Ordering::SeqCst);
        if let Ok(state) = self.0.state.lock()
            && let Some(fixture) = &state.fixture
        {
            fixture.host.revoke();
            if let Some(worker) = &fixture.worker {
                worker.stop();
            }
            let _ = fixture.reader.lock();
        }
    }
    /// Revoke, then join the Memory worker before releasing the root.
    pub fn shutdown(&self) {
        self.begin_close();
        let fixture = self
            .0
            .state
            .lock()
            .ok()
            .and_then(|mut state| state.fixture.take());
        if let Some(fixture) = fixture {
            stop(fixture);
        }
    }
    pub fn call(&self, window: &str, value: &Value) -> Result<Value, &'static str> {
        if window != "main" {
            return Err("permission_denied");
        }
        if value["schema_version"].as_u64() != Some(2) || value["capability"] != CAPABILITY {
            return Err("capture_version_unsupported");
        }
        let bytes = canonical_bytes(value).map_err(|_| "capture_invalid_request")?;
        let request =
            parse_document::<CaptureRequest>(&bytes).map_err(|_| "capture_invalid_request")?;
        let is_status = matches!(request.query, CaptureQuery::Status);
        if self.0.closing.load(Ordering::SeqCst) {
            return if is_status {
                Ok(status("closing"))
            } else {
                Err("runtime_closing")
            };
        }
        if self.0.unavailable.load(Ordering::SeqCst) {
            return if is_status {
                Ok(status("failed"))
            } else {
                Err("capture_refused")
            };
        }
        if matches!(request.query, CaptureQuery::Lock) {
            if !self.enabled() {
                return Err("capture_not_enabled");
            }
            self.lock();
            let mut view = status("locked");
            view["effect"] = json!("native_control");
            return Ok(view);
        }
        let state = self.0.state.try_lock().map_err(|_| "capture_busy")?;
        if is_status {
            let phase = if !self.enabled() {
                "disabled"
            } else if state.initializing {
                "initializing"
            } else if state.failed {
                "failed"
            } else if self.0.withdrawn.load(Ordering::SeqCst) {
                "locked"
            } else if let Some(fixture) = &state.fixture {
                if fixture.clock.now_unix_ms() >= fixture.expires_at_ms {
                    "expired"
                } else {
                    "open"
                }
            } else {
                "disabled"
            };
            return Ok(status(phase));
        }
        let fixture = state.fixture.as_ref().ok_or("capture_not_enabled")?;
        if self.0.withdrawn.load(Ordering::SeqCst) {
            return Err("capture_locked");
        }
        if fixture.clock.now_unix_ms() >= fixture.expires_at_ms {
            return Err("capture_expired");
        }
        let original = |exchange: usize| {
            fixture
                .requests
                .get(exchange)
                .ok_or("capture_invalid_request")
        };
        let result = match request.query {
            CaptureQuery::Preflight { exchange } => {
                let capture = fixture.host.preflight(original(exchange)?).map_err(fault)?;
                json!({"schema_version":2,"kind":"runtime_memory_capture_preflight","effect":"native_read",
                    "exchange":exchange,"capture":capture})
            }
            CaptureQuery::Write { exchange } => {
                // Capture and enqueue are separate transactions: a genuine
                // capture receipt is returned even when enqueue is refused.
                let capture = fixture.host.capture(original(exchange)?).map_err(|error| {
                    let code = fault(error);
                    if code == "capture_outcome_unknown" {
                        self.0.unavailable.store(true, Ordering::SeqCst);
                    }
                    code
                })?;
                let (queue, queue_error) = match fixture.host.enqueue(&capture) {
                    Ok(receipt) => (Some(receipt), None),
                    Err(error) => (None, Some(fault(error))),
                };
                json!({"schema_version":2,"kind":"runtime_memory_capture_write","effect":"native_write",
                    "exchange":exchange,"capture":capture,"queue":queue,"queue_error":queue_error})
            }
            CaptureQuery::Jobs { exchange } => {
                let jobs = fixture.host.status(original(exchange)?).map_err(fault)?;
                json!({"schema_version":2,"kind":"runtime_memory_capture_jobs","effect":"native_read",
                    "exchange":exchange,"jobs":jobs})
            }
            CaptureQuery::Page { cursor, limit } => {
                // A foreground read: the Memory worker yields its next step.
                fixture.host.set_foreground(true).map_err(fault)?;
                let page = fixture.reader.memory_page_native(
                    &CatalogReadRequest {
                        profile: &fixture.profile,
                        filter: &CatalogFilter::default(),
                        options: CatalogReadOptions {
                            limit,
                            max_bytes: MAX_DOCUMENT_BYTES,
                            max_sensitivity: Sensitivity::Private,
                            include_facets: false,
                        },
                    },
                    cursor.as_deref(),
                );
                let _ = fixture.host.set_foreground(false);
                serde_json::to_value(page.map_err(fault)?).map_err(|_| "capture_refused")?
            }
            CaptureQuery::Status | CaptureQuery::Lock => return Err("capture_invalid_request"),
        };
        // Lock/exit withdraw before waiting on this call. Never publish a
        // result completed after that withdrawal was observed.
        if self.0.closing.load(Ordering::SeqCst) {
            return Err("runtime_closing");
        }
        if self.0.withdrawn.load(Ordering::SeqCst) {
            return Err("capture_locked");
        }
        Ok(result)
    }
}
fn stop(fixture: fixture::Fixture) {
    fixture.host.revoke();
    if let Some(worker) = fixture.worker {
        let _ = worker.shutdown();
    }
}
#[tauri::command]
pub async fn memory_capture(
    window: tauri::WebviewWindow,
    host: tauri::State<'_, crate::memory::MemoryHost>,
    request: Value,
) -> Result<Value, String> {
    if window.label() != "main" {
        return Err("permission_denied".into());
    }
    let native = host.capture().clone();
    tauri::async_runtime::spawn_blocking(move || {
        native.call("main", &request).map_err(str::to_owned)
    })
    .await
    .map_err(|_| "worker_failed".to_owned())?
}
