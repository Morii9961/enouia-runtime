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
//! - runs Vault lifecycle commands exclusively of commands that start
//!   operations, while plain reads (status, progress) stay ungated,
//! - shuts the Core down before the process exits.
//!
//! It writes no logs and persists nothing. Activity never passes through it.

use enouia_memory_contract::workspace::is_long_running;
use enouia_memory_workspace::{Config, HostSurface, PickKind, Workspace};
use serde_json::{Value, json};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, PoisonError, RwLock};
use tauri::{Manager, State, WebviewWindow};

/// The embedded Core, the lifecycle gate, the closing latch and what the
/// shell reports about itself in `workspace_status`.
pub struct MemoryHost {
    core: Arc<Workspace>,
    gate: Arc<RwLock<()>>,
    closing: AtomicBool,
    companion: Mutex<Value>,
}

impl MemoryHost {
    pub fn new() -> Self {
        Self {
            core: Arc::new(Workspace::new(Config::default())),
            gate: Arc::new(RwLock::new(())),
            closing: AtomicBool::new(false),
            companion: Mutex::new(
                json!({"tray": "absent", "hotkey": {"state": "absent"}, "overlay": "absent"}),
            ),
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

    /// Forward one envelope through the lifecycle gate (blocking).
    pub fn forward(&self, request: &Value) -> Value {
        forward(&self.core, &self.gate, request)
    }

    /// Lock the Vault for the tray (blocking; run off the event loop).
    pub fn lock_vault(&self) -> Value {
        self.forward(&json!({
            "schemaVersion": 1, "requestId": "req_00000000-0000-4000-8000-000000000001",
            "command": "vault_lock", "idempotencyKey": null, "arguments": {},
        }))
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

fn forward(core: &Workspace, gate: &RwLock<()>, request: &Value) -> Value {
    match self::gate(request) {
        Gate::Exclusive => {
            let _exclusive = gate.write().unwrap_or_else(PoisonError::into_inner);
            core.call(request)
        }
        Gate::Shared => {
            let _shared = gate.read().unwrap_or_else(PoisonError::into_inner);
            core.call(request)
        }
        Gate::Open => core.call(request),
    }
}

/// Runtime windows mapped onto the Core's caller surfaces: the main window
/// is the full workspace; the quick-search window may only search.
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
    /// Starts an operation on the current handle.
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
        Some(command) if is_long_running(command) => Gate::Shared,
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
    let locking = request.get("command").and_then(Value::as_str) == Some("vault_lock");
    let core = host.core.clone();
    let gate = host.gate.clone();
    let response = tauri::async_runtime::spawn_blocking(move || forward(&core, &gate, &request))
        .await
        .map_err(|_| "worker_failed".to_owned())?;
    if locking {
        crate::companion::hide_quick_search(window.app_handle());
    }
    Ok(response)
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
    fn windows_map_to_their_memory_surfaces() {
        assert_eq!(surface("main"), Some(HostSurface::Workspace));
        assert_eq!(surface("overlay"), Some(HostSurface::QuickSearch));
        for window in ["", "Main", "main ", "Overlay", "activity", "foreign"] {
            assert_eq!(surface(window), None, "{window}");
        }
    }

    #[test]
    fn page_fields_cannot_change_the_native_scope() {
        let spoof = json!({"command": "remember", "window": "main", "surface": "workspace"});
        assert!(!surface("overlay").is_some_and(|s| s.allows(&spoof)));
        assert!(surface("main").is_some_and(|s| s.allows(&spoof)));
        assert!(surface("overlay").is_some_and(|s| s.allows(&json!({"command": "memory_search"}))));
    }

    #[test]
    fn only_lifecycle_and_operation_starts_are_gated() {
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
                "import_start",
                "import_resume",
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
            }))["result"]["companion"]
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
