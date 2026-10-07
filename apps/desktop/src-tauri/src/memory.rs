//! Runtime's Memory adapter (ADR-025; Enouia Memory ADR-MEM-45).
//!
//! The shell hosts Enouia Memory's embedded workspace Core at the pinned
//! revision. The page reaches it through two commands. `memory_call`
//! forwards a workspace IPC v1 envelope. `memory_pick` opens a native dialog
//! and returns a single-use token, never a path. Every domain rule lives in
//! the Core.
//!
//! This module only:
//! - scopes callers by native window identity,
//! - keeps blocking work off the UI thread,
//! - runs Vault lifecycle commands exclusively of commits and commands that
//!   start operations, while plain reads (status, progress) stay ungated,
//! - reserves a native Vault directory for cooperating Runtime processes,
//! - shuts the Core down before the process exits.
//!
//! It writes no logs and persists nothing. Activity never passes through it.

use crate::root_lease::{Directory, RootLease};
use enouia_memory_contract::workspace::{is_long_running, is_write};
use enouia_memory_workspace::{Config, HostSurface, PickKind, Workspace};
use serde_json::{Value, json};
use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, PoisonError, RwLock};
use tauri::{State, WebviewWindow};

/// The embedded Core, the lifecycle gate and the closing latch.
#[derive(Clone)]
pub struct MemoryHost {
    core: Arc<Workspace>,
    gate: Arc<RwLock<()>>,
    closing: Arc<AtomicBool>,
    lifecycle: Arc<AtomicUsize>,
    root_lease: Arc<Mutex<Option<RootLease>>>,
    roots: Arc<Mutex<VecDeque<(String, PathBuf)>>>,
    admission_error: Arc<Mutex<Option<&'static str>>>,
    companion: Arc<Mutex<Value>>,
}

impl MemoryHost {
    pub fn new() -> Self {
        Self {
            core: Arc::new(Workspace::new(Config::default())),
            gate: Arc::new(RwLock::new(())),
            closing: Arc::new(AtomicBool::new(false)),
            lifecycle: Arc::new(AtomicUsize::new(0)),
            root_lease: Arc::new(Mutex::new(None)),
            roots: Arc::new(Mutex::new(VecDeque::new())),
            admission_error: Arc::new(Mutex::new(None)),
            companion: Arc::new(Mutex::new(
                json!({"tray": "absent", "hotkey": {"state": "absent"}, "overlay": "absent"}),
            )),
        }
    }

    /// True for the first close request only, so one shutdown runs. From
    /// then on status reports `companion.exiting`, so every window can say
    /// that Memory is finishing its operations.
    pub fn begin_close(&self) -> bool {
        let first = !self.closing.swap(true, Ordering::SeqCst);
        if first {
            self.publish_companion();
        }
        first
    }

    pub fn is_closing(&self) -> bool {
        self.closing.load(Ordering::SeqCst)
    }

    pub fn close_failed(&self) {
        self.closing.store(false, Ordering::SeqCst);
        self.publish_companion();
    }

    pub fn lifecycle_busy(&self) -> bool {
        self.lifecycle.load(Ordering::SeqCst) > 0
    }

