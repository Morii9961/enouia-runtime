//! Runtime's opt-in synthetic Memory adapter. No v1 reinterpretation or model IO.
mod fixture;
use enouia_memory_contract::{
    common::Sensitivity, error::Violation, ids::MemoryId, json::canonical_bytes, next::*,
};
use enouia_memory_host::automation::application::ApplicationFault;
use enouia_memory_vault::automation::AutomationFault;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicBool, Ordering},
};

#[derive(Clone, Default)]
pub struct NativeAutomation(Arc<Inner>);
#[derive(Default)]
struct Inner {
    closing: AtomicBool,
    enabled: AtomicBool,
    mode_requested: AtomicBool,
    init_stop: AtomicBool,
    unavailable: AtomicBool,
    state: Mutex<Binding>,
}
#[derive(Default)]
struct Binding {
    initializing: bool,
    failed: bool,
    locked: bool,
    fixture: Option<fixture::Fixture>,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct AutomationRequest {
    schema_version: NextVersion,
    capability: MemoryReadCapability,
    query: AutomationQuery,
}
impl NextDocument for AutomationRequest {
    fn validate(&self) -> Vec<Violation> {
        vec![]
    }
}
#[derive(Serialize, Deserialize)]
#[serde(tag = "operation", rename_all = "snake_case", deny_unknown_fields)]
enum AutomationQuery {
    Status,
    Page {
        filter: MemoryReadFilter,
        cursor: Option<MemoryReadCursor>,
        limit: usize,
    },
    Detail {
        memory_id: MemoryId,
        expected: Option<SnapshotBinding>,
        include_source_text: bool,
    },
    Simulate {
        query: NativeRecallQuery,
    },
    Lock,
    Unlock,
}
// Transport shape belongs to this native adapter; Core recall stays a Rust API.
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct NativeRecallQuery {
    text: String,
    conditions: Vec<String>,
    event_window: Option<FormationTime>,
    at: enouia_memory_contract::time::Timestamp,
    intent: NativeRecallIntent,
    limit: usize,
    max_bytes: usize,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum NativeRecallIntent {
    Current,
    Historical,
    Browse,
}
impl NativeRecallQuery {
    fn into_core(self) -> RecallQuery {
        RecallQuery {
            text: self.text,
            conditions: self.conditions,
            event_window: self.event_window,
            at: self.at,
            intent: match self.intent {
                NativeRecallIntent::Current => RecallIntent::Current,
                NativeRecallIntent::Historical => RecallIntent::Historical,
                NativeRecallIntent::Browse => RecallIntent::Browse,
            },
            limit: self.limit,
            max_bytes: self.max_bytes,
        }
    }
}
fn fault(error: ApplicationFault) -> &'static str {
    match error {
        ApplicationFault::Locked => "automation_locked",
        ApplicationFault::Vault(AutomationFault::Stale) => "automation_stale",
        ApplicationFault::Vault(AutomationFault::Busy) => "automation_busy",
        _ => "automation_read_refused",
    }
}
fn status(phase: &str) -> Value {
    json!({"schema_version": 2, "kind": "runtime_memory_automation_status", "capability": "memory-native-read-1",
        "effect": "native_read", "mode": "synthetic_only", "state": phase,
        "available": phase == "open", "capabilities": MemoryReadCapabilities::native()})
}
impl NativeAutomation {
    /// Called only by the native startup flag, on a blocking worker. No page
    /// can enable this, choose a root/principal/profile, or create a memory.
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
        if self.0.unavailable.load(Ordering::SeqCst) || self.0.init_stop.load(Ordering::SeqCst) {
            return Err("automation_locked");
        }
        self.request_synthetic_mode();
        if self.0.enabled.swap(true, Ordering::SeqCst) {
            return Err("automation_busy");
        }
        self.0
            .state
            .lock()
            .map_err(|_| "automation_busy")?
            .initializing = true;
        let result = create(&self.0.init_stop);
        let mut state = self.0.state.lock().map_err(|_| "automation_busy")?;
        state.initializing = false;
        if self.0.closing.load(Ordering::SeqCst) || self.0.init_stop.load(Ordering::SeqCst) {
            state.failed = true;
            let error = if self.0.closing.load(Ordering::SeqCst) {
                "runtime_closing"
            } else {
                "automation_locked"
            };
            drop(state);
            drop(result);
            return Err(error);
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
    pub fn enabled(&self) -> bool {
        self.0.mode_requested.load(Ordering::SeqCst)
    }
    pub fn request_synthetic_mode(&self) {
        self.0.mode_requested.store(true, Ordering::SeqCst);
    }
    pub fn begin_close(&self) {
        self.0.closing.store(true, Ordering::SeqCst);
        self.0.init_stop.store(true, Ordering::SeqCst);
    }
    pub fn close_failed(&self) {
        self.0.unavailable.store(true, Ordering::SeqCst);
        self.0.closing.store(false, Ordering::SeqCst);
        if let Ok(state) = self.0.state.try_lock()
            && let Some(fixture) = &state.fixture
            && let Some(worker) = &fixture.maintenance
        {
            worker.cancel();
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
        // Joins are outside the binding mutex and always on a native worker.
        drop(fixture);
    }
    /// Native tray/global Vault lock also withdraws the synthetic reader.
    pub fn lock(&self) {
        self.0.init_stop.store(true, Ordering::SeqCst);
        if let Ok(mut state) = self.0.state.lock() {
            if let Some(fixture) = state.fixture.as_mut() {
                let _ = fixture.host.lock();
                if let Some(worker) = fixture.maintenance.take() {
                    let _ = worker.join();
                }
            }
            state.locked = true;
        }
    }
    /// Busy means no observation was produced. Re-enter the full native gate
    /// on each attempt, without holding the binding or a Vault writer lock.
    /// The two-second bound covers measured subsecond authorization reads;
    /// controls and every other error return once, without replay.
    fn call_waiting(&self, window: &str, value: &Value) -> Result<Value, &'static str> {
        let read = matches!(
            value["query"]["operation"].as_str(),
            Some("status" | "page" | "detail" | "simulate")
        );
        let until = std::time::Instant::now() + std::time::Duration::from_secs(2);
        loop {
            match self.call(window, value) {
                Err("automation_busy") if read && std::time::Instant::now() < until => {
                    std::thread::sleep(std::time::Duration::from_millis(20));
                }
                result => return result,
            }
        }
    }
    pub fn call(&self, window: &str, value: &Value) -> Result<Value, &'static str> {
        if window != "main" {
            return Err("permission_denied");
        }
        // Refuse version/capability before decoding any operation or reading a root.
        if value["schema_version"].as_u64() != Some(2)
            || value["capability"] != "memory-native-read-1"
        {
            return Err("automation_version_unsupported");
        }
        let bytes = canonical_bytes(value).map_err(|_| "automation_invalid_request")?;
        let request = parse_document::<AutomationRequest>(&bytes)
            .map_err(|_| "automation_invalid_request")?;
        if self.0.closing.load(Ordering::SeqCst) {
            return if matches!(request.query, AutomationQuery::Status) {
                Ok(status("closing"))
            } else {
                Err("runtime_closing")
            };
        }
        if self.0.unavailable.load(Ordering::SeqCst) {
            return if matches!(request.query, AutomationQuery::Status) {
                Ok(status("failed"))
            } else {
                Err("automation_read_refused")
            };
        }
        // A lock is a withdrawal barrier, not a best-effort observation. Signal
        // bootstrap cancellation before waiting for the current bounded read.
        if matches!(request.query, AutomationQuery::Lock) {
            if !self.enabled() {
                return Err("automation_not_enabled");
            }
            self.lock();
            let mut view = status("locked");
            view["effect"] = json!("native_control");
            return Ok(view);
        }
        let mut state = self.0.state.try_lock().map_err(|_| "automation_busy")?;
        if matches!(request.query, AutomationQuery::Status) {
            let phase = if !self.0.enabled.load(Ordering::SeqCst) {
                "disabled"
            } else if state.initializing {
                "initializing"
            } else if state.failed {
                "failed"
            } else if state.locked {
                "locked"
            } else if state.fixture.is_some() {
                "open"
            } else {
                "disabled"
            };
            let mut view = status(phase);
            if phase == "open" {
                let fixture = state.fixture.as_ref().ok_or("automation_not_enabled")?;
                let page = fixture
                    .host
                    .memory_page_native(
                        &fixture.profile,
                        &MemoryReadFilter::default(),
                        None,
                        1,
                        MAX_DOCUMENT_BYTES,
                        Sensitivity::Private,
                    )
                    .map_err(fault)?;
                view["snapshot"] =
                    serde_json::to_value(page.snapshot).map_err(|_| "automation_read_refused")?;
                view["authorized_at"] = serde_json::to_value(page.authorized_at)
                    .map_err(|_| "automation_read_refused")?;
            }
            return Ok(view);
        }

        let locked = state.locked;
        let fixture = state.fixture.as_mut().ok_or("automation_not_enabled")?;
        if matches!(request.query, AutomationQuery::Unlock) {
            fixture.host.unlock(&fixture.system).map_err(fault)?;
            if fixture.maintenance.is_none() {
                fixture.maintenance = Some(
                    fixture
                        .host
                        .start_maintenance(fixture.profile.clone())
                        .map_err(fault)?,
                );
            }
            state.locked = false;
            let mut view = status("open");
            view["effect"] = json!("native_control");
            return Ok(view);
        }
        if locked {
            return Err("automation_locked");
        }
        let result = match request.query {
            AutomationQuery::Page {
                filter,
                cursor,
                limit,
            } => serde_json::to_value(
                fixture
                    .host
                    .memory_page_native(
                        &fixture.profile,
                        &filter,
                        cursor.as_ref(),
                        limit,
                        MAX_DOCUMENT_BYTES,
                        Sensitivity::Private,
                    )
                    .map_err(fault)?,
            ),
            AutomationQuery::Detail {
                memory_id,
                expected,
                include_source_text,
            } => match fixture
                .host
                .memory_detail_native(
                    &fixture.profile,
                    &memory_id,
                    expected.as_ref(),
                    include_source_text,
                    MAX_DOCUMENT_BYTES,
                    Sensitivity::Private,
                )
                .map_err(fault)?
            {
                Some(detail) => serde_json::to_value(detail),
                None => Ok(
                    json!({"schema_version": 2, "kind": "automation_memory_absent", "capability": "memory-native-read-1", "effect": "native_read"}),
                ),
            },
            AutomationQuery::Simulate { query } => serde_json::to_value(
                fixture
                    .host
                    .simulate_native_recall(
                        &fixture.profile,
                        &query.into_core(),
                        Sensitivity::Private,
                    )
                    .map_err(fault)?,
            ),
            _ => return Err("automation_invalid_request"),
        };
        result.map_err(|_| "automation_read_refused")
    }
}
#[tauri::command]
pub async fn memory_automation(
    window: tauri::WebviewWindow,
    host: tauri::State<'_, crate::memory::MemoryHost>,
    request: Value,
) -> Result<Value, String> {
    if window.label() != "main" {
        return Err("permission_denied".into());
    }
    let host = host.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        host.automation()
            .call_waiting("main", &request)
            .map_err(str::to_owned)
    })
    .await
    .map_err(|_| "worker_failed".to_owned())?
}

