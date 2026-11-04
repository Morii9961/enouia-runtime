//! Opt-in synthetic segmented read-2. Independent of Workspace v1/read-1.
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

#[derive(Clone, Default)]
pub struct NativeCatalog(Arc<Inner>);
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
#[path = "memory_catalog/tests.rs"]
mod tests;
#[derive(Default)]
struct Binding {
    initializing: bool,
    failed: bool,
    fixture: Option<fixture::Fixture>,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct CatalogRequest {
    schema_version: NextVersion,
    capability: CatalogCapability,
    query: CatalogQuery,
}
impl NextDocument for CatalogRequest {
    fn validate(&self) -> Vec<Violation> {
        vec![]
    }
}
#[derive(Serialize, Deserialize)]
#[serde(tag = "operation", rename_all = "snake_case", deny_unknown_fields)]
enum CatalogQuery {
    Status,
    Page {
        filter: CatalogFilter,
        cursor: Option<CatalogCursor>,
        limit: usize,
    },
    Stats {
        filter: CatalogFilter,
        selection: CatalogSelection,
    },
    Lock,
    Unlock,
}
fn status(phase: &str) -> Value {
    json!({"schema_version":2,"kind":"runtime_memory_catalog_status","capability":"memory-native-read-2",
        "effect":"native_read","mode":"synthetic_segmented_only","state":phase,"available":phase=="open"})
}
fn fault(error: ApplicationFault) -> &'static str {
    match error {
        ApplicationFault::Locked => "catalog_locked",
        ApplicationFault::Vault(AutomationFault::Stale) => "catalog_stale",
        ApplicationFault::Vault(AutomationFault::Busy) => "catalog_busy",
        _ => "catalog_read_refused",
    }
}
impl NativeCatalog {
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
            return Err("catalog_locked");
        }
        if self.0.started.swap(true, Ordering::SeqCst) {
            return Err("catalog_busy");
        }
        self.request_synthetic_mode();
        self.0
            .state
            .lock()
            .map_err(|_| "catalog_busy")?
            .initializing = true;
        let result = create(&self.0.withdrawn);
        let mut state = self.0.state.lock().map_err(|_| "catalog_busy")?;
        state.initializing = false;
        if self.0.closing.load(Ordering::SeqCst) || self.0.withdrawn.load(Ordering::SeqCst) {
            state.failed = true;
            return Err(if self.0.closing.load(Ordering::SeqCst) {
                "runtime_closing"
            } else {
                "catalog_locked"
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
        self.0.withdrawn.store(true, Ordering::SeqCst);
    }
    pub fn close_failed(&self) {
        self.0.unavailable.store(true, Ordering::SeqCst);
        self.0.closing.store(false, Ordering::SeqCst);
    }
    pub fn lock(&self) {
        self.0.withdrawn.store(true, Ordering::SeqCst);
        if let Ok(state) = self.0.state.lock()
            && let Some(fixture) = &state.fixture
        {
            let _ = fixture.reader.lock();
        }
    }
    pub fn shutdown(&self) {
        self.begin_close();
        let fixture = self
            .0
            .state
            .lock()
            .ok()
            .and_then(|mut state| state.fixture.take());
        drop(fixture);
    }
    pub fn call(&self, window: &str, value: &Value) -> Result<Value, &'static str> {
        if window != "main" {
            return Err("permission_denied");
        }
        if value["schema_version"].as_u64() != Some(2)
            || value["capability"] != "memory-native-read-2"
        {
            return Err("catalog_version_unsupported");
        }
        let bytes = canonical_bytes(value).map_err(|_| "catalog_invalid_request")?;
        let request =
            parse_document::<CatalogRequest>(&bytes).map_err(|_| "catalog_invalid_request")?;
        let is_status = matches!(request.query, CatalogQuery::Status);
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
                Err("catalog_read_refused")
            };
        }
        if matches!(request.query, CatalogQuery::Lock) {
            if !self.enabled() {
                return Err("catalog_not_enabled");
            }
            self.lock();
            let mut view = status("locked");
            view["effect"] = json!("native_control");
            return Ok(view);
        }
        let state = self.0.state.try_lock().map_err(|_| "catalog_busy")?;
        if is_status {
            let phase = if !self.enabled() {
                "disabled"
            } else if state.initializing {
                "initializing"
            } else if state.failed {
                "failed"
            } else if self.0.withdrawn.load(Ordering::SeqCst) {
                "locked"
            } else if state.fixture.is_some() {
                "open"
            } else {
                "disabled"
            };
            let mut view = status(phase);
            if phase == "open" {
                let fixture = state.fixture.as_ref().ok_or("catalog_not_enabled")?;
                let page = fixture
                    .reader
                    .memory_page_native(
                        &CatalogReadRequest {
                            profile: &fixture.profile,
                            filter: &CatalogFilter::default(),
                            options: CatalogReadOptions {
                                limit: 1,
                                max_bytes: MAX_DOCUMENT_BYTES,
                                max_sensitivity: Sensitivity::Private,
                                include_facets: false,
                            },
                        },
                        None,
                    )
                    .map_err(fault)?;
                if self.0.closing.load(Ordering::SeqCst) {
                    return Ok(status("closing"));
                }
                if self.0.withdrawn.load(Ordering::SeqCst) {
                    return Ok(status("locked"));
                }
                view["selection"] =
                    serde_json::to_value(page.selection).map_err(|_| "catalog_read_refused")?;
            }
            return Ok(view);
        }
        let fixture = state.fixture.as_ref().ok_or("catalog_not_enabled")?;
        if matches!(request.query, CatalogQuery::Unlock) {
            fixture.reader.unlock(&fixture.system).map_err(fault)?;
            self.0.withdrawn.store(false, Ordering::SeqCst);
            let mut view = status("open");
            view["effect"] = json!("native_control");
            return Ok(view);
        }
        if self.0.withdrawn.load(Ordering::SeqCst) {
            return Err("catalog_locked");
        }
        let result = match request.query {
            CatalogQuery::Page {
                filter,
                cursor,
                limit,
            } => serde_json::to_value(
                fixture
                    .reader
                    .memory_page_native(
                        &CatalogReadRequest {
                            profile: &fixture.profile,
                            filter: &filter,
                            options: CatalogReadOptions {
                                limit,
                                max_bytes: MAX_DOCUMENT_BYTES,
                                max_sensitivity: Sensitivity::Private,
                                include_facets: false,
                            },
                        },
                        cursor.as_ref(),
                    )
                    .map_err(fault)?,
            ),
            CatalogQuery::Stats { filter, selection } => serde_json::to_value(
                fixture
                    .reader
                    .memory_stats_native(
                        &CatalogReadRequest {
                            profile: &fixture.profile,
                            filter: &filter,
                            options: CatalogReadOptions {
                                limit: 100,
                                max_bytes: MAX_DOCUMENT_BYTES,
                                max_sensitivity: Sensitivity::Private,
                                include_facets: false,
                            },
                        },
                        Some(&selection),
                    )
                    .map_err(fault)?,
            ),
            _ => return Err("catalog_invalid_request"),
        }
        .map_err(|_| "catalog_read_refused")?;
        // Lock/exit withdraw before waiting on this bounded read. Never publish
        // a result completed after that withdrawal was observed.
        if self.0.closing.load(Ordering::SeqCst) {
            return Err("runtime_closing");
        }
        if self.0.withdrawn.load(Ordering::SeqCst) {
            return Err("catalog_locked");
        }
        Ok(result)
    }
}
#[tauri::command]
pub async fn memory_catalog(
    window: tauri::WebviewWindow,
    host: tauri::State<'_, crate::memory::MemoryHost>,
    request: Value,
) -> Result<Value, String> {
    if window.label() != "main" {
        return Err("permission_denied".into());
    }
    let native = host.catalog().clone();
    tauri::async_runtime::spawn_blocking(move || {
        native.call("main", &request).map_err(str::to_owned)
    })
    .await
    .map_err(|_| "worker_failed".to_owned())?
}
