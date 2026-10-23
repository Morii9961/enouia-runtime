//! Manual Usage host: native grants + hash-checked one-shot runner, no Memory access.
use crate::usage_wire as wire;
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::VecDeque,
    fs::File,
    io::{Read, Write},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{
        Arc, Mutex, PoisonError,
        atomic::{AtomicBool, AtomicU64, Ordering},
    },
    time::{Duration, Instant},
};
use tauri::{Manager, State, WebviewWindow};
const MAX_OUTPUT: usize = 256 * 1024;
#[derive(Clone, Copy, PartialEq, Eq)]
enum Kind {
    Package,
    Ledger,
    NewLedger,
    Codex,
    Claude,
    Export,
}
#[derive(Clone)]
struct Choice {
    id: String,
    kind: Kind,
    path: PathBuf,
    package_hash: Option<String>,
}
#[derive(Default)]
pub struct UsageHost {
    choices: Mutex<VecDeque<Choice>>,
    counter: AtomicU64,
    gate: Mutex<()>,
    child: Mutex<Option<Child>>,
    closing: AtomicBool,
    cancelled: AtomicBool,
}
impl UsageHost {
    pub fn begin_close(&self) {
        self.closing.store(true, Ordering::SeqCst);
    }
    pub fn shutdown(&self) {
        self.closing.store(true, Ordering::SeqCst);
        self.cancel();
    }
    pub fn resume(&self) {
        self.closing.store(false, Ordering::SeqCst);
    }
    fn cancel(&self) -> bool {
        self.terminate(true)
    }
    fn terminate(&self, cancelled: bool) -> bool {
        let mut c = self.child.lock().unwrap_or_else(PoisonError::into_inner);
        if let Some(child) = c.as_mut() {
            if cancelled {
                self.cancelled.store(true, Ordering::SeqCst);
            }
            let _ = child.kill();
            let _ = child.wait();
            true
        } else {
            false
        }
    }
    fn choice(&self, id: &str, kind: Kind) -> Result<PathBuf, String> {
        self.choices
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .iter()
            .find(|c| c.id == id && c.kind == kind)
            .map(|c| c.path.clone())
            .ok_or_else(|| "usage_choice_expired".into())
    }
    fn keep(&self, kind: Kind, path: PathBuf, package_hash: Option<String>) -> String {
        let id = format!(
            "usage-choice-{}",
            self.counter.fetch_add(1, Ordering::Relaxed)
        );
        let mut choices = self.choices.lock().unwrap_or_else(PoisonError::into_inner);
        if choices.len() == 64 {
            choices.pop_front();
        }
        choices.push_back(Choice {
            id: id.clone(),
            kind,
            path,
            package_hash,
        });
        id
    }
    fn selected_package(&self, id: &str) -> Result<(PathBuf, Vec<File>), String> {
        let choice = self
            .choices
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .iter()
            .find(|c| c.id == id && c.kind == Kind::Package)
            .cloned()
            .ok_or("usage_choice_expired")?;
        let (binary, hash, pins) = package(&choice.path)?;
        if choice.package_hash.as_deref() != Some(hash.as_str()) {
            return Err("usage_binary_changed".into());
        }
        Ok((binary, pins))
    }
}
fn allows_usage(label: &str) -> bool {
    label == "main"
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct WebRequest {
    package: String,
    ledger: String,
    source: String,
    action: Action,
}
#[derive(Deserialize)]
#[serde(tag = "operation", rename_all = "snake_case", deny_unknown_fields)]
enum Action {
    Init {
        confirm: bool,
    },
    Overview,
    Scan {
        roots: Vec<String>,
        models: Vec<String>,
    },
    Replay,
    Candidates {
        cursor: Option<String>,
    },
    Inspect {
        candidate: wire::Candidate,
    },
    Resolve {
        review_token: String,
        exclude: bool,
    },
    Export {
        start: String,
        end_exclusive: String,
        destination: String,
    },
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Manifest {
    kind: String,
    version: u8,
    desktop_protocol: u8,
    binary: String,
    sha256: String,
}
/// Handles pin every native package ancestor and the binary until the process exits.
fn safe_file(path: &Path) -> Result<File, String> {
    if !path.is_absolute() {
        return Err("usage_unsafe_package".into());
    }
    #[cfg(windows)]
    let file = {
        use std::os::windows::fs::OpenOptionsExt;
        std::fs::OpenOptions::new()
            .read(true)
            .share_mode(1)
            .custom_flags(0x0020_0000)
            .open(path)
    };
    #[cfg(not(windows))]
    let file = File::open(path);
    let f = file.map_err(|_| "usage_unsafe_package")?;
    let m = f.metadata().map_err(|_| "usage_unsafe_package")?;
    if !m.is_file() {
        return Err("usage_unsafe_package".into());
    }
    #[cfg(windows)]
    {
        use std::os::windows::{fs::MetadataExt, io::AsRawHandle};
        use windows_sys::Win32::Storage::FileSystem::{
            BY_HANDLE_FILE_INFORMATION, GetFileInformationByHandle,
        };
        let mut info = std::mem::MaybeUninit::<BY_HANDLE_FILE_INFORMATION>::zeroed();
        if m.file_attributes() & 0x400 != 0
            || unsafe { GetFileInformationByHandle(f.as_raw_handle(), info.as_mut_ptr()) } == 0
            || unsafe { info.assume_init() }.nNumberOfLinks != 1
        {
            return Err("usage_unsafe_package".into());
        }
    }
    Ok(f)
}
fn pin_package(root: &Path) -> Result<Vec<File>, String> {
    use std::path::{Component, Prefix};
    if !root.is_absolute()
        || !matches!(root.components().next(),Some(Component::Prefix(p)) if matches!(p.kind(),Prefix::Disk(_)|Prefix::VerbatimDisk(_)))
    {
        return Err("usage_unsafe_package".into());
    }
    let mut files = Vec::new();
    let mut path = PathBuf::new();
    for part in root.components() {
        path.push(part);
        match part {
            Component::Prefix(_) => continue,
            Component::RootDir => {}
            Component::Normal(n) if !n.to_string_lossy().contains(':') => {}
            _ => return Err("usage_unsafe_package".into()),
        }
        #[cfg(windows)]
        {
            use std::os::windows::fs::{MetadataExt, OpenOptionsExt};
            let f = std::fs::OpenOptions::new()
                .read(true)
                .share_mode(1)
                .custom_flags(0x0220_0000)
                .open(&path)
                .map_err(|_| "usage_unsafe_package")?;
            let m = f.metadata().map_err(|_| "usage_unsafe_package")?;
            if !m.is_dir() || m.file_attributes() & 0x400 != 0 {
                return Err("usage_unsafe_package".into());
            }
            files.push(f);
        }
    }
    Ok(files)
}
fn package(root: &Path) -> Result<(PathBuf, String, Vec<File>), String> {
    let mut pins = pin_package(root)?;
    let mut manifest = Vec::new();
    safe_file(&root.join("usage-package.json"))?
        .take(4097)
        .read_to_end(&mut manifest)
        .map_err(|_| "usage_unsafe_package")?;
    if manifest.len() > 4096 {
        return Err("usage_unsafe_package".into());
    }
    let m: Manifest = serde_json::from_slice(&manifest).map_err(|_| "usage_unsafe_package")?;
    if m.kind != "enouia_usage_package"
        || m.version != 1
        || m.desktop_protocol != 1
        || m.binary != "enouia-usage.exe"
        || !wire::digest(&m.sha256)
    {
        return Err("usage_unsafe_package".into());
    }
    let path = root.join(&m.binary);
    let mut file = safe_file(&path)?;
    let mut hash = Sha256::new();
    let mut buffer = [0; 64 * 1024];
    let mut size = 0_u64;
    loop {
        let n = file.read(&mut buffer).map_err(|_| "usage_binary_changed")?;
        if n == 0 {
            break;
        }
        size += n as u64;
        if size > 256 * 1024 * 1024 {
            return Err("usage_unsafe_package".into());
        }
        hash.update(&buffer[..n]);
    }
    if format!("{:x}", hash.finalize()) != m.sha256 {
        return Err("usage_binary_changed".into());
    }
    pins.push(file);
    Ok((path, m.sha256, pins))
}
fn arguments(host: &UsageHost, r: &WebRequest) -> Result<(Value, &'static str), String> {
    if !wire::source(&r.source) {
        return Err("usage_invalid_request".into());
    }
    let root = host.choice(
        &r.ledger,
        if matches!(r.action, Action::Init { .. }) {
            Kind::NewLedger
        } else {
            Kind::Ledger
        },
    )?;
    let (action, op) = match &r.action {
        Action::Init { confirm: true } => (json!({"operation":"init","confirm":true}), "init"),
        Action::Init { .. } => return Err("usage_invalid_request".into()),
        Action::Overview => (json!({"operation":"overview"}), "overview"),
        Action::Replay => (json!({"operation":"replay"}), "replay"),
        Action::Scan { roots, models } => {
            if roots.is_empty()
                || roots.len() > 16
                || models.len() > 128
                || models.iter().any(|s| {
                    s.is_empty()
                        || s.len() > 80
                        || !s.bytes().all(|b| {
                            b.is_ascii_lowercase() || b.is_ascii_digit() || b"._-".contains(&b)
                        })
                })
            {
                return Err("usage_invalid_request".into());
            }
            let paths = roots
                .iter()
                .map(|id| {
                    host.choice(
                        id,
                        if r.source == "codex_local" {
                            Kind::Codex
                        } else {
                            Kind::Claude
                        },
                    )
                })
                .collect::<Result<Vec<_>, _>>()?;
            (
                json!({"operation":"scan","roots":paths,"models":models}),
                "scan",
            )
        }
        Action::Candidates { cursor } => {
            if cursor.as_deref().is_some_and(|c| !wire::token(c, "page")) {
                return Err("usage_invalid_request".into());
            }
            (
                json!({"operation":"candidates","cursor":cursor}),
                "candidates",
            )
        }
        Action::Inspect { candidate } => {
            if !candidate.valid() {
                return Err("usage_invalid_request".into());
            }
            (
                json!({"operation":"inspect","candidate":candidate}),
                "inspect",
            )
        }
        Action::Resolve {
            review_token,
            exclude,
        } => {
            if !wire::token(review_token, "review") {
                return Err("usage_invalid_request".into());
            }
            (
                json!({"operation":"resolve","review_token":review_token,"exclude":exclude}),
                "resolve",
            )
        }
        Action::Export {
            start,
            end_exclusive,
            destination,
        } => {
            if start.len() != 10 || end_exclusive.len() != 10 {
                return Err("usage_invalid_request".into());
            }
            let output = host.choice(destination, Kind::Export)?;
            (
                json!({"operation":"export","start":start,"end_exclusive":end_exclusive,"output":output}),
                "export",
            )
        }
    };
    Ok((
        json!({"version":1,"root":root,"source":r.source,"action":action}),
        op,
    ))
}
fn execute(host: &UsageHost, binary: &Path, request: &Value) -> Result<Value, String> {
    let bytes = serde_json::to_vec(request).map_err(|_| "usage_invalid_request")?;
    if bytes.len() > 64 * 1024 {
        return Err("usage_invalid_request".into());
    }
    host.cancelled.store(false, Ordering::SeqCst);
    let mut command = Command::new(binary);
    command
        .arg("desktop")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }
    let mut child = command.spawn().map_err(|_| "usage_runner_failed")?;
    let stdout = child.stdout.take().ok_or("usage_runner_failed")?;
    let mut input = child.stdin.take().ok_or("usage_runner_failed")?;
    let mut slot = host.child.lock().unwrap_or_else(PoisonError::into_inner);
    if host.closing.load(Ordering::SeqCst) {
        let _ = child.kill();
        let _ = child.wait();
        return Err("usage_runtime_closing".into());
    }
    *slot = Some(child);
    drop(slot);
    let overflow = Arc::new(AtomicBool::new(false));
    let read_overflow = overflow.clone();
    let reader = std::thread::spawn(move || {
        let mut bytes = Vec::new();
        let r = stdout.take(MAX_OUTPUT as u64 + 1).read_to_end(&mut bytes);
        if bytes.len() > MAX_OUTPUT {
            read_overflow.store(true, Ordering::SeqCst);
        }
        r.map(|_| bytes)
    });
    let mut writer = Some(std::thread::spawn(move || input.write_all(&bytes)));
    let deadline = Instant::now() + Duration::from_secs(150);
    let status = loop {
        if writer.as_ref().is_some_and(|w| w.is_finished())
            && writer
                .take()
                .is_some_and(|w| !matches!(w.join(), Ok(Ok(()))))
        {
            host.terminate(false);
            break Err("usage_runner_failed".into());
        }
        if overflow.load(Ordering::SeqCst) {
            host.terminate(false);
            break Err("usage_contract_invalid".into());
        }
        if Instant::now() >= deadline || host.closing.load(Ordering::SeqCst) {
            host.terminate(false);
            break Err("usage_runner_timeout".to_owned());
        }
        let mut slot = host.child.lock().unwrap_or_else(PoisonError::into_inner);
        let Some(child) = slot.as_mut() else {
            break Err("usage_cancelled".into());
        };
        match child.try_wait() {
            Ok(Some(status)) => {
                slot.take();
                break Ok(status);
            }
            Ok(None) => {}
            Err(_) => {
                drop(slot);
                host.terminate(false);
                break Err("usage_runner_failed".into());
            }
        }
        drop(slot);
        std::thread::sleep(Duration::from_millis(25));
    };
    // A selected executable could exit while an inherited pipe stays open.
    // Never join a pipe worker until it has finished, including error paths.
    if host.cancelled.load(Ordering::SeqCst) {
        return Err("usage_cancelled".into());
    }
    let status = status?;
    while !reader.is_finished() || writer.as_ref().is_some_and(|w| !w.is_finished()) {
        if host.cancelled.load(Ordering::SeqCst) {
            return Err("usage_cancelled".into());
        }
        if Instant::now() >= deadline || host.closing.load(Ordering::SeqCst) {
            return Err("usage_runner_timeout".into());
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    let output = reader
        .join()
        .map_err(|_| "usage_runner_failed")?
        .map_err(|_| "usage_runner_failed")?;
    if let Some(w) = writer {
        let _ = w.join();
    }
    if host.cancelled.load(Ordering::SeqCst) {
        return Err("usage_cancelled".into());
    }
    if output.len() > MAX_OUTPUT {
        return Err("usage_contract_invalid".into());
    }
    let value: Value = serde_json::from_slice(&output).map_err(|_| "usage_contract_invalid")?;
    if !status.success() {
        return Err(wire::runner_error(&value)
            .map(|s| format!("usage_{s}"))
            .unwrap_or_else(|| "usage_runner_failed".into()));
    }
    Ok(value)
}
fn run_request(host: &UsageHost, r: WebRequest) -> Result<Value, String> {
    if host.closing.load(Ordering::SeqCst) {
        return Err("usage_runtime_closing".into());
    }
    let _gate = host.gate.try_lock().map_err(|_| "usage_busy")?;
    let (request, op) = arguments(host, &r)?;
    let (binary, _pins) = host.selected_package(&r.package)?;
    let value = execute(host, &binary, &request)?;
    let result = wire::reply(value, op, &r.source).map_err(str::to_owned)?;
    if op == "init"
        && let Some(c) = host
            .choices
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .iter_mut()
            .find(|c| c.id == r.ledger)
    {
        c.kind = Kind::Ledger;
    }
    Ok(wire::wrap(result))
}
#[tauri::command]
pub async fn usage_call(
    window: WebviewWindow,
    state: State<'_, UsageHost>,
    request: Value,
) -> Result<Value, String> {
    if !allows_usage(window.label()) {
        return Err("permission_denied".into());
    }
    if state.closing.load(Ordering::SeqCst) {
        return Err("usage_runtime_closing".into());
    }
    if request.to_string().len() > 64 * 1024 {
        return Err("usage_invalid_request".into());
    }
    let r: WebRequest = serde_json::from_value(request).map_err(|_| "usage_invalid_request")?;
    let app = window.app_handle().clone();
    tauri::async_runtime::spawn_blocking(move || run_request(&app.state::<UsageHost>(), r))
        .await
        .map_err(|_| "usage_runner_failed".to_owned())?
}
#[tauri::command]
pub async fn usage_pick(window: WebviewWindow, kind: String) -> Result<Value, String> {
    if !allows_usage(window.label()) {
        return Err("permission_denied".into());
    }
    let kind = match kind.as_str() {
        "package" => Kind::Package,
        "ledger" => Kind::Ledger,
        "new_ledger" => Kind::NewLedger,
        "codex_root" => Kind::Codex,
        "claude_root" => Kind::Claude,
        "export" => Kind::Export,
        _ => return Err("usage_invalid_request".into()),
    };
    let app = window.app_handle().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let host = app.state::<UsageHost>();
        let _gate = host.gate.try_lock().map_err(|_| "usage_busy")?;
        if host.closing.load(Ordering::SeqCst) {
            return Err("usage_runtime_closing".into());
        }
        let dialog = rfd::FileDialog::new().set_title(match kind {
            Kind::Package => "选择独立 Usage 程序包",
            Kind::Ledger => "打开私有用量账本",
            Kind::NewLedger => "选择新账本位置（目录须尚不存在）",
            Kind::Codex => "选择授权读取的 Codex 日志根",
            Kind::Claude => "选择授权读取的 Claude 日志根",
            Kind::Export => "保存聚合 JSON（不含源正文）",
        });
        let path = if matches!(kind, Kind::Export | Kind::NewLedger) {
            dialog
                .set_file_name(if kind == Kind::Export {
                    "usage-snapshot.json"
                } else {
                    "UsageLedger"
                })
                .save_file()
        } else {
            dialog.pick_folder()
        };
        let Some(path) = path else {
            return Ok(json!({"cancelled":true}));
        };
        if !path.is_absolute() {
            return Err("usage_invalid_request".into());
        }
        let package_hash = if kind == Kind::Package {
            Some(package(&path)?.1)
        } else {
            None
        };
        let token = host.keep(kind, path, package_hash);
        Ok(json!({"token":token}))
    })
    .await
    .map_err(|_| "usage_runner_failed".to_owned())?
}
#[tauri::command]
pub async fn usage_cancel(window: WebviewWindow) -> Result<Value, String> {
    if !allows_usage(window.label()) {
        return Err("permission_denied".into());
    }
    let app = window.app_handle().clone();
    tauri::async_runtime::spawn_blocking(move || {
        Ok(json!({"stopped":app.state::<UsageHost>().cancel()}))
    })
    .await
    .map_err(|_| "usage_runner_failed".to_owned())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn manual_scope_and_request_fields_are_closed() {
        assert!(allows_usage("main"));
        for label in ["overlay", "foreign", "Main", ""] {
            assert!(!allows_usage(label));
        }
        let main: Value =
            serde_json::from_str(include_str!("../capabilities/main-window.json")).unwrap();
        let quick: Value =
            serde_json::from_str(include_str!("../capabilities/quick-search.json")).unwrap();
        for permission in ["allow-usage-call", "allow-usage-pick", "allow-usage-cancel"] {
            assert!(
                main["permissions"]
                    .as_array()
                    .unwrap()
                    .contains(&json!(permission))
            );
            assert!(
                !quick["permissions"]
                    .as_array()
                    .unwrap()
                    .contains(&json!(permission))
            );
        }
        assert!(serde_json::from_value::<WebRequest>(json!({"package":"usage-choice-0","ledger":"usage-choice-1","source":"codex_local","action":{"operation":"overview"},"path":"PRIVATE_SENTINEL"})).is_err());
        let h = UsageHost::default();
        let token = h.keep(Kind::Claude, PathBuf::from("C:\\fictional"), None);
        assert!(h.choice(&token, Kind::Codex).is_err());
        assert!(h.choice(&token, Kind::Claude).is_ok());
        h.begin_close();
        assert!(h.closing.load(Ordering::SeqCst));
        h.resume();
        assert!(!h.closing.load(Ordering::SeqCst));
    }
    #[test]
    fn selected_package_rejects_replaced_binary_and_matching_manifest() {
        let root = std::env::temp_dir().join(format!(
            "enouia-usage-package-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir(&root).unwrap();
        let write_package = |bytes: &[u8]| {
            let hash = format!("{:x}", Sha256::digest(bytes));
            std::fs::write(root.join("enouia-usage.exe"), bytes).unwrap();
            std::fs::write(
                root.join("usage-package.json"),
                json!({"kind":"enouia_usage_package","version":1,"desktop_protocol":1,
                    "binary":"enouia-usage.exe","sha256":hash})
                .to_string(),
            )
            .unwrap();
            hash
        };
        // Deliberately non-executable bytes: this fixture never launches a process.
        let first = write_package(b"fictional package A");
        let host = UsageHost::default();
        let token = host.keep(Kind::Package, root.clone(), Some(first));
        assert!(host.selected_package(&token).is_ok());
        let second = write_package(b"fictional package B");
        assert_eq!(package(&root).unwrap().1, second);
        assert!(matches!(host.selected_package(&token), Err(e) if e == "usage_binary_changed"));
        let reselected = host.keep(Kind::Package, root.clone(), Some(second));
        assert!(host.selected_package(&reselected).is_ok());
        std::fs::remove_file(root.join("usage-package.json")).unwrap();
        std::fs::remove_file(root.join("enouia-usage.exe")).unwrap();
        std::fs::remove_dir(root).unwrap();
    }
    #[test]
    #[ignore = "explicit independently built Usage runner; synthetic roots only"]
    fn real_manual_runner_package_grants_export_and_cancellation() {
        static N: AtomicU64 = AtomicU64::new(0);
        let binary =
            PathBuf::from(std::env::var_os("USAGE_TEST_RUNNER").expect("explicit Usage binary"));
        let root = std::env::temp_dir().join(format!(
            "enouia-usage-native-{}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos(),
            N.fetch_add(1, Ordering::SeqCst)
        ));
        std::fs::create_dir(&root).unwrap();
        let pkg = root.join("package");
        std::fs::create_dir(&pkg).unwrap();
        std::fs::copy(binary, pkg.join("enouia-usage.exe")).unwrap();
        let hash = format!(
            "{:x}",
            Sha256::digest(std::fs::read(pkg.join("enouia-usage.exe")).unwrap())
        );
        std::fs::write(pkg.join("usage-package.json"),json!({"kind":"enouia_usage_package","version":1,"desktop_protocol":1,"binary":"enouia-usage.exe","sha256":hash}).to_string()).unwrap();
        let source = root.join("source");
        std::fs::create_dir(&source).unwrap();
        let line=json!({"type":"assistant","timestamp":"2026-10-20T12:00:00Z","requestId":"fictional-request","message":{"id":"fictional-message","model":"fictional-model","content":"PRIVATE_SENTINEL_BODY","usage":{"input_tokens":10,"cache_read_input_tokens":3,"cache_creation_input_tokens":0,"output_tokens":2}}}).to_string()+"\n";
        std::fs::write(source.join("fictional.jsonl"), &line).unwrap();
        let host = Arc::new(UsageHost::default());
        let p = host.keep(Kind::Package, pkg.clone(), Some(hash));
        let l = host.keep(Kind::NewLedger, root.join("ledger"), None);
        let s = host.keep(Kind::Claude, source.clone(), None);
        let d = host.keep(Kind::Export, root.join("aggregate.json"), None);
        let req = |action| {
            serde_json::from_value::<WebRequest>(
                json!({"package":p,"ledger":l,"source":"claude_local","action":action}),
            )
            .unwrap()
        };
        assert_eq!(
            run_request(&host, req(json!({"operation":"init","confirm":true}))).unwrap()["result"]
                ["health"]["revision"],
            0
        );
        let action = json!({"operation":"scan","roots":[s],"models":["fictional-model"]});
        let scanned = run_request(&host, req(action.clone())).unwrap();
        assert_eq!(scanned["result"]["counts"]["input_total"], "13");
        assert!(!scanned.to_string().contains("PRIVATE_SENTINEL"));
        assert!(!scanned.to_string().contains(root.to_str().unwrap()));
        let exported=run_request(&host,req(json!({"operation":"export","start":"2026-10-19","end_exclusive":"2026-10-26","destination":d}))).unwrap();
        assert_eq!(exported["result"]["exported"], true);
        let snapshot = std::fs::read_to_string(root.join("aggregate.json")).unwrap();
        assert!(!snapshot.contains("PRIVATE_SENTINEL"));
        // A real count-only scan is interrupted; the previous confirmed revision survives.
        {
            let mut file =
                std::io::BufWriter::new(File::create(source.join("fictional.jsonl")).unwrap());
            for _ in 0..100_000 {
                file.write_all(line.as_bytes()).unwrap();
            }
            file.flush().unwrap();
        }
        let request = req(action);
        let worker_host = host.clone();
        let worker = std::thread::spawn(move || run_request(&worker_host, request));
        let limit = Instant::now() + Duration::from_secs(10);
        loop {
            if host.child.lock().unwrap().is_some() {
                break;
            }
            assert!(Instant::now() < limit);
            std::thread::sleep(Duration::from_millis(10));
        }
        assert!(host.cancel());
        assert_eq!(worker.join().unwrap(), Err("usage_cancelled".into()));
        let retained = run_request(&host, req(json!({"operation":"overview"}))).unwrap();
        assert_eq!(
            retained["result"]["health"]["revision"],
            scanned["result"]["health"]["revision"]
        );
        // Windows can briefly retain the exited image mapping; tamper the manifest's
        // expected digest to exercise the same admission mismatch without racing it.
        std::fs::write(pkg.join("usage-package.json"),json!({"kind":"enouia_usage_package","version":1,"desktop_protocol":1,"binary":"enouia-usage.exe","sha256":"0".repeat(64)}).to_string()).unwrap();
        assert_eq!(
            run_request(&host, req(json!({"operation":"overview"}))),
            Err("usage_binary_changed".into())
        );
        host.shutdown();
        drop(host);
        assert_eq!(root.parent(), Some(std::env::temp_dir().as_path()));
        std::fs::remove_dir_all(root).unwrap();
    }
}
