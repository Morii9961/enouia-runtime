//! Opt-in synthetic segmented read-2. Independent of Workspace v1/read-1.
mod fixture;
use enouia_memory_contract::{
    common::{ActorRef, Sensitivity, SourceRevisionRef, TrustedSurface},
    error::Violation,
    ids::{MemoryId, OperationId, SessionId},
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
    agents_file: Mutex<Option<PathBuf>>,
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
        #[serde(default)]
        facets: bool,
    },
    Stats {
        filter: CatalogFilter,
        selection: CatalogSelection,
    },
    Facets {
        filter: CatalogFilter,
        axis: CatalogFacetAxis,
        count_scope: FacetCountScope,
        cursor: Option<CatalogFacetCursor>,
        selection: Option<CatalogSelection>,
        limit: usize,
    },
    Detail {
        filter: CatalogFilter,
        memory_id: MemoryId,
        #[serde(default)]
        cursor: Option<HistoryCursor>,
    },
    Source {
        source: SourceRevisionRef,
        start: u32,
        limit: u32,
    },
    TimeBuckets {
        filter: CatalogFilter,
        query: TimeBucketQuery,
        selection: Option<CatalogSelection>,
    },
    ThemeMembers {
        filter: CatalogFilter,
        theme: MemoryId,
        cursor: Option<ThemeCursor>,
        limit: usize,
    },
    Graph {
        filter: CatalogFilter,
        query: GraphQuery,
        cursor: Option<GraphCursor>,
    },
    Activity {
        filter: CatalogFilter,
        query: ActivityQuery,
        cursor: Option<ActivityCursor>,
        limit: usize,
    },
    Changes {
        anchor: Option<ChangeAnchor>,
    },
    /// Memory ADR-MEM-164: derived fade/archive moments and time-based
    /// review suggestions (read only; nothing is recorded).
    AttentionSchedule {
        filter: CatalogFilter,
        query: enouia_memory_host::automation::catalog::attention_schedule::AttentionScheduleQuery,
        cursor: Option<
            enouia_memory_host::automation::catalog::attention_schedule::AttentionScheduleCursor,
        >,
        limit: usize,
    },
    ReviewSuggestions {
        filter: CatalogFilter,
        query: enouia_memory_host::automation::catalog::attention_schedule::ReviewQuery,
        limit: usize,
    },
    Neighbors {
        filter: CatalogFilter,
        memory_id: MemoryId,
        include_suggestions: bool,
        cursor: Option<NeighborCursor>,
        limit: usize,
    },
    Conflicts {
        filter: CatalogFilter,
        memory_id: MemoryId,
        cursor: Option<ConflictCursor>,
        limit: usize,
    },
    RevisionDiff {
        filter: CatalogFilter,
        memory_id: MemoryId,
        before: Revision,
        after: Revision,
    },
    Conversations {
        cursor: Option<ConversationCursor>,
        limit: usize,
    },
    ConversationDetail {
        conversation_id: SessionId,
        cursor: Option<ConversationTurnCursor>,
        limit: usize,
    },
    RecallPreview {
        query: RecallRequest,
    },
    /// ADR-039: plan one native correction. Writes no root data.
    PlanAction {
        action: OwnerAction,
        correction: Option<CorrectionRequest>,
    },
    /// ADR-039: the main window's confirm click on a shown plan. Never replayed.
    ConfirmAction {
        operation_id: OperationId,
        plan_hash: enouia_memory_contract::hash::Sha256Hex,
        effects_hash: enouia_memory_contract::hash::Sha256Hex,
    },
    ActionOutcome {
        operation_id: OperationId,
    },
    /// Memory ADR-MEM-158: the connector's open capture windows (read only).
    ConnectorStatus,
    /// ADR-041 local Agent grants: status, plan (writes nothing), confirm.
    AgentStatus,
    AgentPlan {
        agent: String,
        action: String,
    },
    AgentCommit {
        plan_id: String,
    },
    /// ADR-042 (D2): saved Agent correction and forget requests for Morii's
    /// desktop queue (read only), and the local "ignore" mark on one of them.
    AgentRequests,
    /// Memory ADR-MEM-173: saved Capsules (read only), Morii's local switch
    /// for saving them, and a planned save or delete (written on confirm).
    Capsules,
    CapsuleSaving {
        enabled: bool,
    },
    PlanCapsule {
        name: String,
        query: String,
        members: Vec<TargetRef>,
    },
    /// Memory ADR-MEM-172: identity groups of entity cards for Morii's review.
    EntityIdentities {
        limit: usize,
    },
    AgentRequestIgnore {
        key: String,
        ignored: bool,
    },
    Lock,
    Unlock,
}
/// What Morii confirms for a correction; dimensions come from the current record.
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct CorrectionRequest {
    title: String,
    content_lang: String,
    sensitivity: Sensitivity,
    interpretation: Interpretation,
}
/// Wire form of Core's `RecallQuery`, which has no serde derive.
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct RecallRequest {
    text: String,
    conditions: Vec<String>,
    event_window: Option<FormationTime>,
    at: enouia_memory_contract::time::Timestamp,
    intent: RecallIntentWire,
    limit: usize,
    max_bytes: usize,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum RecallIntentWire {
    Current,
    Historical,
    Browse,
}
struct Library {
    /// ADR-043 Agent pipe listeners; declared first so they stop before the
    /// vault and its lease are released.
    pipes: Mutex<Option<crate::memory_pipes::Pipes>>,
    reader: enouia_memory_host::automation::catalog::SegmentedMemoryReader,
    /// Present only for an authenticated Morii-layout root (ADR-039).
    owner: Option<enouia_memory_host::automation::owner::NativeMemoryOwner>,
    /// The opened root: Agent grants (ADR-041) and native test seeding use it.
    vault: Option<Arc<enouia_memory_vault::automation::segmented::SegmentedAutomationVault>>,
    agents: Option<crate::memory_agents::Agents>,
    profile: AttentionProfile,
    system: ActorRef,
    _root: PathBuf,
    _lease: Option<crate::root_lease::RootLease>,
}
impl Library {
    /// ADR-043: (re)start one pipe listener per locally named Agent. The old
    /// listeners stop first; Memory checks each grant on every connection.
    fn restart_pipes(&self) {
        let (Some(agents), Some(vault)) = (&self.agents, &self.vault) else {
            return;
        };
        let Ok(mut pipes) = self.pipes.lock() else {
            return;
        };
        *pipes = None;
        let named: Vec<_> = agents
            .local(vault)
            .into_values()
            .map(|a| (a.principal, a.grant_id))
            .collect();
        if !named.is_empty() {
            *pipes = Some(crate::memory_pipes::start(vault, &self.profile, named));
        }
    }
}
/// ADR-043: the bundled `enouia-memory-mcp` beside this executable, for the
/// MCP configuration Settings shows.
fn bridge() -> Value {
    let path = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|dir| dir.join("enouia-memory-mcp.exe")));
    json!({"path": path.as_ref().map(|p| p.display().to_string()),
        "present": path.is_some_and(|p| p.is_file()), "protocol": crate::memory_pipes::PROTOCOL})
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
/// Correction faults keep an unknown publication distinct: the page must
/// query the original operation, never plan or confirm it again.
fn action_fault(error: ApplicationFault) -> &'static str {
    match error {
        ApplicationFault::Vault(AutomationFault::OutcomeUnknown) => "correction_outcome_unknown",
        ApplicationFault::Vault(AutomationFault::Stale | AutomationFault::Conflict) => {
            "correction_stale"
        }
        ApplicationFault::Vault(AutomationFault::Capacity) => "correction_capacity",
        other => fault(other),
    }
}
impl NativeCatalog {
    fn status(&self, phase: &str) -> Value {
        json!({"schema_version":2,"kind":"runtime_memory_catalog_status","capability":"memory-native-read-2",
            "effect":"native_read","mode":if self.registered_owner_mode() { "registered_owner_readonly" } else { "synthetic_segmented_only" },
            "state":phase,"available":phase=="open"})
    }
    pub fn set_agents_file(&self, file: Option<PathBuf>) {
        if let Ok(mut slot) = self.0.agents_file.lock() {
            *slot = file;
        }
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
            // ADR-MEM-153: Morii's registered native entry reads every committed
            // policy revision, so ended formation windows no longer hide records.
            // Deletion, withdrawal, forget barriers and the ceiling still apply.
            // ADR-039: the same authenticated registration supplies the native
            // Morii principal; the page never names it.
            let owner = enouia_memory_host::automation::owner::NativeMemoryOwner::from_authenticated_owner(
                vault.clone(), descriptor.created_by.clone(),
            ).ok();
            let opened = vault.clone();
            let reader = enouia_memory_host::automation::catalog::SegmentedMemoryReader::from_authenticated_system_full_history(
                vault, descriptor.system_actor.clone(),
            ).map_err(fault)?;
            let library = Library {
                pipes: Mutex::new(None),
                reader,
                agents: owner.as_ref().map(|_| crate::memory_agents::Agents::new(
                    self.0.agents_file.lock().ok().and_then(|f| f.clone()),
                )),
                owner,
                vault: Some(opened),
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
            };
            library.restart_pipes();
            Ok(library)
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
                // ADR-043: no Agent connection outlives a lock.
                if let Ok(mut pipes) = library.pipes.lock() {
                    *pipes = None;
                }
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
        let read = !matches!(
            value["query"]["operation"].as_str(),
            Some(
                "lock"
                    | "unlock"
                    | "plan_action"
                    | "confirm_action"
                    | "agent_plan"
                    | "agent_commit"
                    | "agent_request_ignore"
                    | "capsule_saving"
                    | "plan_capsule"
            ) | None
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
    /// Quick Search in the registered entry: a bounded literal page of the same
    /// catalog, trimmed for the overlay. The overlay never receives cursors,
    /// selections or controls.
    pub fn search(&self, text: &str) -> Result<Value, &'static str> {
        let filter = CatalogFilter {
            text: text.to_owned(),
            ..CatalogFilter::default()
        };
        let page = self.call_waiting(
            "main",
            &json!({"schema_version":2,"capability":"memory-native-read-2",
                "query":{"operation":"page","filter":filter,"cursor":null,"limit":8}}),
        )?;
        let items: Vec<Value> = page["items"]
            .as_array()
            .ok_or("catalog_read_refused")?
            .iter()
            .map(|item| {
                let content = item["base"]["content"].as_str().unwrap_or("");
                json!({
                    "memoryId": item["base"]["memory"]["memory_id"],
                    "title": item["title"],
                    "snippet": content.chars().take(160).collect::<String>(),
                    "truncated": content.chars().count() > 160,
                })
            })
            .collect();
        Ok(json!({"kind":"memory_result","result":{
            "kind":"registered_catalog_search","items":items,
            "matched": page["matched_in_scope"],"authorizedAt": page["authorized_at"]}}))
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
        // Morii authorized the registered Owner entry to read every sensitivity
        // (2026-11-19); the fixed synthetic entry keeps its Private ceiling.
        let ceiling = if self.registered_owner_mode() {
            Sensitivity::HighlySensitive
        } else {
            Sensitivity::Private
        };
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
                                max_sensitivity: ceiling,
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
                // The host owns the read-time attention profile; a recall preview
                // must stay within its item and byte bounds.
                view["recall_limits"] = json!({"max_items": fixture.profile.max_items, "max_bytes": fixture.profile.max_bytes});
                // ADR-039: whether this entry can plan and confirm native corrections.
                view["corrections"] = json!(fixture.owner.is_some());
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
            fixture.restart_pipes();
            self.0.withdrawn.store(false, Ordering::SeqCst);
            let mut view = self.status("open");
            view["effect"] = json!("native_control");
            return Ok(view);
        }
        if self.0.withdrawn.load(Ordering::SeqCst) {
            return Err("catalog_locked");
        }
        let reader = &fixture.reader;
        let request_for = |filter, limit| CatalogReadRequest {
            profile: &fixture.profile,
            filter,
            options: CatalogReadOptions {
                limit,
                max_bytes: MAX_DOCUMENT_BYTES,
                max_sensitivity: ceiling,
                include_facets: false,
            },
        };
        let all = CatalogFilter::default();
        let result = match request.query {
            CatalogQuery::Page {
                filter,
                cursor,
                limit,
                facets,
            } => {
                let mut request = request_for(&filter, limit);
                request.options.include_facets = facets;
                serde_json::to_value(
                    reader
                        .memory_page_native(&request, cursor.as_ref())
                        .map_err(fault)?,
                )
            }
            CatalogQuery::Stats { filter, selection } => serde_json::to_value(
                reader
                    .memory_stats_native(&request_for(&filter, 100), Some(&selection))
                    .map_err(fault)?,
            ),
            CatalogQuery::Facets {
                filter,
                axis,
                count_scope,
                cursor,
                selection,
                limit,
            } => serde_json::to_value(
                reader
                    .memory_facets_native(
                        &request_for(&filter, limit),
                        axis,
                        count_scope,
                        cursor.as_ref(),
                        selection.as_ref(),
                    )
                    .map_err(fault)?,
            ),
            CatalogQuery::Detail {
                filter,
                memory_id,
                cursor,
            } => serde_json::to_value(
                reader
                    .memory_detail_native(&request_for(&filter, 32), &memory_id, cursor.as_ref())
                    .map_err(fault)?,
            ),
            CatalogQuery::Source {
                source,
                start,
                limit,
            } => serde_json::to_value(
                reader
                    .memory_source_excerpt_native(&request_for(&all, 1), &source, start, limit)
                    .map_err(fault)?,
            ),
            CatalogQuery::TimeBuckets {
                filter,
                query,
                selection,
            } => serde_json::to_value(
                reader
                    .memory_time_buckets_native(
                        &request_for(&filter, 100),
                        &query,
                        selection.as_ref(),
                    )
                    .map_err(fault)?,
            ),
            CatalogQuery::ThemeMembers {
                filter,
                theme,
                cursor,
                limit,
            } => serde_json::to_value(
                reader
                    .memory_theme_members_native(
                        &request_for(&filter, limit),
                        &theme,
                        cursor.as_ref(),
                    )
                    .map_err(fault)?,
            ),
            CatalogQuery::Graph {
                filter,
                query,
                cursor,
            } => serde_json::to_value(
                reader
                    .memory_graph_native(&request_for(&filter, 100), &query, cursor.as_ref())
                    .map_err(fault)?,
            ),
            CatalogQuery::Activity {
                filter,
                query,
                cursor,
                limit,
            } => serde_json::to_value(
                reader
                    .memory_activity_feed_native(
                        &request_for(&filter, limit),
                        &query,
                        cursor.as_ref(),
                    )
                    .map_err(fault)?,
            ),
            CatalogQuery::AttentionSchedule {
                filter,
                query,
                cursor,
                limit,
            } => {
                // Core's ADR-MEM-164 documents carry no read envelope; add it.
                let mut value = serde_json::to_value(
                    reader
                        .memory_attention_schedule_native(
                            &request_for(&filter, limit),
                            &query,
                            cursor.as_ref(),
                        )
                        .map_err(fault)?,
                )
                .map_err(|_| "catalog_read_refused")?;
                value["schema_version"] = json!(2);
                value["capability"] = json!("memory-native-read-2");
                value["effect"] = json!("native_read");
                Ok(value)
            }
            CatalogQuery::ReviewSuggestions {
                filter,
                query,
                limit,
            } => {
                let mut value = serde_json::to_value(
                    reader
                        .memory_review_suggestions_native(&request_for(&filter, limit), &query)
                        .map_err(fault)?,
                )
                .map_err(|_| "catalog_read_refused")?;
                value["schema_version"] = json!(2);
                value["capability"] = json!("memory-native-read-2");
                value["effect"] = json!("native_read");
                Ok(value)
            }
            CatalogQuery::Changes { anchor } => serde_json::to_value(
                reader
                    .memory_changes_since_native(&request_for(&all, 100), anchor.as_ref())
                    .map_err(fault)?,
            ),
            CatalogQuery::Neighbors {
                filter,
                memory_id,
                include_suggestions,
                cursor,
                limit,
            } => serde_json::to_value(
                reader
                    .memory_neighbors_native(
                        &request_for(&filter, limit),
                        &memory_id,
                        include_suggestions,
                        cursor.as_ref(),
                    )
                    .map_err(fault)?,
            ),
            CatalogQuery::Conflicts {
                filter,
                memory_id,
                cursor,
                limit,
            } => serde_json::to_value(
                reader
                    .memory_conflicts_native(
                        &request_for(&filter, limit),
                        &memory_id,
                        cursor.as_ref(),
                    )
                    .map_err(fault)?,
            ),
            CatalogQuery::RevisionDiff {
                filter,
                memory_id,
                before,
                after,
            } => serde_json::to_value(
                reader
                    .memory_revision_diff_native(
                        &request_for(&filter, 1),
                        &memory_id,
                        before,
                        after,
                    )
                    .map_err(fault)?,
            ),
            CatalogQuery::Conversations { cursor, limit } => serde_json::to_value(
                reader
                    .memory_conversations_native(&request_for(&all, limit), cursor.as_ref())
                    .map_err(fault)?,
            ),
            CatalogQuery::ConversationDetail {
                conversation_id,
                cursor,
                limit,
            } => serde_json::to_value(
                reader
                    .memory_conversation_detail_native(
                        &request_for(&all, limit),
                        &conversation_id,
                        cursor.as_ref(),
                    )
                    .map_err(fault)?,
            ),
            // ADR-MEM-152: the same recall the Agent host runs, without a
            // Capsule, stored context or Agent enrollment. Runtime adds only
            // the read-2 envelope around Core's document.
            CatalogQuery::RecallPreview { query } => {
                let mut value = reader
                    .recall_preview_native(
                        &fixture.profile,
                        &RecallQuery {
                            text: query.text,
                            conditions: query.conditions,
                            event_window: query.event_window,
                            at: query.at,
                            intent: match query.intent {
                                RecallIntentWire::Current => RecallIntent::Current,
                                RecallIntentWire::Historical => RecallIntent::Historical,
                                RecallIntentWire::Browse => RecallIntent::Browse,
                            },
                            limit: query.limit,
                            max_bytes: query.max_bytes,
                        },
                        ceiling,
                    )
                    .map_err(fault)?;
                value["schema_version"] = json!(2);
                value["capability"] = json!("memory-native-read-2");
                value["kind"] = json!("native_recall_preview");
                Ok(value)
            }
            CatalogQuery::PlanAction { action, correction } => {
                let owner = fixture.owner.as_ref().ok_or("correction_unavailable")?;
                let metadata = match (&action, correction) {
                    (OwnerAction::Correct { target, .. }, Some(c)) => {
                        let detail = reader
                            .memory_detail_native(&request_for(&all, 1), &target.memory.memory_id, None)
                            .map_err(fault)?;
                        let mut dimensions = detail
                            .item
                            .ok_or("catalog_stale")?
                            .base
                            .dimensions;
                        // A literal correction starts a new revision of the same
                        // record: no inherited derivation, counter-source or time.
                        dimensions.change = FormationChange::Correction;
                        dimensions.event_time = None;
                        dimensions.valid_time = None;
                        dimensions.derived_from.clear();
                        dimensions.counter_sources.clear();
                        dimensions.reverts_to = None;
                        let unknown = RecordTime {
                            from: None,
                            until: None,
                            precision: RecordPrecision::Unknown,
                            bound: TimeBound::Within,
                            tz: None,
                            basis: TimeBasis::Unknown,
                        };
                        Some(OwnerCorrectionMetadata {
                            title: c.title,
                            content_lang: c.content_lang,
                            sensitivity: c.sensitivity,
                            interpretation: c.interpretation,
                            dimensions,
                            event_time: unknown.clone(),
                            valid_time: unknown,
                            entities: vec![],
                        })
                    }
                    (OwnerAction::Correct { .. }, None) => return Err("catalog_invalid_request"),
                    (_, Some(_)) => return Err("catalog_invalid_request"),
                    (_, None) => None,
                };
                let preview = owner.plan(action, ceiling, metadata).map_err(action_fault)?;
                let plan_hash = digest(&preview.plan);
                let mut value = serde_json::to_value(&preview).map_err(|_| "correction_refused")?;
                value["plan_hash"] = json!(plan_hash);
                value["schema_version"] = json!(2);
                value["capability"] = json!("memory-native-read-2");
                value["kind"] = json!("native_owner_preview");
                value["effect"] = json!("native_plan");
                Ok(value)
            }
            CatalogQuery::ConfirmAction {
                operation_id,
                plan_hash,
                effects_hash,
            } => {
                let owner = fixture.owner.as_ref().ok_or("correction_unavailable")?;
                let consent = owner
                    .confirm_from_owner_gesture(
                        &operation_id,
                        &plan_hash,
                        &effects_hash,
                        TrustedSurface::TrustedWindowsApp,
                    )
                    .map_err(action_fault)?;
                let outcome = owner.commit(consent).map_err(action_fault)?;
                let mut value = serde_json::to_value(&outcome).map_err(|_| "correction_refused")?;
                value["capability"] = json!("memory-native-read-2");
                value["effect"] = json!("native_write");
                Ok(value)
            }
            CatalogQuery::AgentStatus => {
                let (agents, vault) = fixture.agents.as_ref().zip(fixture.vault.as_ref()).ok_or("correction_unavailable")?;
                let mut value = agents.status(vault)?;
                value["bridge"] = bridge();
                value["schema_version"] = json!(2);
                value["capability"] = json!("memory-native-read-2");
                value["kind"] = json!("runtime_agent_grants");
                value["effect"] = json!("native_read");
                Ok(value)
            }
            CatalogQuery::AgentPlan { agent, action } => {
                let (agents, vault) = fixture.agents.as_ref().zip(fixture.vault.as_ref()).ok_or("correction_unavailable")?;
                // Reserved but uncaptured connector slots are not sources yet.
                let unused: Vec<_> = fixture
                    .owner
                    .as_ref()
                    .ok_or("correction_unavailable")?
                    .capture_windows()
                    .map_err(fault)?
                    .into_iter()
                    .flat_map(|w| w.unused_source_ids)
                    .collect();
                let now = enouia_memory_contract::foundation::Clock::now_unix_ms(&enouia_memory_vault::SystemClock);
                let mut value = agents.plan(vault, &unused, &agent, &action, now)?;
                value["schema_version"] = json!(2);
                value["capability"] = json!("memory-native-read-2");
                value["kind"] = json!("runtime_agent_grant_plan");
                value["effect"] = json!("native_plan");
                Ok(value)
            }
            CatalogQuery::AgentCommit { plan_id } => {
                let (agents, vault) = fixture.agents.as_ref().zip(fixture.vault.as_ref()).ok_or("correction_unavailable")?;
                let mut value = agents.commit(vault, &plan_id)?;
                // A new, renewed or revoked grant changes who may connect.
                fixture.restart_pipes();
                value["bridge"] = bridge();
                value["schema_version"] = json!(2);
                value["capability"] = json!("memory-native-read-2");
                value["kind"] = json!("runtime_agent_grants");
                value["effect"] = json!("native_write");
                Ok(value)
            }
            CatalogQuery::AgentRequests => {
                let (agents, vault) = fixture.agents.as_ref().zip(fixture.vault.as_ref()).ok_or("correction_unavailable")?;
                let owner = fixture.owner.as_ref().ok_or("correction_unavailable")?;
                let requests = owner.agent_requests(ceiling).map_err(fault)?;
                let mut value = agents.requests(vault, requests)?;
                value["schema_version"] = json!(2);
                value["capability"] = json!("memory-native-read-2");
                value["kind"] = json!("runtime_agent_requests");
                value["effect"] = json!("native_read");
                Ok(value)
            }
            CatalogQuery::Capsules => {
                let (agents, vault) = fixture.agents.as_ref().zip(fixture.vault.as_ref()).ok_or("correction_unavailable")?;
                let owner = fixture.owner.as_ref().ok_or("correction_unavailable")?;
                let saved = owner.capsules(ceiling).map_err(fault)?;
                let mut value = serde_json::to_value(&saved).map_err(|_| "catalog_read_refused")?;
                value["saving_enabled"] = json!(agents.capsule_saving(vault));
                value["schema_version"] = json!(2);
                value["capability"] = json!("memory-native-read-2");
                value["kind"] = json!("runtime_capsules");
                value["effect"] = json!("native_read");
                Ok(value)
            }
            CatalogQuery::CapsuleSaving { enabled } => {
                let (agents, vault) = fixture.agents.as_ref().zip(fixture.vault.as_ref()).ok_or("correction_unavailable")?;
                agents.set_capsule_saving(vault, enabled)?;
                Ok(json!({"schema_version":2,"capability":"memory-native-read-2","kind":"runtime_capsule_saving",
                    "effect":"local_write","saving_enabled":agents.capsule_saving(vault)}))
            }
            CatalogQuery::PlanCapsule { name, query, members } => {
                let (agents, vault) = fixture.agents.as_ref().zip(fixture.vault.as_ref()).ok_or("correction_unavailable")?;
                let owner = fixture.owner.as_ref().ok_or("correction_unavailable")?;
                if !agents.capsule_saving(vault) {
                    return Err("capsule_saving_off");
                }
                let preview = owner
                    .plan(OwnerAction::Capsule { name, query, members }, ceiling, None)
                    .map_err(action_fault)?;
                let plan_hash = digest(&preview.plan);
                let mut value = serde_json::to_value(&preview).map_err(|_| "correction_refused")?;
                value["plan_hash"] = json!(plan_hash);
                value["schema_version"] = json!(2);
                value["capability"] = json!("memory-native-read-2");
                value["kind"] = json!("native_owner_preview");
                value["effect"] = json!("native_plan");
                Ok(value)
            }
            CatalogQuery::EntityIdentities { limit } => {
                let owner = fixture.owner.as_ref().ok_or("correction_unavailable")?;
                let groups = owner.entity_identities(ceiling, limit).map_err(fault)?;
                let mut value = serde_json::to_value(&groups).map_err(|_| "catalog_read_refused")?;
                value["schema_version"] = json!(2);
                value["capability"] = json!("memory-native-read-2");
                value["kind"] = json!("runtime_entity_identities");
                value["effect"] = json!("native_read");
                Ok(value)
            }
            CatalogQuery::AgentRequestIgnore { key, ignored } => {
                let (agents, vault) = fixture.agents.as_ref().zip(fixture.vault.as_ref()).ok_or("correction_unavailable")?;
                let owner = fixture.owner.as_ref().ok_or("correction_unavailable")?;
                agents.set_ignored(vault, &key, ignored)?;
                let requests = owner.agent_requests(ceiling).map_err(fault)?;
                let mut value = agents.requests(vault, requests)?;
                value["schema_version"] = json!(2);
                value["capability"] = json!("memory-native-read-2");
                value["kind"] = json!("runtime_agent_requests");
                value["effect"] = json!("local_write");
                Ok(value)
            }
            CatalogQuery::ConnectorStatus => {
                let owner = fixture.owner.as_ref().ok_or("correction_unavailable")?;
                let windows: Vec<Value> = owner
                    .capture_windows()
                    .map_err(fault)?
                    .into_iter()
                    .map(|w| json!({"policy_id":w.policy.policy_id,"max_sensitivity":w.policy.max_sensitivity,
                        "allowed_forms":w.policy.allowed_forms,"valid_from":w.policy.valid_from,
                        "valid_until":w.policy.valid_until,"unused_sources":w.unused_source_ids.len(),
                        "reserved_sources":w.policy.source_ids.len()}))
                    .collect();
                Ok(json!({"schema_version":2,"capability":"memory-native-read-2","kind":"runtime_connector_status",
                    "effect":"native_read","windows":windows}))
            }
            CatalogQuery::ActionOutcome { operation_id } => {
                let owner = fixture.owner.as_ref().ok_or("correction_unavailable")?;
                let outcome = owner.outcome(&operation_id, ceiling).map_err(action_fault)?;
                Ok(json!({"schema_version":2,"capability":"memory-native-read-2","kind":"native_owner_outcome_lookup",
                    "effect":"native_read","outcome":outcome}))
            }
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
