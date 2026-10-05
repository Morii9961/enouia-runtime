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
//! - shuts the Core down before the process exits.
//!
//! It writes no logs and persists nothing. Activity never passes through it.

use enouia_memory_contract::workspace::{is_long_running, is_write};
use enouia_memory_workspace::{Config, HostSurface, PickKind, Workspace};
use serde_json::{Value, json};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, PoisonError, RwLock};
use tauri::{State, WebviewWindow};

/// The embedded Core, the lifecycle gate and the closing latch.
#[derive(Clone)]
pub struct MemoryHost {
    core: Arc<Workspace>,
    gate: Arc<RwLock<()>>,
    closing: Arc<AtomicBool>,
}

impl MemoryHost {
    pub fn new() -> Self {
        Self {
            core: Arc::new(Workspace::new(Config::default())),
            gate: Arc::new(RwLock::new(())),
            closing: Arc::new(AtomicBool::new(false)),
        }
    }

    /// True for the first close request only, so one shutdown runs.
    pub fn begin_close(&self) -> bool {
        !self.closing.swap(true, Ordering::SeqCst)
    }

    pub fn is_closing(&self) -> bool {
        self.closing.load(Ordering::SeqCst)
    }

    pub fn close_failed(&self) {
        self.closing.store(false, Ordering::SeqCst);
    }

    /// Native tray actions and page calls share the same lifecycle gate.
    /// Once exit begins, only observations may still reach the Core.
    pub fn forward(&self, request: &Value) -> Result<Value, String> {
        let invoke = || {
            let command = request.get("command").and_then(Value::as_str).unwrap_or("");
            if self.is_closing()
                && !matches!(
                    command,
                    "workspace_status" | "operation_get" | "operation_list"
                )
            {
                return Err("runtime_closing".to_owned());
            }
            Ok(self.core.call(request))
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

    pub fn set_companion(&self, status: Value) {
        self.core.set_companion(status);
    }

    /// Open a root named on the command line by the owner. A rejected root
    /// leaves no Vault open; the page shows that state.
    pub fn open_root(&self, root: &Path) {
        let _exclusive = self.gate.write().unwrap_or_else(PoisonError::into_inner);
        let _ = self.core.open_root(root);
    }

    /// Cancel and join operations, then release the Vault and the index.
    pub fn shutdown(&self) {
        let _exclusive = self.gate.write().unwrap_or_else(PoisonError::into_inner);
        self.core.shutdown();
    }
}

/// Runtime windows mapped onto the Core's caller surfaces. Only the main
/// window hosts Memory; Runtime has no quick-search window yet.
pub fn surface(window: &str) -> Option<HostSurface> {
    match window {
        "main" => Some(HostSurface::Workspace),
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
    host: State<'_, MemoryHost>,
    window: WebviewWindow,
    request: Value,
) -> Result<Value, String> {
    if !surface(window.label()).is_some_and(|s| s.allows(&request)) {
        return Err("permission_denied".to_owned());
    }
    let host = host.inner().clone();
    tauri::async_runtime::spawn_blocking(move || host.forward(&request))
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
    let core = host.core.clone();
    tauri::async_runtime::spawn_blocking(move || pick(&core, &kind))
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

fn pick(core: &Workspace, kind: &str) -> Value {
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
    match core.register_pick(kind, &path) {
        Ok(p) => json!({"token": p.token, "displayName": p.display_name, "bytes": p.bytes}),
        Err(e) => json!({"error": e}),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use enouia_memory_contract::workspace::{COMMANDS, is_write};

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
    fn only_the_main_window_reaches_memory() {
        assert_eq!(surface("main"), Some(HostSurface::Workspace));
        for window in ["", "Main", "main ", "overlay", "activity", "foreign"] {
            assert_eq!(surface(window), None, "{window}");
        }
    }

    #[test]
    fn page_fields_cannot_change_the_native_scope() {
        let spoof = json!({"command": "remember", "window": "main", "surface": "workspace"});
        assert!(!surface("overlay").is_some_and(|s| s.allows(&spoof)));
        assert!(surface("main").is_some_and(|s| s.allows(&spoof)));
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