    pub fn admission_error(&self) -> Option<&'static str> {
        *self
            .admission_error
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
    }

    /// Paths come only from our native dialog, never request fields. This
    /// bounded table adds host admission without replacing Core token rules.
    pub fn register_pick(&self, kind: PickKind, path: &Path) -> Value {
        match self.core.register_pick(kind, path) {
            Ok(pick) => {
                if kind == PickKind::VaultRoot {
                    let mut roots = self.roots.lock().unwrap_or_else(PoisonError::into_inner);
                    if roots.len() == 64 {
                        roots.pop_front();
                    }
                    roots.push_back((pick.token.clone(), path.to_path_buf()));
                }
                json!({"token":pick.token, "displayName":pick.display_name, "bytes":pick.bytes})
            }
            Err(error) => json!({"error":error}),
        }
    }

    fn change_root(&self, request: &Value) -> Result<Value, String> {
        let token = request["arguments"]["rootToken"].as_str().unwrap_or("");
        let root = self
            .roots
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .iter()
            .find(|(known, _)| known == token)
            .map(|(_, root)| root.clone())
            .ok_or("root_token_unavailable")?;
        let directory = Directory::inspect(&root)?;
        let mut lease = self
            .root_lease
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        let next = if lease
            .as_ref()
            .is_some_and(|current| current.id == directory.id)
        {
            None // Reopening our own directory keeps its existing lease.
        } else {
            Some(RootLease::acquire(directory)?)
        };
        let response = self.core.call(request);
        if response["kind"] != "memory_error" {
            if let Some(next) = next {
                *lease = Some(next);
            }
            *self
                .admission_error
                .lock()
                .unwrap_or_else(PoisonError::into_inner) = None;
        } else if self.core.call(&status_request())["result"]["vault"]["state"] == "none" {
            // Core may have closed the previous Vault before rejecting the
            // new root. Do not retain a reservation for a closed Core.
            *lease = None;
        }
        Ok(response)
    }

    fn lifecycle_guard(&self, request: &Value) -> Option<LifecycleGuard> {
        if gate(request) != Gate::Exclusive {
            return None;
        }
        self.lifecycle.fetch_add(1, Ordering::SeqCst);
        Some(LifecycleGuard(self.lifecycle.clone()))
    }

    /// Native tray actions and page calls share the same lifecycle gate.
    /// Once exit begins, only observations may still reach the Core.
    pub fn forward(&self, request: &Value) -> Result<Value, String> {
        let _lifecycle = self.lifecycle_guard(request);
        let invoke = || {
            let command = request.get("command").and_then(Value::as_str).unwrap_or("");
            if command == "memory_search" && self.lifecycle_busy() {
                return Err("runtime_busy".into());
            }
            if self.is_closing()
                && !matches!(
                    command,
                    "workspace_status" | "operation_get" | "operation_list"
                )
            {
                return Err("runtime_closing".to_owned());
            }
            if matches!(command, "vault_open" | "vault_create") {
                self.change_root(request)
            } else {
                Ok(self.core.call(request))
            }
        };
        match gate(request) {
            Gate::Exclusive => {
                let _exclusive = self.gate.write().unwrap_or_else(PoisonError::into_inner);
                invoke()
            }
            Gate::Shared => {
                let _shared = self.gate.read().unwrap_or_else(PoisonError::into_inner);
                invoke()
            }
            Gate::Open => invoke(),
        }
    }

    pub fn lock_vault(&self) -> Result<Value, String> {
        self.forward(&json!({
            "schemaVersion": 1,
            "requestId": "req_00000000-0000-4000-8000-000000000001",
            "command": "vault_lock", "idempotencyKey": null, "arguments": {}
        }))
    }

    /// Open a root named on the command line by the owner. A rejected root
    /// leaves no Vault open; the page shows that state.
    pub fn open_root(&self, root: &Path) {
        let _exclusive = self.gate.write().unwrap_or_else(PoisonError::into_inner);
        let admitted = Directory::inspect(root).and_then(RootLease::acquire);
        let error = match admitted {
            Ok(lease) => match self.core.open_root(root) {
                Ok(()) => {
                    *self
                        .root_lease
                        .lock()
                        .unwrap_or_else(PoisonError::into_inner) = Some(lease);
                    None
                }
                Err(_) => Some("root_open_failed"),
            },
            Err(error) => Some(error),
        };
        *self
            .admission_error
            .lock()
            .unwrap_or_else(PoisonError::into_inner) = error;
    }

    /// Cancel and join operations, then release the Vault and the index.
    pub fn shutdown(&self) {
        let _exclusive = self.gate.write().unwrap_or_else(PoisonError::into_inner);
        self.core.shutdown();
        *self
            .root_lease
            .lock()
            .unwrap_or_else(PoisonError::into_inner) = None;
        self.roots
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clear();
    }

    /// What the shell provides (tray, quick search, hotkey), echoed in status.
    pub fn set_companion(&self, value: Value) {
        *self
            .companion
            .lock()
            .unwrap_or_else(PoisonError::into_inner) = value;
        self.publish_companion();
    }

    fn publish_companion(&self) {
        // Held while publishing, so a late update cannot drop `exiting`.
        let companion = self
            .companion
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        let mut value = companion.clone();
        if self.closing.load(Ordering::SeqCst)
            && let Some(fields) = value.as_object_mut()
        {
            fields.insert("exiting".to_owned(), json!(true));
        }
        self.core.set_companion(value);
    }
}

fn status_request() -> Value {
    json!({"schemaVersion":1,"requestId":"req_00000000-0000-4000-8000-000000000001","command":"workspace_status","idempotencyKey":null,"arguments":{}})
}

