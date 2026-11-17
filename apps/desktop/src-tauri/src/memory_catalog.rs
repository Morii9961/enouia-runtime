//! Opt-in synthetic segmented read-2. Independent of Workspace v1/read-1.
mod fixture;
use enouia_memory_contract::{
    common::{ActorRef, Sensitivity, SourceRevisionRef},
    error::Violation,
    ids::{MemoryId, OperationId},
    json::{Revision, canonical_bytes},
    next::*,
};
use enouia_memory_host::automation::{
    application::ApplicationFault,
    catalog::{CatalogReadOptions, CatalogReadRequest},
};
use enouia_memory_vault::automation::AutomationFault;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::path::PathBuf;
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicBool, Ordering},
};

#[derive(Clone, Default)]
pub struct NativeCatalog(Arc<Inner>);
#[derive(Default)]
struct Inner {
    requested: AtomicBool,
    owner_requested: AtomicBool,
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
    library: Option<Library>,
    reason: Option<&'static str>,
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
    Detail {
        filter: CatalogFilter,
        memory_id: MemoryId,
    },
    Source {
        source: SourceRevisionRef,
        start: u32,
        limit: u32,
    },
    Lock,
    Unlock,
}
struct Library {
    reader: enouia_memory_host::automation::catalog::SegmentedMemoryReader,
    profile: AttentionProfile,
    system: ActorRef,
    _root: PathBuf,
    _lease: Option<crate::root_lease::RootLease>,
}