#[cfg(test)]
mod tests {
    use super::*;
    fn packet(query: Value) -> Value {
        json!({"schema_version": 2, "capability": "memory-native-read-1", "query": query})
    }
    fn observe(native: &NativeAutomation, query: Value) -> Value {
        assert!(matches!(
            query["operation"].as_str(),
            Some("page" | "detail" | "simulate" | "status")
        ));
        native.call_waiting("main", &packet(query)).unwrap()
    }
    #[test]
    fn observation_wait_is_bounded_and_rechecks_close_instead_of_replaying_controls() {
        let native = NativeAutomation::default();
        let guard = native.0.state.lock().unwrap();
        let reader = native.clone();
        let task = std::thread::spawn(move || {
            reader.call_waiting("main", &packet(json!({"operation":"status"})))
        });
        // A pending read must still observe the close barrier after contention.
        native.begin_close();
        drop(guard);
        assert_eq!(task.join().unwrap().unwrap()["state"], "closing");
        let native = NativeAutomation::default();
        let guard = native.0.state.lock().unwrap();
        let start = std::time::Instant::now();
        assert_eq!(
            native.call_waiting("main", &packet(json!({"operation":"unlock"}))),
            Err("automation_busy")
        );
        assert!(start.elapsed() < std::time::Duration::from_secs(1));
        assert_eq!(
            native.call_waiting("main", &packet(json!({"operation":"status"}))),
            Err("automation_busy")
        );
        assert!(start.elapsed() < std::time::Duration::from_secs(4));
        drop(guard);
        assert_eq!(
            observe(&native, json!({"operation":"status"}))["state"],
            "disabled"
        );
    }
    #[test]
    fn lock_packet_withdraws_before_waiting_for_an_inflight_observation() {
        let native = NativeAutomation::default();
        native.request_synthetic_mode();
        let guard = native.0.state.lock().unwrap();
        let control = native.clone();
        let task = std::thread::spawn(move || {
            control.call_waiting("main", &packet(json!({"operation":"lock"})))
        });
        let until = std::time::Instant::now() + std::time::Duration::from_secs(2);
        while !native.0.init_stop.load(Ordering::SeqCst) {
            assert!(std::time::Instant::now() < until);
            std::thread::yield_now();
        }
        drop(guard);
        assert_eq!(task.join().unwrap().unwrap()["state"], "locked");
        assert!(native.0.state.lock().unwrap().locked);
    }
    #[test]
    fn version_scope_and_request_fields_are_refused_before_any_binding() {
        let native = NativeAutomation::default();
        assert_eq!(native.call("overlay", &json!({})), Err("permission_denied"));
        let mut request = packet(json!({"operation": "status"}));
        assert_eq!(native.call("main", &request).unwrap()["state"], "disabled");
        request["schema_version"] = 99.into();
        assert_eq!(
            native.call("main", &request),
            Err("automation_version_unsupported")
        );
        let mut request = packet(json!({"operation": "status"}));
        request["root"] = "forbidden path field".into();
        assert_eq!(
            native.call("main", &request),
            Err("automation_invalid_request")
        );
    }
    #[test]
    fn native_fixture_reads_receipts_history_sources_and_simulation_then_locks_and_shuts_down() {
        let native = NativeAutomation::default();
        native.initialize_synthetic().unwrap();
        let page = observe(
            &native,
            json!({"operation": "page", "filter": MemoryReadFilter::default(), "cursor": null, "limit": 2}),
        );
        assert_eq!(page["items"].as_array().unwrap().len(), 2);
        assert_eq!(page["matched_in_scope"], 3);
        let parsed = parse_document::<MemoryReadPage>(&canonical_bytes(&page).unwrap()).unwrap();
        assert!(parsed.items.iter().all(|i| i.system_actor.actor_type
            == enouia_memory_contract::common::ActorType::System
            && i.receipt.is_some()));
        let id = parsed.items[0].memory.memory_id.clone();
        let detail = observe(
            &native,
            json!({"operation": "detail", "memory_id": id, "expected": parsed.snapshot, "include_source_text": true}),
        );
        assert!(parse_document::<MemoryReadDetail>(&canonical_bytes(&detail).unwrap()).is_ok());
        let (now, current, root) = {
            let state = native.0.state.lock().unwrap();
            let f = state.fixture.as_ref().unwrap();
            (
                f.host.inspect_native().unwrap().created_at.clone(),
                std::fs::read(f._root.join("data/vault/CURRENT")).unwrap(),
                f._root.clone(),
            )
        };
        let query = NativeRecallQuery {
            text: "ceramics".into(),
            conditions: vec![],
            event_window: None,
            at: now,
            intent: NativeRecallIntent::Current,
            limit: 8,
            max_bytes: 16384,
        };
        let simulation = observe(&native, json!({"operation": "simulate", "query": query}));
        assert_eq!(simulation["effect"], "native_read");
        assert!(
            parse_document::<MemoryReadSimulation>(&canonical_bytes(&simulation).unwrap()).is_ok()
        );
        assert_eq!(
            std::fs::read(root.join("data/vault/CURRENT")).unwrap(),
            current
        );
        native.lock();
        assert_eq!(
            native
                .call("main", &packet(json!({"operation": "status"})))
                .unwrap()["state"],
            "locked"
        );
        assert_eq!(native.call("main", &packet(json!({"operation": "page", "filter": MemoryReadFilter::default(), "cursor": null, "limit": 2}))), Err("automation_locked"));
        native
            .call("main", &packet(json!({"operation": "unlock"})))
            .unwrap();
        native.shutdown();
        assert_eq!(
            native
                .call("main", &packet(json!({"operation": "status"})))
                .unwrap()["state"],
            "closing"
        );
        // Root/leases are released; no legacy Workspace silently adopts V2.
        assert!(
            enouia_memory_workspace::Workspace::new(enouia_memory_workspace::Config::default())
                .open_root(&root.join("data"))
                .is_err()
        );
        assert_eq!(
            std::fs::read(root.join("data/vault/CURRENT")).unwrap(),
            current
        );
    }
    #[test]
    fn lock_before_bootstrap_and_failed_exit_do_not_late_open_a_root() {
        let native = NativeAutomation::default();
        native.lock();
        assert_eq!(native.initialize_synthetic(), Err("automation_locked"));
        assert!(native.0.state.lock().unwrap().fixture.is_none());
        native.close_failed();
        assert_eq!(
            native
                .call("main", &packet(json!({"operation": "status"})))
                .unwrap()["state"],
            "failed"
        );
    }
    #[test]
    fn lock_or_exit_between_construction_and_binding_discards_the_unpublished_root() {
        for close in [false, true] {
            let native = NativeAutomation::default();
            let worker = native.clone();
            let (ready_tx, ready_rx) = std::sync::mpsc::channel();
            let (release_tx, release_rx) = std::sync::mpsc::channel();
            let task = std::thread::spawn(move || {
                worker.initialize_with(|stop| {
                    let fixture = fixture::create(stop)?;
                    ready_tx.send(()).unwrap();
                    release_rx
                        .recv_timeout(std::time::Duration::from_secs(10))
                        .unwrap();
                    Ok(fixture)
                })
            });
            ready_rx
                .recv_timeout(std::time::Duration::from_secs(10))
                .unwrap();
            if close {
                native.begin_close();
            } else {
                native.lock();
            }
            release_tx.send(()).unwrap();
            assert_eq!(
                task.join().unwrap(),
                Err(if close {
                    "runtime_closing"
                } else {
                    "automation_locked"
                })
            );
            assert!(native.0.state.lock().unwrap().fixture.is_none());
        }
    }
    #[test]
    fn close_before_bootstrap_does_not_create_a_synthetic_binding() {
        let native = NativeAutomation::default();
        native.begin_close();
        assert_eq!(native.initialize_synthetic(), Err("runtime_closing"));
        assert!(native.0.state.lock().unwrap().fixture.is_none());
    }
}