struct LifecycleGuard(Arc<AtomicUsize>);
impl Drop for LifecycleGuard {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::SeqCst);
    }
}

/// Scope comes only from native window identity, never page request fields.
pub fn surface(window: &str) -> Option<HostSurface> {
    match window {
        "main" => Some(HostSurface::Workspace),
        "overlay" => Some(HostSurface::QuickSearch),
        _ => None,
    }
}

#[derive(Debug, PartialEq, Eq)]
enum Gate {
    /// Replaces or drops the Vault handle and joins operations.
    Exclusive,
    /// Commits or starts an operation on the current handle.
    Shared,
    /// Everything else, including status and progress reads.
    Open,
}

/// Lifecycle commands run alone, so no operation can start on a handle that
/// is closing. Plain reads are never gated: while a lock waits for an
/// operation that cannot be cancelled (verify, backup), status and progress
/// keep answering.
fn gate(request: &Value) -> Gate {
    match request.get("command").and_then(Value::as_str) {
        Some("vault_open" | "vault_create" | "vault_lock" | "vault_unlock") => Gate::Exclusive,
        Some(command) if is_long_running(command) || is_write(command) => Gate::Shared,
        _ => Gate::Open,
    }
}

/// `--memory-vault <dir>`: an explicitly named root. No root is remembered
/// or opened by default.
pub fn vault_argument(args: &[String]) -> Option<PathBuf> {
    args.windows(2)
        .find(|w| w[0] == "--memory-vault")
        .map(|w| PathBuf::from(&w[1]))
}

/// Forward one workspace IPC v1 envelope. Core errors come back inside the
/// envelope; host failures are plain strings outside the Memory codes.
#[tauri::command]
pub async fn memory_call(
    app: tauri::AppHandle,
    host: State<'_, MemoryHost>,
    window: WebviewWindow,
    request: Value,
) -> Result<Value, String> {
    if !surface(window.label()).is_some_and(|s| s.allows(&request)) {
        return Err("permission_denied".to_owned());
    }
    let lifecycle = host.lifecycle_guard(&request);
    if lifecycle.is_some() {
        crate::shell::hide_overlay(&app);
    }
    let host = host.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _lifecycle = lifecycle;
        host.forward(&request)
    })
    .await
    .map_err(|_| "worker_failed".to_owned())?
}

/// Open a native dialog and hand the page a token for the choice.
#[tauri::command]
pub async fn memory_pick(
    host: State<'_, MemoryHost>,
    window: WebviewWindow,
    kind: String,
) -> Result<Value, String> {
    if surface(window.label()) != Some(HostSurface::Workspace) {
        return Err("permission_denied".to_owned());
    }
    if host.is_closing() {
        return Err("runtime_closing".to_owned());
    }
    let host = host.inner().clone();
    tauri::async_runtime::spawn_blocking(move || pick(&host, &kind))
        .await
        .map_err(|_| "worker_failed".to_owned())
}

fn pick_kind(kind: &str) -> Option<(PickKind, &'static str)> {
    match kind {
        "import_file" => Some((PickKind::ImportFile, "Choose an export file to import")),
        "vault_root" => Some((PickKind::VaultRoot, "Choose the Vault folder")),
        "backup_destination" => {
            Some((PickKind::BackupDestination, "Choose an empty backup folder"))
        }
        "export_folder" => Some((PickKind::ExportFolder, "Choose a backup folder to preview")),
        _ => None,
    }
}