/// Only the native process launch supplies this binding; no page operation opens it.
pub struct OwnerLaunch {
    pub home: PathBuf,
    pub operation: OperationId,
}
pub fn owner_launch(args: &[String]) -> Option<Result<OwnerLaunch, &'static str>> {
    if !args.iter().any(|arg| arg.starts_with("--memory-owner")) {
        return None;
    }
    let mut home = None;
    let mut operation = None;
    let mut readonly = false;
    let mut values = args.iter();
    while let Some(arg) = values.next() {
        match arg.as_str() {
            "--memory-owner-readonly" if !readonly => readonly = true,
            "--memory-owner-home" if home.is_none() => {
                let Some(value) = values.next() else {
                    return Some(Err("catalog_owner_launch_invalid"));
                };
                let path = PathBuf::from(value);
                if !path.is_absolute() {
                    return Some(Err("catalog_owner_launch_invalid"));
                }
                home = Some(path);
            }
            "--memory-owner-operation" if operation.is_none() => {
                let Some(value) = values.next() else {
                    return Some(Err("catalog_owner_launch_invalid"));
                };
                let Ok(parsed) = OperationId::parse(value) else {
                    return Some(Err("catalog_owner_launch_invalid"));
                };
                operation = Some(parsed);
            }
            "--memory-owner-readonly"
            | "--memory-owner-home"
            | "--memory-owner-operation"
            | "--memory-vault"
            | "--memory-synthetic"
            | "--memory-catalog-synthetic"
            | "--memory-capture-synthetic" => return Some(Err("catalog_owner_launch_invalid")),
            value if value.starts_with("--memory-owner") => {
                return Some(Err("catalog_owner_launch_invalid"));
            }
            _ => {}
        }
    }
    Some(match (readonly, home, operation) {
        (true, Some(home), Some(operation)) => Ok(OwnerLaunch { home, operation }),
        _ => Err("catalog_owner_launch_invalid"),
    })
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
    fn status(&self, phase: &str) -> Value {
        json!({"schema_version":2,"kind":"runtime_memory_catalog_status","capability":"memory-native-read-2",
            "effect":"native_read","mode":if self.registered_owner_mode() { "registered_owner_readonly" } else { "synthetic_segmented_only" },
            "state":phase,"available":phase=="open"})
    }
    pub fn registered_owner_mode(&self) -> bool {
        self.0.owner_requested.load(Ordering::SeqCst)
    }
    pub fn request_owner_mode(&self) {
        self.0.owner_requested.store(true, Ordering::SeqCst);
        self.0.requested.store(true, Ordering::SeqCst);
    }
    pub fn initialize_registered(
        &self,
        launch: Result<OwnerLaunch, &'static str>,
    ) -> Result<(), &'static str> {
        self.request_owner_mode();
        self.initialize_with(|stop| {
            let launch = launch?;
            let (root, descriptor) =
                enouia_memory_host::owner_bootstrap::registered_owner_root(&launch.home, &launch.operation)
                    .map_err(|_| "catalog_owner_authentication_failed")?;
            if stop.load(Ordering::SeqCst) {
                return Err("catalog_locked");
            }
            let lease = crate::root_lease::RootLease::acquire(
                crate::root_lease::Directory::inspect(root.path())?,
            )?;
            let vault = Arc::new(
                enouia_memory_vault::automation::segmented::SegmentedAutomationVault::open(
                    &root,
                    descriptor.host_id,
                    Arc::new(enouia_memory_vault::SystemClock),
                    Arc::new(enouia_memory_vault::OsIdSource),
                    enouia_memory_vault::fault::Faults::none(),
                ).map_err(|_| "catalog_owner_open_refused")?,
            );
            let reader = enouia_memory_host::automation::catalog::SegmentedMemoryReader::from_authenticated_system(
                vault, descriptor.system_actor.clone(),
            ).map_err(fault)?;
            Ok(Library {
                reader,
                system: descriptor.system_actor,
                _root: root.path().to_path_buf(),
                _lease: Some(lease),
                profile: AttentionProfile {
                    schema_version: NextVersion,
                    kind: AttentionProfileKind::AttentionProfile,
                    revision: Revision::new(1).unwrap(),
                    algorithm: AttentionAlgorithm::V1,
                    fade_after_days: 30,
                    archive_after_days: 180,
                    protected_forms: vec![FormationKind::Episode, FormationKind::RelationshipExperience],
                    protected_ids: vec![],
                    aliases: vec![],
                    max_items: 32,
                    max_bytes: 65536,
                    maintenance_interval_ms: 1000,
                },
            })
        })
    }

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
        create: impl FnOnce(&AtomicBool) -> Result<Library, &'static str>,
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
                state.library = Some(fixture);
                Ok(())
            }
            Err(error) => {
                state.failed = true;
                state.reason = Some(error);
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
        if let Ok(mut state) = self.0.state.lock() {
            if self.registered_owner_mode() {
                // Drop the reader before its directory lease. Reopening requires
                // another explicit trusted native invocation, never a page unlock.
                drop(state.library.take());
            } else if let Some(library) = &state.library {
                let _ = library.reader.lock();
            }
        }
    }
    pub fn shutdown(&self) {
        self.begin_close();
        let fixture = self
            .0
            .state
            .lock()
            .ok()
            .and_then(|mut state| state.library.take());
        drop(fixture);
    }
    // Match read-1's bounded observation wait: status polling and an explicit
    // page/detail read can contend on this binding. Never replay controls.
    fn call_waiting(&self, window: &str, value: &Value) -> Result<Value, &'static str> {
        let read = matches!(
            value["query"]["operation"].as_str(),
            Some("status" | "page" | "stats" | "detail" | "source")
        );
        let until = std::time::Instant::now() + std::time::Duration::from_secs(2);
        loop {
            match self.call(window, value) {
                Err("catalog_busy") if read && std::time::Instant::now() < until => {
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
                Ok(self.status("closing"))
            } else {
                Err("runtime_closing")
            };
        }
        if self.0.unavailable.load(Ordering::SeqCst) {
            return if is_status {
                Ok(self.status("failed"))
            } else {
                Err("catalog_read_refused")
            };
        }
        if matches!(request.query, CatalogQuery::Lock) {
            if !self.enabled() {
                return Err("catalog_not_enabled");
            }
            self.lock();
            let mut view = self.status("locked");
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
            } else if state.library.is_some() {
                "open"
            } else {
                "disabled"
            };
            let mut view = self.status(phase);
            if let Some(reason) = state.reason {
                view["reason"] = json!(reason);
            }
            if phase == "open" {
                let fixture = state.library.as_ref().ok_or("catalog_not_enabled")?;
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
                    return Ok(self.status("closing"));
                }
                if self.0.withdrawn.load(Ordering::SeqCst) {
                    return Ok(self.status("locked"));
                }
                view["selection"] =
                    serde_json::to_value(page.selection).map_err(|_| "catalog_read_refused")?;
            }
            return Ok(view);
        }
        if matches!(request.query, CatalogQuery::Unlock) && self.registered_owner_mode() {
            return Err("catalog_owner_reopen_required");
        }
        if self.0.withdrawn.load(Ordering::SeqCst) && !matches!(request.query, CatalogQuery::Unlock)
        {
            return Err("catalog_locked");
        }
        let fixture = state.library.as_ref().ok_or("catalog_not_enabled")?;
        if matches!(request.query, CatalogQuery::Unlock) {
            fixture.reader.unlock(&fixture.system).map_err(fault)?;
            self.0.withdrawn.store(false, Ordering::SeqCst);
            let mut view = self.status("open");
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
            CatalogQuery::Detail { filter, memory_id } => serde_json::to_value(
                fixture
                    .reader
                    .memory_detail_native(
                        &CatalogReadRequest {
                            profile: &fixture.profile,
                            filter: &filter,
                            options: CatalogReadOptions {
                                limit: 32,
                                max_bytes: MAX_DOCUMENT_BYTES,
                                max_sensitivity: Sensitivity::Private,
                                include_facets: false,
                            },
                        },
                        &memory_id,
                        None,
                    )
                    .map_err(fault)?,
            ),
            CatalogQuery::Source {
                source,
                start,
                limit,
            } => serde_json::to_value(
                fixture
                    .reader
                    .memory_source_excerpt_native(
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
                        &source,
                        start,
                        limit,
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
        native.call_waiting("main", &request).map_err(str::to_owned)
    })
    .await
    .map_err(|_| "worker_failed".to_owned())?
}