fn pick(host: &MemoryHost, kind: &str) -> Value {
    let Some((kind, title)) = pick_kind(kind) else {
        return json!({"error": {"code": "invalid_request", "retryable": false, "rules": ["workspace.pick_kind"]}});
    };
    let dialog = rfd::FileDialog::new().set_title(title);
    let chosen = match kind {
        PickKind::ImportFile => dialog.pick_file(),
        _ => dialog.pick_folder(),
    };
    let Some(path) = chosen else {
        return json!({"cancelled": true});
    };
    host.register_pick(kind, &path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use enouia_memory_contract::workspace::{COMMANDS, is_write};

    #[cfg(windows)]
    fn request(command: &str, args: Value) -> Value {
        json!({"schemaVersion":1,"requestId":"req_00000000-0000-4000-8000-000000000001","command":command,"idempotencyKey":null,"arguments":args})
    }

    #[cfg(windows)]
    struct Roots(PathBuf);
    #[cfg(windows)]
    impl Roots {
        fn new() -> Self {
            let root = std::env::temp_dir().join(format!(
                "runtime-admission-{}-{}",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            ));
            for name in ["a", "b", "empty"] {
                std::fs::create_dir_all(root.join(name)).unwrap();
            }
            Self(root)
        }
        fn token(&self, host: &MemoryHost, name: &str) -> String {
            host.register_pick(PickKind::VaultRoot, &self.0.join(name))["token"]
                .as_str()
                .unwrap()
                .into()
        }
        fn create(&self, host: &MemoryHost, name: &str) {
            let token = self.token(host, name);
            let result = host
                .forward(&request(
                    "vault_create",
                    json!({"rootToken":token,"confirmPhrase":"create new vault"}),
                ))
                .unwrap();
            assert_ne!(result["kind"], "memory_error", "{result}");
            assert_eq!(result["result"]["vault"]["state"], "open");
        }
    }
    #[cfg(windows)]
    impl Drop for Roots {
        fn drop(&mut self) {
            std::fs::remove_dir_all(&self.0).unwrap();
        }
    }

    #[cfg(windows)]
    #[test]
    fn root_admission_covers_tokens_lock_switch_and_shutdown() {
        let roots = Roots::new();
        let first = MemoryHost::new();
        let second = MemoryHost::new();
        roots.create(&first, "a");
        second.open_root(&roots.0.join("a"));
        assert_eq!(second.admission_error(), Some("root_in_use"));
        assert_eq!(
            second.forward(&status_request()).unwrap()["result"]["vault"]["state"],
            "none"
        );
        assert_ne!(first.lock_vault().unwrap()["kind"], "memory_error");
        second.open_root(&roots.0.join("a"));
        assert_eq!(second.admission_error(), Some("root_in_use"));
        assert_eq!(
            first.forward(&request("vault_unlock", json!({}))).unwrap()["result"]["vault"]["state"],
            "open"
        );
        let same = roots.token(&first, "a");
        assert_ne!(
            first
                .forward(&request("vault_open", json!({"rootToken":same})))
                .unwrap()["kind"],
            "memory_error"
        );
        roots.create(&second, "b");
        let busy = roots.token(&first, "b");
        assert_eq!(
            first.forward(&request("vault_open", json!({"rootToken":busy}))),
            Err("root_in_use".into())
        );
        assert_eq!(
            first.forward(&status_request()).unwrap()["result"]["vault"]["rootName"],
            "a"
        );
        second.shutdown();
        assert_ne!(
            first
                .forward(&request("vault_open", json!({"rootToken":busy})))
                .unwrap()["kind"],
            "memory_error"
        );
        second.open_root(&roots.0.join("a"));
        assert_eq!(second.admission_error(), None);
        assert_eq!(
            second.forward(&status_request()).unwrap()["result"]["vault"]["state"],
            "open"
        );
        first.shutdown();
        second.shutdown();
    }

    #[cfg(windows)]
    #[test]
    fn failed_root_change_matches_core_lifetime_and_page_paths_are_refused() {
        let roots = Roots::new();
        let host = MemoryHost::new();
        let other = MemoryHost::new();
        roots.create(&host, "a");
        let token = roots.token(&host, "empty");
        let bad_phrase = host
            .forward(&request(
                "vault_create",
                json!({"rootToken":token,"confirmPhrase":"incorrect"}),
            ))
            .unwrap();
        assert_eq!(bad_phrase["kind"], "memory_error");
        other.open_root(&roots.0.join("a"));
        assert_eq!(other.admission_error(), Some("root_in_use"));
        let missing = host
            .forward(&request("vault_open", json!({"rootToken":token})))
            .unwrap();
        assert_eq!(missing["kind"], "memory_error");
        assert_eq!(
            host.forward(&status_request()).unwrap()["result"]["vault"]["state"],
            "none"
        );
        other.open_root(&roots.0.join("a"));
        assert_eq!(other.admission_error(), None);
        assert_eq!(
            host.forward(&request(
                "vault_open",
                json!({"rootToken":roots.0.join("a").to_string_lossy()})
            )),
            Err("root_token_unavailable".into())
        );
        host.shutdown();
        other.shutdown();
    }

    #[cfg(windows)]
    #[test]
    fn pinned_core_ownership_and_runtime_directory_admission_compose() {
        let roots = Roots::new();
        let host = MemoryHost::new();
        roots.create(&host, "a");
        host.shutdown();
        // This Core has no Runtime directory guard, like Memory's own client.
        let external = Workspace::new(Config::default());
        external.open_root(&roots.0.join("a")).unwrap();
        host.open_root(&roots.0.join("a"));
        assert_eq!(
            host.forward(&status_request()).unwrap()["result"]["vault"]["state"],
            "none"
        );
        assert!(host.root_lease.lock().unwrap().is_none());
        external.shutdown();
        host.open_root(&roots.0.join("a"));
        assert_eq!(
            host.forward(&status_request()).unwrap()["result"]["vault"]["state"],
            "open"
        );
        assert!(external.open_root(&roots.0.join("a")).is_err());
        host.shutdown();
        external.open_root(&roots.0.join("a")).unwrap();
        external.shutdown();
    }

    #[test]
    fn tray_workers_share_one_core_gate_and_closing_latch() {
        let host = MemoryHost::new();
        let worker = host.clone();
        assert!(Arc::ptr_eq(&host.core, &worker.core));
        assert!(Arc::ptr_eq(&host.gate, &worker.gate));
        assert!(worker.begin_close());
        assert!(host.is_closing());
        assert!(!host.begin_close());
        worker.close_failed();
        assert!(!host.is_closing());
        assert!(host.begin_close());
    }

    #[test]
    fn exit_refuses_new_work_but_keeps_status_and_progress_observable() {
        let host = MemoryHost::new();
        host.begin_close();
        for command in COMMANDS {
            let request = json!({"schemaVersion":1, "requestId":"req_00000000-0000-4000-8000-000000000001", "command":command, "idempotencyKey":null, "arguments":{}});
            let result = host.forward(&request);
            if matches!(
                command,
                "workspace_status" | "operation_get" | "operation_list"
            ) {
                assert!(result.is_ok(), "{command}");
            } else {
                assert_eq!(result, Err("runtime_closing".to_owned()), "{command}");
            }
        }
        assert_eq!(host.lock_vault(), Err("runtime_closing".to_owned()));
        host.close_failed();
        assert!(host.lock_vault().is_ok());
    }

    #[test]
    fn windows_receive_only_their_pinned_surface_scope() {
        assert_eq!(surface("main"), Some(HostSurface::Workspace));
        assert_eq!(surface("overlay"), Some(HostSurface::QuickSearch));
        for window in [
            "", "Main", "main ", "Overlay", "overlay ", "activity", "foreign",
        ] {
            assert_eq!(surface(window), None, "{window}");
        }
    }

    #[test]
    fn quick_search_rejects_every_other_catalog_command() {
        for command in COMMANDS {
            assert_eq!(
                surface("overlay")
                    .unwrap()
                    .allows(&json!({"command":command})),
                command == "memory_search",
                "{command}"
            );
        }
    }

    #[test]
    fn search_is_refused_through_all_queued_lifecycle_transitions() {
        let host = MemoryHost::new();
        let lock = host.lifecycle_guard(&json!({"command":"vault_lock"}));
        let open = host.lifecycle_guard(&json!({"command":"vault_open"}));
        assert!(host.lifecycle_busy());
        drop(lock);
        assert_eq!(
            host.forward(&json!({"command":"memory_search"})),
            Err("runtime_busy".into())
        );
        drop(open);
        assert!(!host.lifecycle_busy());
        assert!(host.forward(&json!({"command":"memory_search"})).is_ok());
    }

    #[test]
    fn page_fields_cannot_change_the_native_scope() {
        let spoof = json!({"command": "remember", "window": "main", "surface": "workspace"});
        assert!(!surface("overlay").is_some_and(|s| s.allows(&spoof)));
        assert!(surface("main").is_some_and(|s| s.allows(&spoof)));
        assert!(surface("overlay").is_some_and(|s| s.allows(&json!({"command": "memory_search"}))));
    }

    #[test]
    fn lifecycle_excludes_commits_and_operation_starts_but_not_reads() {
        let of = |kind: Gate| -> Vec<&str> {
            COMMANDS
                .iter()
                .copied()
                .filter(|c| gate(&json!({"command": c})) == kind)
                .collect()
        };
        assert_eq!(
            of(Gate::Exclusive),
            ["vault_open", "vault_create", "vault_lock", "vault_unlock"]
        );
        assert_eq!(
            of(Gate::Shared),
            [
                "review_confirm",
                "forget_plan",
                "remember",
                "correction_propose",
                "import_start",
                "import_resume",
                "session_new",
                "session_ask",
                "session_checkpoint",
                "context_preview",
                "index_rebuild",
                "vault_verify",
                "backup_export"
            ]
        );
        for read in [
            "workspace_status",
            "operation_get",
            "operation_list",
            "memory_list",
        ] {
            assert_eq!(gate(&json!({"command": read})), Gate::Open, "{read}");
        }
        assert_eq!(gate(&json!({})), Gate::Open);
        assert_eq!(gate(&json!({"command": "Vault_lock"})), Gate::Open);
    }

    #[test]
    fn a_queued_commit_observes_exit_before_acquiring_the_core() {
        let host = MemoryHost::new();
        let held = host.gate.write().unwrap();
        let worker = host.clone();
        let queued = std::thread::spawn(move || worker.forward(&json!({"command":"remember"})));
        host.begin_close();
        drop(held);
        assert_eq!(queued.join().unwrap(), Err("runtime_closing".to_owned()));
    }

    #[test]
    fn only_the_first_close_request_shuts_down() {
        let host = MemoryHost::new();
        assert!(host.begin_close());
        assert!(!host.begin_close());
    }

    #[test]
    fn status_reports_an_exit_in_progress() {
        let host = MemoryHost::new();
        let companion = || {
            host.forward(&json!({
                "schemaVersion": 1, "requestId": "req_00000000-0000-4000-8000-000000000002",
                "command": "workspace_status", "idempotencyKey": null, "arguments": {},
            }))
            .unwrap()["result"]["companion"]
                .clone()
        };
        host.set_companion(json!({"tray": "present", "hotkey": {"state": "registered"}}));
        assert_eq!(companion()["exiting"], Value::Null);
        assert!(host.begin_close());
        assert_eq!(companion()["exiting"], true);
        // A late hotkey report keeps the exit visible.
        host.set_companion(json!({"tray": "present", "hotkey": {"state": "conflict"}}));
        assert_eq!(companion()["exiting"], true);
        assert_eq!(companion()["hotkey"]["state"], "conflict");
        host.close_failed();
        assert_eq!(companion()["exiting"], Value::Null);
        assert_eq!(companion()["hotkey"]["state"], "conflict");
    }

    #[test]
    fn picker_kinds_match_the_core() {
        let kinds: Vec<PickKind> = [
            "import_file",
            "vault_root",
            "backup_destination",
            "export_folder",
        ]
        .iter()
        .map(|k| pick_kind(k).unwrap().0)
        .collect();
        assert_eq!(
            kinds,
            [
                PickKind::ImportFile,
                PickKind::VaultRoot,
                PickKind::BackupDestination,
                PickKind::ExportFolder
            ]
        );
        assert!(pick_kind("vault").is_none() && pick_kind("").is_none());
    }

    #[test]
    fn vault_argument_needs_the_explicit_flag() {
        let args = |v: &[&str]| v.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        assert_eq!(
            vault_argument(&args(&["exe", "--memory-vault", "D:\\Vault"])),
            Some(PathBuf::from("D:\\Vault"))
        );
        assert_eq!(
            vault_argument(&args(&["exe", "--vault", "D:\\Vault"])),
            None
        );
        assert_eq!(vault_argument(&args(&["exe", "--memory-vault"])), None);
    }

    /// The page client keys exactly the commands the pinned contract treats
    /// as writes, and names only commands and picker kinds the Core knows.
    #[test]
    fn page_client_matches_the_pinned_contract() {
        let client = std::fs::read_to_string(
            Path::new(env!("CARGO_MANIFEST_DIR")).join("../src/memory/client.ts"),
        )
        .unwrap();
        let list = |start: &str| -> Vec<String> {
            let body = client
                .split(start)
                .nth(1)
                .unwrap()
                .split(']')
                .next()
                .unwrap();
            body.split('"')
                .skip(1)
                .step_by(2)
                .map(str::to_owned)
                .collect()
        };
        let mut writes = list("const WRITES = new Set([");
        writes.sort();
        let mut expected: Vec<String> = COMMANDS
            .iter()
            .filter(|c| is_write(c))
            .map(|c| c.to_string())
            .collect();
        expected.sort();
        assert_eq!(writes, expected);
        for kind in list("const PICK_KINDS = [") {
            assert!(pick_kind(&kind).is_some(), "{kind}");
        }
    }
}
