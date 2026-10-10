//! Runtime's Activity adapter (ADR-028).
//!
//! The Activity surface reaches the independently installed producer only
//! through the installed `enouia-activity.exe`, so the shell shares that
//! package's version and writer lock and never writes the store itself.
//! The page sends Activity IPC v1 requests (contracts/ipc/activity-v1) to
//! `activity_call`; `activity_setup` chooses the installed package.
//!
//! This module only:
//! - validates requests and the selected package's `install.json`,
//! - checks the runner's SHA-256 against that manifest before every start,
//! - runs bounded, windowless subprocesses off the UI thread,
//! - reports the installed task's registration through a read-only query.
//!
//! It never registers, enables or changes a scheduled task, never sends
//! paths or subprocess text to the page, and never touches Memory. Closing
//! or exiting the shell leaves a started run to finish on its own.

use serde_json::{Map, Value, json};
use sha2::{Digest, Sha256};
use std::collections::VecDeque;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, PoisonError};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, State, WebviewWindow};

const READ_TIMEOUT: Duration = Duration::from_secs(20);
const PAUSE_TIMEOUT: Duration = Duration::from_secs(30);
/// Above the runner's own 900-second ceiling, so it normally ends itself.
const RUN_TIMEOUT: Duration = Duration::from_secs(960);
const MAX_OUTPUT: usize = 8 * 1024 * 1024;
const MAX_MANIFEST: u64 = 64 * 1024;
const KEPT_RUNS: usize = 16;
const SETTINGS_FILE: &str = "activity-install.json";

/// The installed package as `install.json` describes it, after validation.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Install {
    root: PathBuf,
    binary: PathBuf,
    config: PathBuf,
    binary_sha256: String,
    task_name: String,
    marker: String,
    mode: String,
}

#[derive(Clone, Debug)]
struct RunRecord {
    id: String,
    operation: &'static str,
    stage: &'static str,
    error: Value,
    summary: Value,
}

#[derive(Default)]
struct Runs {
    active: Option<String>,
    records: VecDeque<RunRecord>,
}

#[derive(Default)]
pub struct ActivityHost {
    install: Mutex<Option<Install>>,
    loaded: Mutex<bool>,
    /// Outcome of an explicit forget attempt in this host, retained across
    /// page remounts. Missing/invalid settings alone are not a clear failure.
    last_clear_saved: Mutex<Option<bool>>,
    runs: Arc<Mutex<Runs>>,
    counter: AtomicU64,
    settings_file: Option<PathBuf>,
}

impl ActivityHost {
    pub fn new(args: &[String]) -> Self {
        Self {
            settings_file: settings_argument(args)
                .expect("--activity-settings requires one absolute file path"),
            ..Self::default()
        }
    }

    fn current(&self, app: &AppHandle) -> Option<Install> {
        let mut loaded = self.loaded.lock().unwrap_or_else(PoisonError::into_inner);
        let mut install = self.install.lock().unwrap_or_else(PoisonError::into_inner);
        if !*loaded {
            *loaded = true;
            *install = saved_root(app).and_then(|root| load_install(&root).ok());
        }
        install.clone()
    }
}

/// A native launch option used by isolated acceptance. The page cannot set it.
fn settings_argument(args: &[String]) -> Result<Option<PathBuf>, ()> {
    let mut matches = args
        .iter()
        .enumerate()
        .filter(|(_, arg)| *arg == "--activity-settings");
    let Some((index, _)) = matches.next() else {
        return Ok(None);
    };
    if matches.next().is_some() {
        return Err(());
    }
    let file = args.get(index + 1).map(PathBuf::from).ok_or(())?;
    if !file.is_absolute() || file.file_name().is_none() {
        return Err(());
    }
    Ok(Some(file))
}

fn settings_path(app: &AppHandle) -> Option<PathBuf> {
    if let Some(file) = &app.state::<ActivityHost>().settings_file {
        return Some(file.clone());
    }
    app.path()
        .app_config_dir()
        .ok()
        .map(|dir| dir.join(SETTINGS_FILE))
}

fn saved_root(app: &AppHandle) -> Option<PathBuf> {
    read_saved_root(&settings_path(app)?)
}

fn read_saved_root(path: &Path) -> Option<PathBuf> {
    // This file records a canonical native picker choice, never a path
    // relative to the process's current directory. Bound reads on the same
    // open handle so a damaged/growing settings file cannot allocate freely.
    let value = read_bounded_json(path)?;
    let root = value
        .get("installRoot")
        .and_then(Value::as_str)
        .map(PathBuf::from)?;
    root.is_absolute().then_some(root)
}

fn read_bounded_json(path: &Path) -> Option<Value> {
    bounded_json(std::fs::File::open(path).ok()?)
}

/// Count bytes from the open reader instead of trusting an earlier size query.
/// The extra byte distinguishes an exact-limit document from a growing file.
fn bounded_json(reader: impl Read) -> Option<Value> {
    let mut bytes = Vec::new();
    reader.take(MAX_MANIFEST + 1).read_to_end(&mut bytes).ok()?;
    if bytes.len() as u64 > MAX_MANIFEST {
        return None;
    }
    serde_json::from_slice(&bytes).ok()
}

fn save_root(app: &AppHandle, root: Option<&Path>) -> bool {
    let Some(path) = settings_path(app) else {
        return false;
    };
    save_root_at(&path, root)
}

fn save_root_at(path: &Path, root: Option<&Path>) -> bool {
    match root {
        // An existence query can also return false when access is denied.
        // Only deletion or an explicit missing-file error proves this clear.
        None => match std::fs::remove_file(path) {
            Ok(()) => true,
            Err(error) => error.kind() == std::io::ErrorKind::NotFound,
        },
        Some(root) => {
            let Some(parent) = path.parent() else {
                return false;
            };
            let bytes = format!("{}\n", json!({"installRoot": root}));
            root.is_absolute()
                && bytes.len() as u64 <= MAX_MANIFEST
                && std::fs::create_dir_all(parent).is_ok()
                && replace_saved_choice(path, |file| file.write_all(bytes.as_bytes())).is_ok()
        }
    }
}

/// Never truncate the selected choice. A failed write/flush/replacement leaves
/// the old file intact; ordinary failures remove only this attempt's staging
/// file. A killed process can leave an ignored staging file, never a startup
/// choice. This is a local filesystem replacement, not a power-loss guarantee.
fn replace_saved_choice(
    path: &Path,
    write: impl FnOnce(&mut std::fs::File) -> std::io::Result<()>,
) -> std::io::Result<()> {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let name = path.file_name().ok_or(std::io::ErrorKind::InvalidInput)?;
    let mut staged_name = std::ffi::OsString::from(".");
    staged_name.push(name);
    staged_name.push(format!(
        ".{}-{}-{}.tmp",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(std::io::Error::other)?
            .as_nanos(),
        COUNTER.fetch_add(1, Ordering::Relaxed)
    ));
    let staged = path.with_file_name(staged_name);
    // create_new refuses collisions; it never opens another attempt's file.
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&staged)?;
    let result = write(&mut file).and_then(|()| file.sync_all());
    drop(file);
    let result = result.and_then(|()| std::fs::rename(&staged, path));
    if result.is_err() {
        let _ = std::fs::remove_file(&staged);
    }
    result
}

fn is_hex(text: &str, length: usize) -> bool {
    text.len() == length && text.bytes().all(|b| b.is_ascii_hexdigit())
}

fn valid_marker(marker: &str) -> bool {
    marker
        .strip_prefix("Enouia.Activity.Package.v1:")
        .is_some_and(|guid| {
            guid.len() == 36
                && guid.bytes().enumerate().all(|(i, b)| match i {
                    8 | 13 | 18 | 23 => b == b'-',
                    _ => b.is_ascii_digit() || (b'a'..=b'f').contains(&b),
                })
        })
}

fn valid_task_name(name: &str) -> bool {
    name.strip_prefix("Enouia-Activity-").is_some_and(|rest| {
        (1..=80).contains(&rest.len())
            && rest
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    })
}

fn same_file(listed: Option<&str>, expected: &Path) -> bool {
    listed.is_some_and(|listed| {
        std::fs::canonicalize(listed)
            .ok()
            .zip(std::fs::canonicalize(expected).ok())
            .is_some_and(|(a, b)| a == b)
    })
}

fn file_sha256(path: &Path) -> Option<String> {
    let mut file = std::fs::File::open(path).ok()?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0_u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer).ok()?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Some(
        hasher
            .finalize()
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect(),
    )
}

/// Validate an installed package folder written by `install-activity.ps1`.
pub fn load_install(root: &Path) -> Result<Install, &'static str> {
    let root = std::fs::canonicalize(root).map_err(|_| "not_found")?;
    let manifest = root.join("install.json");
    let value = read_bounded_json(&manifest).ok_or("not_a_package")?;
    let text = |key: &str| value.get(key).and_then(Value::as_str);
    let binary = root.join("enouia-activity.exe");
    let config = root.join("activity-config.json");
    let marker = text("marker").unwrap_or_default();
    let task_name = text("taskName").unwrap_or_default();
    let mode = text("mode").unwrap_or_default();
    let hash = text("binaryHash").unwrap_or_default().to_ascii_lowercase();
    if value.get("schemaVersion").and_then(Value::as_u64) != Some(1)
        || !valid_marker(marker)
        || !valid_task_name(task_name)
        || !matches!(mode, "sandbox" | "production")
        || !is_hex(&hash, 64)
        || !same_file(text("binary"), &binary)
        || !same_file(text("config"), &config)
    {
        return Err("not_a_package");
    }
    if file_sha256(&binary).as_deref() != Some(hash.as_str()) {
        return Err("binary_changed");
    }
    Ok(Install {
        root,
        binary,
        config,
        binary_sha256: hash,
        task_name: task_name.to_owned(),
        marker: marker.to_owned(),
        mode: mode.to_owned(),
    })
}

fn error(code: &str, component: &str, retryable: bool) -> Value {
    json!({"schemaVersion": 1, "kind": "activity_error",
        "error": {"code": code, "component": component, "retryable": retryable}})
}

/// Exit, then stdout JSON. Errors are stable codes, never subprocess text.
fn invoke(
    install: &Install,
    command: &[&str],
    timeout: Duration,
) -> Result<(i32, Value), &'static str> {
    // The page can only start the exact runner the package manifest names.
    if file_sha256(&install.binary).as_deref() != Some(install.binary_sha256.as_str()) {
        return Err("unconfigured");
    }
    let mut process = Command::new(&install.binary);
    process
        .args(command)
        .arg("--config")
        .arg(&install.config)
        .current_dir(&install.root);
    let (code, bytes) = bounded_output(process, timeout)?;
    let value = serde_json::from_slice(&bytes).map_err(|_| "contract_invalid")?;
    Ok((code, value))
}

fn bounded_output(mut process: Command, timeout: Duration) -> Result<(i32, Vec<u8>), &'static str> {
    process
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        process.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let mut child = process.spawn().map_err(|_| "unconfigured")?;
    let stdout = child.stdout.take().ok_or("storage_failed")?;
    #[cfg(windows)]
    {
        bounded_windows_pipe(child, stdout, timeout)
    }
    #[cfg(not(windows))]
    {
        let mut stdout = stdout;
        let reader = std::thread::spawn(move || {
            let mut bytes = Vec::new();
            let complete = (&mut stdout)
                .take(MAX_OUTPUT as u64 + 1)
                .read_to_end(&mut bytes)
                .is_ok()
                && bytes.len() <= MAX_OUTPUT;
            complete.then_some(bytes)
        });
        let deadline = Instant::now() + timeout;
        let status = loop {
            match child.try_wait() {
                Ok(Some(status)) => break status,
                Ok(None) if Instant::now() < deadline => {
                    std::thread::sleep(Duration::from_millis(25));
                }
                _ => {
                    let _ = child.kill();
                    let _ = child.wait();
                    let _ = reader.join();
                    return Err("busy");
                }
            }
        };
        let bytes = reader.join().ok().flatten().ok_or("contract_invalid")?;
        Ok((status.code().unwrap_or(-1), bytes))
    }
}

#[cfg(windows)]
fn bounded_windows_pipe(
    mut child: std::process::Child,
    mut stdout: std::process::ChildStdout,
    timeout: Duration,
) -> Result<(i32, Vec<u8>), &'static str> {
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::Foundation::ERROR_BROKEN_PIPE;
    use windows_sys::Win32::System::Pipes::PeekNamedPipe;
    let result = (|| {
        let deadline = Instant::now() + timeout;
        let mut bytes = Vec::new();
        let mut buffer = [0_u8; 64 * 1024];
        let mut status = None;
        let mut eof = false;
        let mut idle_delay = Duration::from_millis(1);
        loop {
            let mut available = 0;
            if !eof {
                // This thread exclusively owns the anonymous pipe's read
                // handle, with no outstanding read or cloned reader. Probe
                // before each read; never block awaiting a descendant's EOF.
                // https://learn.microsoft.com/windows/win32/api/namedpipeapi/nf-namedpipeapi-peeknamedpipe
                // SAFETY: stdout owns a live read handle; available is a live
                // local DWORD. All other optional output pointers are null.
                let success = unsafe {
                    PeekNamedPipe(
                        stdout.as_raw_handle(),
                        std::ptr::null_mut(),
                        0,
                        std::ptr::null_mut(),
                        &mut available,
                        std::ptr::null_mut(),
                    )
                };
                if success == 0 {
                    if std::io::Error::last_os_error().raw_os_error()
                        == Some(ERROR_BROKEN_PIPE as i32)
                    {
                        eof = true;
                    } else {
                        return Err("contract_invalid");
                    }
                } else if available > 0 {
                    idle_delay = Duration::from_millis(1);
                    let limit = (available as usize)
                        .min(buffer.len())
                        .min(MAX_OUTPUT + 1 - bytes.len());
                    let count = stdout
                        .read(&mut buffer[..limit])
                        .map_err(|_| "contract_invalid")?;
                    eof = count == 0;
                    bytes.extend_from_slice(&buffer[..count]);
                    if bytes.len() > MAX_OUTPUT {
                        return Err("contract_invalid");
                    }
                }
            }
            if status.is_none() {
                status = child.try_wait().map_err(|_| "busy")?;
            }
            if let Some(status) = status.filter(|_| eof) {
                return Ok((status.code().unwrap_or(-1), bytes));
            }
            let Some(remaining) = deadline.checked_duration_since(Instant::now()) else {
                return Err("busy");
            };
            if available == 0 {
                std::thread::sleep(remaining.min(idle_delay));
                idle_delay = (idle_delay * 2).min(Duration::from_millis(25));
            }
        }
    })();
    if result.is_err() {
        // Only this explicitly owned direct child is terminated. No Job with
        // kill-on-host-exit is introduced; a started run still survives UI exit.
        let _ = child.kill();
        let _ = child.wait();
    }
    result
}

/// Map a runner exit to the structured code the page shows.
fn exit_error(code: i32, value: &Value) -> Value {
    if value.get("kind").and_then(Value::as_str) == Some("activity_error") {
        return value.clone();
    }
    match code {
        3 => error("busy", "activity_archive", true),
        5 => error("unconfigured", "activity_archive", false),
        _ => error("storage_failed", "activity_archive", false),
    }
}

fn read(install: &Install, command: &str) -> Value {
    match invoke(install, &[command], READ_TIMEOUT) {
        Ok((0, value)) => value,
        Ok((code, value)) => exit_error(code, &value),
        Err(code) => error(code, "activity_archive", code == "busy"),
    }
}

/// Registration and enablement of the package's own task, read-only.
fn query_task(install: &Install) -> (Value, Value) {
    let system = std::env::var_os("SystemRoot").map(PathBuf::from);
    let Some(schtasks) = system.map(|root| root.join("System32").join("schtasks.exe")) else {
        return (Value::Null, Value::Null);
    };
    let mut process = Command::new(schtasks);
    process
        .args(["/Query", "/TN"])
        .arg(format!("\\{}", install.task_name))
        .arg("/XML");
    let Ok((code, bytes)) = bounded_output(process, READ_TIMEOUT) else {
        return (Value::Null, Value::Null);
    };
    if code != 0 {
        // A failed query can mean absence or access denied. Neither proves
        // registration state, and localized stderr never becomes a DTO.
        return (Value::Null, Value::Null);
    }
    let task = task_state(&decode(&bytes), &install.marker);
    let next = if task["registered"] == true && task["enabled"] == true {
        query_next_trigger(install)
    } else {
        Value::Null
    };
    (task, next)
}

/// NextRunTime is an observation, not a prediction from the XML trigger.
/// Recheck ownership/enablement in the same COM read. Individually disabled
/// triggers can influence Windows' result, so any such trigger makes it unknown.
fn query_next_trigger(install: &Install) -> Value {
    let Some(system) = std::env::var_os("SystemRoot").map(PathBuf::from) else {
        return Value::Null;
    };
    // Both substitutions are allowlisted by load_install, with no quote or
    // shell metacharacters. Use Windows' own PowerShell, never a PATH lookup.
    let script = format!(
        r#"$ErrorActionPreference='Stop'; [Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
try {{
 $service=New-Object -ComObject 'Schedule.Service'; $service.Connect()
 $task=$service.GetFolder('\').GetTask('{name}')
 if ($task.Definition.RegistrationInfo.Source -cne '{marker}' -or -not $task.Enabled) {{ 'null'; exit 0 }}
 foreach ($trigger in $task.Definition.Triggers) {{ if (-not $trigger.Enabled) {{ 'null'; exit 0 }} }}
 $next=[datetime]$task.NextRunTime
 if ($next -le [datetime]::Now) {{ 'null'; exit 0 }}
 $next.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ',[Globalization.CultureInfo]::InvariantCulture) | ConvertTo-Json -Compress
}} catch {{ 'null' }}"#,
        name = install.task_name,
        marker = install.marker
    );
    let mut process = Command::new(system.join("System32/WindowsPowerShell/v1.0/powershell.exe"));
    process.args([
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        &script,
    ]);
    match bounded_output(process, READ_TIMEOUT) {
        Ok((0, bytes)) => serde_json::from_slice::<Value>(&bytes)
            .ok()
            .filter(valid_next_trigger)
            .unwrap_or(Value::Null),
        _ => Value::Null,
    }
}

fn valid_next_trigger(value: &Value) -> bool {
    let Some(text) = value.as_str() else {
        return false;
    };
    let b = text.as_bytes();
    b.len() == 24
        && text.is_ascii()
        && real_date(&text[..10])
        && &text[..4] >= "1601"
        && b[10] == b'T'
        && b[13] == b':'
        && b[16] == b':'
        && b[19] == b'.'
        && b[23] == b'Z'
        && [11..13, 14..16, 17..19, 20..23]
            .iter()
            .all(|range| b[range.clone()].iter().all(u8::is_ascii_digit))
        && &text[11..13] < "24"
        && &text[14..16] < "60"
        && &text[17..19] < "60"
}

fn decode(bytes: &[u8]) -> String {
    if bytes.starts_with(&[0xFF, 0xFE]) {
        let units: Vec<u16> = bytes[2..]
            .as_chunks::<2>()
            .0
            .iter()
            .map(|pair| u16::from_le_bytes(*pair))
            .collect();
        String::from_utf16_lossy(&units)
    } else {
        String::from_utf8_lossy(bytes).into_owned()
    }
}

fn element<'a>(xml: &'a str, name: &str) -> Option<&'a str> {
    let open = format!("<{name}>");
    let start = xml.find(&open)? + open.len();
    let end = xml[start..].find(&format!("</{name}>"))? + start;
    Some(&xml[start..end])
}

/// A task is ours only if its registration source is the package marker.
fn task_state(xml: &str, marker: &str) -> Value {
    if element(xml, "Source").map(str::trim) != Some(marker) {
        return json!({"registered": false, "enabled": null});
    }
    let enabled = element(xml, "Settings")
        .and_then(|settings| element(settings, "Enabled"))
        .is_none_or(|value| value.trim() == "true");
    json!({"registered": true, "enabled": enabled})
}

fn real_date(text: &str) -> bool {
    let b = text.as_bytes();
    if b.len() != 10 || !text.is_ascii() || b[4] != b'-' || b[7] != b'-' {
        return false;
    }
    let number = |range: std::ops::Range<usize>| -> Option<u32> {
        let part = &text[range];
        part.bytes()
            .all(|c| c.is_ascii_digit())
            .then(|| part.parse().ok())
            .flatten()
    };
    let (Some(year), Some(month), Some(day)) = (number(0..4), number(5..7), number(8..10)) else {
        return false;
    };
    let leap = (year % 4 == 0 && year % 100 != 0) || year % 400 == 0;
    let days = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if leap => 29,
        2 => 28,
        _ => return false,
    };
    (1..=days).contains(&day)
}

/// A validated IPC v1 request.
#[derive(Debug, PartialEq, Eq)]
pub enum Request {
    Overview,
    Days {
        source: String,
        from: String,
        to: String,
    },
    Preview,
    RunNow,
    RetryPending,
    SetPaused(bool),
    GetRun(String),
}

fn exact_keys(request: &Map<String, Value>, keys: &[&str]) -> bool {
    request.len() == keys.len() && keys.iter().all(|key| request.contains_key(*key))
}

pub fn parse_request(request: &Value) -> Option<Request> {
    let object = request.as_object()?;
    let field = |key: &str| object.get(key).and_then(Value::as_str);
    match field("operation")? {
        operation @ ("activity_get_overview"
        | "activity_preview_public_payload"
        | "activity_run_now"
        | "activity_retry_pending") => {
            exact_keys(object, &["operation"]).then_some(())?;
            Some(match operation {
                "activity_get_overview" => Request::Overview,
                "activity_preview_public_payload" => Request::Preview,
                "activity_run_now" => Request::RunNow,
                _ => Request::RetryPending,
            })
        }
        "activity_get_days" => {
            let (source, from, to) = (field("source")?, field("from")?, field("to")?);
            (exact_keys(object, &["operation", "source", "from", "to"])
                && matches!(source, "github" | "codex" | "claude")
                && real_date(from)
                && real_date(to)
                && from <= to)
                .then(|| Request::Days {
                    source: source.to_owned(),
                    from: from.to_owned(),
                    to: to.to_owned(),
                })
        }
        "activity_set_paused" => exact_keys(object, &["operation", "paused"])
            .then(|| object.get("paused").and_then(Value::as_bool))
            .flatten()
            .map(Request::SetPaused),
        "activity_get_run" => {
            let id = field("runId")?;
            (exact_keys(object, &["operation", "runId"])
                && (1..=128).contains(&id.len())
                && id
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_'))
            .then(|| Request::GetRun(id.to_owned()))
        }
        _ => None,
    }
}

/// `activity_days` from one preview read: the same allowlisted history.
fn days(preview: &Value, source: &str, from: &str, to: &str) -> Value {
    if preview.get("kind").and_then(Value::as_str) != Some("activity_public_preview") {
        return preview.clone();
    }
    let invalid = || error("contract_invalid", "activity_archive", false);
    if preview["schemaVersion"].as_f64() != Some(1.0)
        || preview["data"]["version"].as_f64() != Some(1.0)
    {
        return invalid();
    }
    let Some(snapshot) = preview["data"]["sources"]
        .as_object()
        .and_then(|sources| sources.get(source))
    else {
        return invalid();
    };
    // An explicit null source means no history. Missing or malformed data
    // must never become an apparently valid empty day list.
    let entries: &[Value] = if snapshot.is_null() {
        &[]
    } else if let Some(entries) = snapshot
        .as_object()
        .and_then(|snapshot| snapshot.get("days"))
        .and_then(Value::as_array)
    {
        entries
    } else {
        return invalid();
    };
    let mut previous = "";
    let mut total = 0_u64;
    const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;
    // Validate the entire requested source before filtering. Otherwise an
    // invalid entry outside the range disappears before the client sees it.
    for day in entries {
        let Some(object) = day.as_object() else {
            return invalid();
        };
        let Some(date) = day["date"].as_str() else {
            return invalid();
        };
        let Some(value) = day["value"].as_f64() else {
            return invalid();
        };
        if !exact_keys(object, &["date", "value"])
            || !real_date(date)
            || date <= previous
            || !(0.0..=MAX_SAFE_INTEGER as f64).contains(&value)
            || value.fract() != 0.0
        {
            return invalid();
        }
        total += value as u64;
        if total > MAX_SAFE_INTEGER {
            return invalid();
        }
        previous = date;
    }
    let days: Vec<Value> = entries
        .iter()
        .filter(|day| {
            day["date"]
                .as_str()
                .is_some_and(|date| date >= from && date <= to)
        })
        .cloned()
        .collect();
    json!({"schemaVersion": 1, "kind": "activity_days", "source": source, "days": days})
}

fn add_schedule(mut overview: Value, task: Value, next: Value, running: bool) -> Value {
    if overview.get("kind").and_then(Value::as_str) != Some("activity_overview") {
        return overview;
    }
    // The client validates the complete DTO. Before decorating it here,
    // require the container that mutable JSON indexing would otherwise
    // create from null or panic on for a primitive/array.
    if !overview["schedule"].is_object() {
        return error("contract_invalid", "activity_archive", false);
    }
    let state = match (task["registered"].as_bool(), task["enabled"].as_bool()) {
        (Some(true), Some(true)) => "healthy",
        (Some(true), _) => "degraded",
        _ => "unavailable",
    };
    let schedule = &mut overview["schedule"];
    if running {
        schedule["mode"] = json!("running");
    }
    schedule["task"] = task;
    schedule["nextTriggerAt"] = next;
    let mode = schedule["mode"].clone();
    let observed = overview["generatedAt"].clone();
    if let Some(health) = overview["health"].as_array_mut() {
        health.push(
            json!({"id": "activity_scheduler", "state": state, "mode": mode,
            "observedAt": observed, "lastSuccessAt": null, "ageSeconds": null}),
        );
    }
    overview
}

/// Runner exit to a run stage: completed, blocked (busy, paused, not due,
/// delivery unresolved or disabled) or failed.
fn finished(code: Result<(i32, Value), &'static str>) -> (&'static str, Value, Value) {
    match code {
        Ok((0 | 2, summary)) => ("completed", Value::Null, summary),
        Ok((code @ (3 | 4), summary)) => {
            let error = match code {
                3 => error("busy", "activity_archive", true),
                _ => error("delivery_unverified", "activity_delivery", true),
            };
            ("blocked", error["error"].clone(), summary)
        }
        Ok((code, summary)) => {
            let component = if code == 5 {
                "activity_delivery"
            } else {
                "activity_archive"
            };
            let name = summary
                .get("errorCode")
                .and_then(Value::as_str)
                .filter(|c| {
                    matches!(
                        *c,
                        "busy"
                            | "unconfigured"
                            | "unsupported_method"
                            | "source_invalid"
                            | "clock_regression"
                            | "storage_failed"
                            | "delivery_unverified"
                            | "contract_invalid"
                    )
                })
                .unwrap_or(if code == 5 {
                    "unconfigured"
                } else {
                    "storage_failed"
                })
                .to_owned();
            (
                "failed",
                json!({"code": name, "component": component, "retryable": false}),
                summary,
            )
        }
        Err(code) => (
            "failed",
            json!({"code": code, "component": "activity_archive", "retryable": code == "busy"}),
            Value::Null,
        ),
    }
}

fn run_status(record: &RunRecord) -> Value {
    json!({"schemaVersion": 1, "kind": "activity_run_status", "runId": record.id,
        "stage": record.stage, "error": record.error, "operation": record.operation,
        "summary": record.summary})
}

fn start_run(host: &ActivityHost, install: Install, operation: &'static str) -> Value {
    let id = {
        let mut runs = host.runs.lock().unwrap_or_else(PoisonError::into_inner);
        if runs.active.is_some() {
            return error("busy", "activity_archive", true);
        }
        let started = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |d| d.as_millis());
        let id = format!(
            "run-{started}-{}",
            host.counter.fetch_add(1, Ordering::SeqCst)
        );
        runs.active = Some(id.clone());
        runs.records.push_back(RunRecord {
            id: id.clone(),
            operation,
            stage: "running",
            error: Value::Null,
            summary: Value::Null,
        });
        while runs.records.len() > KEPT_RUNS {
            runs.records.pop_front();
        }
        id
    };
    let runs = host.runs.clone();
    let run_id = id.clone();
    std::thread::spawn(move || {
        let command = if operation == "activity_run_now" {
            "sync"
        } else {
            "retry-pending"
        };
        let (stage, error, summary) = finished(invoke(&install, &[command], RUN_TIMEOUT));
        let mut runs = runs.lock().unwrap_or_else(PoisonError::into_inner);
        if let Some(record) = runs.records.iter_mut().find(|r| r.id == run_id) {
            record.stage = stage;
            record.error = error;
            record.summary = summary;
        }
        runs.active = None;
    });
    json!({"schemaVersion": 1, "kind": "activity_run_accepted", "runId": id})
}

fn handle(host: &ActivityHost, app: &AppHandle, request: &Value) -> Value {
    let Some(request) = parse_request(request) else {
        return error("contract_invalid", "activity_archive", false);
    };
    if let Request::GetRun(id) = &request {
        let runs = host.runs.lock().unwrap_or_else(PoisonError::into_inner);
        return runs.records.iter().find(|r| &r.id == id).map_or_else(
            || error("contract_invalid", "activity_archive", false),
            run_status,
        );
    }
    let Some(install) = host.current(app) else {
        return error("unconfigured", "activity_archive", false);
    };
    match request {
        Request::Overview => {
            let running = host
                .runs
                .lock()
                .unwrap_or_else(PoisonError::into_inner)
                .active
                .is_some();
            let (task, next) = query_task(&install);
            add_schedule(read(&install, "overview"), task, next, running)
        }
        Request::Preview => read(&install, "preview"),
        Request::Days { source, from, to } => days(&read(&install, "preview"), &source, &from, &to),
        Request::RunNow => start_run(host, install, "activity_run_now"),
        Request::RetryPending => start_run(host, install, "activity_retry_pending"),
        Request::SetPaused(paused) => {
            let flag = if paused { "true" } else { "false" };
            match invoke(&install, &["set-paused", flag], PAUSE_TIMEOUT) {
                Ok((0, value)) if value["paused"].as_bool() == Some(paused) => json!({
                    "schemaVersion": 1, "kind": "activity_pause_acknowledged", "paused": paused}),
                Ok((code, value)) => exit_error(code, &value),
                Err(code) => error(code, "activity_archive", code == "busy"),
            }
        }
        Request::GetRun(_) => unreachable!("handled above"),
    }
}

/// One Activity IPC v1 request from the main window.
#[tauri::command]
pub async fn activity_call(
    app: AppHandle,
    window: WebviewWindow,
    request: Value,
) -> Result<Value, String> {
    if window.label() != "main" {
        return Err("permission_denied".to_owned());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let host = app.state::<ActivityHost>();
        handle(&host, &app, &request)
    })
    .await
    .map_err(|_| "worker_failed".to_owned())
}

fn setup_status(install: Option<&Install>) -> Value {
    match install {
        None => json!({"configured": false}),
        Some(install) => json!({
            "configured": true,
            "mode": install.mode,
            "taskName": install.task_name,
            "folder": install.root.file_name().map(|n| n.to_string_lossy().into_owned()),
        }),
    }
}

/// Recheck the connected saved choice on every status read. A cached in-window
/// connection alone does not prove that a future host can load the choice.
/// When disconnected, retain only the last explicit clear attempt's outcome;
/// an unreadable or invalid startup choice is not evidence of a failed clear.
fn setup_status_with_saved(
    install: Option<&Install>,
    saved: Option<PathBuf>,
    last_clear_saved: Option<bool>,
) -> Value {
    let mut status = setup_status(install);
    if let Some(install) = install {
        status["saved"] = json!(
            saved
                .and_then(|root| std::fs::canonicalize(root).ok())
                .is_some_and(|root| root == install.root)
        );
    } else if let Some(saved) = last_clear_saved {
        status["saved"] = json!(saved);
    }
    status
}

/// Choose, forget or report the installed Activity package. Only the
/// folder name, mode and task name reach the page.
#[tauri::command]
pub async fn activity_setup(
    host: State<'_, ActivityHost>,
    app: AppHandle,
    window: WebviewWindow,
    action: String,
) -> Result<Value, String> {
    if window.label() != "main" {
        return Err("permission_denied".to_owned());
    }
    if matches!(action.as_str(), "clear" | "select")
        && host
            .runs
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .active
            .is_some()
    {
        return Err("busy".to_owned());
    }
    match action.as_str() {
        "status" => {
            let handle = app.clone();
            tauri::async_runtime::spawn_blocking(move || {
                let host = handle.state::<ActivityHost>();
                let install = host.current(&handle);
                let last_clear_saved = *host
                    .last_clear_saved
                    .lock()
                    .unwrap_or_else(PoisonError::into_inner);
                setup_status_with_saved(install.as_ref(), saved_root(&handle), last_clear_saved)
            })
            .await
            .map_err(|_| "worker_failed".to_owned())
        }
        "clear" => {
            // Keep admission serialized through the native choice mutation.
            let runs = host.runs.lock().unwrap_or_else(PoisonError::into_inner);
            if runs.active.is_some() {
                return Err("busy".to_owned());
            }
            *host.install.lock().unwrap_or_else(PoisonError::into_inner) = None;
            *host.loaded.lock().unwrap_or_else(PoisonError::into_inner) = true;
            let saved = save_root(&app, None);
            *host
                .last_clear_saved
                .lock()
                .unwrap_or_else(PoisonError::into_inner) = Some(saved);
            Ok(json!({"configured": false, "saved": saved}))
        }
        "select" => {
            let handle = app.clone();
            tauri::async_runtime::spawn_blocking(move || {
                let Some(root) = rfd::FileDialog::new()
                    .set_title("Choose the installed Activity package folder")
                    .pick_folder()
                else {
                    return Ok(json!({"cancelled": true}));
                };
                // The dialog itself never holds the run lock. Recheck after
                // it returns, then serialize validation/save/choice replacement.
                let host = handle.state::<ActivityHost>();
                let runs = host.runs.lock().unwrap_or_else(PoisonError::into_inner);
                if runs.active.is_some() {
                    return Err("busy".to_owned());
                }
                match load_install(&root) {
                    Ok(install) => {
                        let saved = save_root(&handle, Some(&install.root));
                        let host = handle.state::<ActivityHost>();
                        *host.install.lock().unwrap_or_else(PoisonError::into_inner) =
                            Some(install.clone());
                        *host.loaded.lock().unwrap_or_else(PoisonError::into_inner) = true;
                        *host
                            .last_clear_saved
                            .lock()
                            .unwrap_or_else(PoisonError::into_inner) = None;
                        let mut status = setup_status(Some(&install));
                        status["saved"] = json!(saved);
                        Ok(status)
                    }
                    Err(code) => Ok(json!({"configured": false, "error": code})),
                }
            })
            .await
            .map_err(|_| "worker_failed".to_owned())?
        }
        _ => Err("invalid_request".to_owned()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(windows)]
    fn pipe_fixture_command(mode: &str) -> Command {
        static EXECUTABLE: std::sync::OnceLock<PathBuf> = std::sync::OnceLock::new();
        let executable = EXECUTABLE.get_or_init(|| {
            let directory = choice_fixture();
            let executable = directory.join("pipe-child.exe");
            let source = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/pipe-child.rs");
            let compiler = std::env::var_os("RUSTC").unwrap_or_else(|| "rustc".into());
            let output = Command::new(compiler)
                .arg("--edition=2024")
                .arg(source)
                .arg("-o")
                .arg(&executable)
                .output()
                .unwrap();
            assert!(
                output.status.success(),
                "{}",
                String::from_utf8_lossy(&output.stderr)
            );
            executable
        });
        let mut command = Command::new(executable);
        command.arg(mode);
        command
    }

    #[cfg(windows)]
    fn spawn_pipe_fixture(
        mut command: Command,
    ) -> (std::process::Child, std::process::ChildStdout) {
        use std::os::windows::process::CommandExt;
        command
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .creation_flags(0x0800_0000);
        let mut child = command.spawn().unwrap();
        let stdout = child.stdout.take().unwrap();
        (child, stdout)
    }

    #[cfg(windows)]
    #[test]
    fn runner_pipe_preserves_complete_output_and_nonzero_exit() {
        for (mode, code) in [("small", 0), ("failure", 5)] {
            let output =
                bounded_output(pipe_fixture_command(mode), Duration::from_secs(5)).unwrap();
            assert_eq!(output, (code, b"{\"synthetic\":true}".to_vec()));
        }
    }

    #[cfg(windows)]
    #[test]
    fn runner_pipe_accepts_exact_limit_and_refuses_the_probe_byte() {
        let exact = bounded_output(pipe_fixture_command("exact"), Duration::from_secs(15)).unwrap();
        assert_eq!(exact.0, 0);
        assert_eq!(exact.1, vec![b'x'; MAX_OUTPUT]);
        assert_eq!(
            bounded_output(pipe_fixture_command("oversize"), Duration::from_secs(15)),
            Err("contract_invalid")
        );
    }

    #[cfg(windows)]
    #[test]
    fn runner_pipe_deadline_covers_exited_and_live_parents_with_inherited_stdout() {
        for mode in ["leaked", "leaked-hanging"] {
            let directory = choice_fixture();
            let mut command = pipe_fixture_command(mode);
            command.arg(&directory);
            let (child, stdout) = spawn_pipe_fixture(command);
            let ready_deadline = Instant::now() + Duration::from_secs(3);
            while !directory.join("ready").exists() && Instant::now() < ready_deadline {
                std::thread::sleep(Duration::from_millis(10));
            }
            let start = Instant::now();
            let result = bounded_windows_pipe(child, stdout, Duration::from_millis(200));
            let elapsed = start.elapsed();
            println!(
                "PIPE_DEADLINE mode={mode} timeout_ms=200 elapsed_ms={}",
                elapsed.as_millis()
            );
            // Release only the explicitly owned finite helper, even if the
            // regression fails. It has an independent five-second ceiling.
            std::fs::write(directory.join("release"), b"release").unwrap();
            let deadline = Instant::now() + Duration::from_secs(3);
            while !directory.join("done").exists() && Instant::now() < deadline {
                std::thread::sleep(Duration::from_millis(10));
            }
            assert!(directory.join("ready").exists(), "holder never started");
            assert!(
                directory.join("done").exists(),
                "owned holder did not finish"
            );
            assert_eq!(result, Err("busy"), "{mode}");
            assert!(elapsed < Duration::from_secs(1), "{mode}: {elapsed:?}");
        }
    }

    #[cfg(windows)]
    #[test]
    fn runner_pipe_deadline_terminates_only_the_owned_hanging_parent() {
        let (child, stdout) = spawn_pipe_fixture(pipe_fixture_command("hang"));
        let start = Instant::now();
        assert_eq!(
            bounded_windows_pipe(child, stdout, Duration::from_millis(200)),
            Err("busy")
        );
        let elapsed = start.elapsed();
        println!(
            "PIPE_DEADLINE mode=hang timeout_ms=200 elapsed_ms={}",
            elapsed.as_millis()
        );
        assert!(elapsed < Duration::from_secs(1));
    }

    #[test]
    fn package_json_reads_stop_after_the_limit_probe_byte() {
        struct CountingReader {
            bytes: std::io::Cursor<Vec<u8>>,
            count: usize,
        }
        impl Read for CountingReader {
            fn read(&mut self, buffer: &mut [u8]) -> std::io::Result<usize> {
                let read = self.bytes.read(buffer)?;
                self.count += read;
                Ok(read)
            }
        }
        let mut bytes = b"{\"schemaVersion\":1}".to_vec();
        bytes.resize(MAX_MANIFEST as usize, b' ');
        assert_eq!(
            bounded_json(std::io::Cursor::new(&bytes)),
            Some(json!({"schemaVersion":1}))
        );
        bytes.resize(4 * MAX_MANIFEST as usize, b' ');
        let mut reader = CountingReader {
            bytes: std::io::Cursor::new(bytes),
            count: 0,
        };
        assert_eq!(bounded_json(&mut reader), None);
        assert_eq!(reader.count, MAX_MANIFEST as usize + 1);
        assert_eq!(bounded_json(std::io::Cursor::new(b"{invalid")), None);
    }

    #[test]
    fn package_json_growth_after_open_cannot_bypass_the_read_limit() {
        let directory = choice_fixture();
        let path = directory.join("install.json");
        std::fs::write(&path, b"{\"schemaVersion\":1}").unwrap();
        let reader = std::fs::File::open(&path).unwrap();
        let earlier_size = reader.metadata().unwrap().len();
        assert!(earlier_size <= MAX_MANIFEST);
        let padding = vec![b' '; 2 * MAX_MANIFEST as usize];
        std::fs::OpenOptions::new()
            .append(true)
            .open(&path)
            .unwrap()
            .write_all(&padding)
            .unwrap();
        // Negative control: the old size-check + unbounded-read sequence
        // consumes and accepts the grown JSON document, including its padding.
        let legacy_bytes = std::fs::read(&path).unwrap();
        assert!(legacy_bytes.len() as u64 > MAX_MANIFEST);
        assert_eq!(
            serde_json::from_slice::<Value>(&legacy_bytes).unwrap(),
            json!({"schemaVersion":1})
        );
        assert_eq!(bounded_json(reader), None);
        assert_eq!(read_bounded_json(&path), None);
    }

    #[test]
    fn installed_package_manifest_keeps_exact_limit_and_refusal_boundaries() {
        let root = package("bounded-manifest");
        let path = root.join("install.json");
        let mut bytes = std::fs::read(&path).unwrap();
        bytes.resize(MAX_MANIFEST as usize, b' ');
        std::fs::write(&path, &bytes).unwrap();
        assert!(load_install(&root).is_ok());
        bytes.push(b' ');
        std::fs::write(&path, &bytes).unwrap();
        assert_eq!(load_install(&root), Err("not_a_package"));
        assert_eq!(std::fs::read(&path).unwrap(), bytes);
    }

    fn choice_fixture() -> PathBuf {
        let directory = std::env::temp_dir().join(format!(
            "enouia-atomic-choice-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir(&directory).unwrap();
        directory
    }

    #[test]
    fn saved_choice_clear_accepts_absence_and_removes_existing_choice() {
        let directory = choice_fixture();
        let path = directory.join(SETTINGS_FILE);
        assert!(save_root_at(&path, None));
        assert!(save_root_at(&path, Some(&directory.join("old-package"))));
        assert!(save_root_at(&path, None));
        assert!(!path.exists());
        assert!(save_root_at(&path, None));
    }

    #[test]
    fn schedule_decoration_refuses_non_object_schedule_without_panicking() {
        let refused = error("contract_invalid", "activity_archive", false);
        for schedule in [
            json!("private path"),
            json!(false),
            json!(2),
            json!([]),
            Value::Null,
        ] {
            for running in [false, true] {
                let reply = json!({"schemaVersion": 1, "kind": "activity_overview", "schedule": schedule, "health": []});
                let outcome = std::panic::catch_unwind(|| {
                    add_schedule(reply, Value::Null, Value::Null, running)
                });
                assert_eq!(outcome.expect("invalid schedule must not panic"), refused);
            }
        }
        assert_eq!(
            add_schedule(
                json!({"schemaVersion": 1, "kind": "activity_overview", "health": []}),
                Value::Null,
                Value::Null,
                false
            ),
            refused
        );
    }

    #[cfg(windows)]
    #[test]
    fn saved_choice_clear_denial_child() {
        let Some(directory) = std::env::var_os("ENOUIA_CLEAR_DENIAL_ROOT") else {
            return;
        };
        let path = PathBuf::from(directory).join(SETTINGS_FILE);
        assert!(!path.exists(), "owned denial must hide existence");
        let error = std::fs::remove_file(&path).unwrap_err();
        assert_eq!(error.kind(), std::io::ErrorKind::PermissionDenied);
        // Negative control: existence returns false for this access error,
        // so the old `is_ok() || !exists()` expression reports success.
        assert!(!path.exists());
        println!("delete_permission_denied_and_legacy_false_success=true");
        assert!(!save_root_at(&path, None));
    }

    #[cfg(windows)]
    #[test]
    fn saved_choice_clear_permission_denial_is_not_success() {
        let directory = choice_fixture();
        let path = directory.join(SETTINGS_FILE);
        assert!(save_root_at(&path, Some(&directory.join("old-package"))));
        let bytes = std::fs::read(&path).unwrap();
        let script =
            Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/choice-clear-denial.ps1");
        let output = Command::new("C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
            ])
            .arg(script)
            .arg("-Directory")
            .arg(&directory)
            .arg("-ProbeExecutable")
            .arg(std::env::current_exe().unwrap())
            .env("ENOUIA_CLEAR_DENIAL_ROOT", &directory)
            .output()
            .unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), bytes);
        let stdout = String::from_utf8_lossy(&output.stdout);
        assert!(stdout.contains("delete_permission_denied_and_legacy_false_success=true"));
        assert!(stdout.contains("exact_owned_descriptors_and_bytes_restored=true"));
        assert!(
            output.status.success(),
            "{stdout}\n{}",
            String::from_utf8_lossy(&output.stderr)
        );
        assert!(save_root_at(&path, None));
    }

    #[test]
    fn saved_choice_partial_write_failure_preserves_old_bytes_and_retries() {
        let directory = choice_fixture();
        let path = directory.join(SETTINGS_FILE);
        let old = directory.join("old-package");
        assert!(save_root_at(&path, Some(&old)));
        let bytes = std::fs::read(&path).unwrap();
        let error = replace_saved_choice(&path, |file| {
            file.write_all(b"{\"installRoot\":")?;
            Err(std::io::ErrorKind::WriteZero.into())
        })
        .unwrap_err();
        assert_eq!(error.kind(), std::io::ErrorKind::WriteZero);
        assert_eq!(std::fs::read(&path).unwrap(), bytes);
        assert_eq!(read_saved_root(&path), Some(old));
        assert_eq!(std::fs::read_dir(&directory).unwrap().count(), 1);
        assert!(!save_root_at(&path, Some(Path::new("relative"))));
        assert_eq!(std::fs::read(&path).unwrap(), bytes);
        let new = directory.join("new-package");
        assert!(save_root_at(&path, Some(&new)));
        assert_eq!(read_saved_root(&path), Some(new));
        assert!(save_root_at(&path, None));
        assert_eq!(std::fs::read_dir(&directory).unwrap().count(), 0);
    }

    // Runs only as an owned subprocess of the test below. No release-mode
    // hook, page request or real settings path can enter this boundary.
    #[test]
    fn saved_choice_writer_child() {
        let Some(directory) = std::env::var_os("ENOUIA_CHOICE_TEST_ROOT") else {
            return;
        };
        let directory = PathBuf::from(directory);
        let phase = std::env::var("ENOUIA_CHOICE_TEST_PHASE").unwrap();
        let path = directory.join(SETTINGS_FILE);
        let hold = |file: &mut std::fs::File| -> std::io::Result<()> {
            if phase == "staged-complete" {
                file.write_all(
                    format!("{}\n", json!({"installRoot":directory.join("new-package")}))
                        .as_bytes(),
                )?;
            } else {
                file.write_all(b"{")?;
            }
            file.sync_all()?;
            std::fs::write(directory.join("ready"), b"ready")?;
            loop {
                std::thread::park();
            }
        };
        if phase == "legacy-partial" {
            // File::create is the same truncate-before-write step used by
            // the previous std::fs::write implementation.
            hold(&mut std::fs::File::create(path).unwrap()).unwrap();
        } else {
            replace_saved_choice(&path, hold).unwrap();
        }
    }

    #[test]
    fn saved_choice_process_death_keeps_prior_choice_and_ignores_staging() {
        for phase in ["legacy-partial", "staged-partial", "staged-complete"] {
            let directory = choice_fixture();
            let path = directory.join(SETTINGS_FILE);
            let old = directory.join("old-package");
            assert!(save_root_at(&path, Some(&old)));
            let bytes = std::fs::read(&path).unwrap();
            let mut child = Command::new(std::env::current_exe().unwrap())
                .args([
                    "--exact",
                    "activity::tests::saved_choice_writer_child",
                    "--nocapture",
                ])
                .env("ENOUIA_CHOICE_TEST_ROOT", &directory)
                .env("ENOUIA_CHOICE_TEST_PHASE", phase)
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .unwrap();
            let deadline = Instant::now() + Duration::from_secs(10);
            while !directory.join("ready").exists() && Instant::now() < deadline {
                if child.try_wait().unwrap().is_some() {
                    break;
                }
                std::thread::sleep(Duration::from_millis(20));
            }
            let ready = directory.join("ready").exists();
            let _ = child.kill();
            child.wait().unwrap();
            assert!(ready, "owned child never reached {phase}");
            if phase == "legacy-partial" {
                assert_eq!(std::fs::read(&path).unwrap(), b"{");
                assert_eq!(read_saved_root(&path), None);
            } else {
                assert_eq!(std::fs::read(&path).unwrap(), bytes);
                assert_eq!(read_saved_root(&path), Some(old));
                let staged = std::fs::read_dir(&directory)
                    .unwrap()
                    .map(|item| item.unwrap().path())
                    .find(|item| item.extension().is_some_and(|ext| ext == "tmp"))
                    .unwrap();
                let staged_bytes = std::fs::read(&staged).unwrap();
                let new = directory.join("recovered-package");
                assert!(save_root_at(&path, Some(&new)));
                assert_eq!(read_saved_root(&path), Some(new));
                assert_eq!(std::fs::read(staged).unwrap(), staged_bytes);
            }
        }
    }

    #[cfg(windows)]
    #[test]
    fn saved_choice_replacement_sharing_refusal_preserves_bytes_and_retries() {
        use std::os::windows::fs::OpenOptionsExt;
        use windows_sys::Win32::Storage::FileSystem::{FILE_SHARE_READ, FILE_SHARE_WRITE};
        let directory = choice_fixture();
        let path = directory.join(SETTINGS_FILE);
        let old = directory.join("old-package");
        let new = directory.join("new-package");
        assert!(save_root_at(&path, Some(&old)));
        let bytes = std::fs::read(&path).unwrap();
        let holder = std::fs::OpenOptions::new()
            .read(true)
            .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE)
            .open(&path)
            .unwrap();
        // Writing is shared, deletion/replacement is not. The new code must
        // refuse instead of falling back to the old truncating writer.
        assert!(!save_root_at(&path, Some(&new)));
        assert_eq!(std::fs::read(&path).unwrap(), bytes);
        assert_eq!(read_saved_root(&path), Some(old));
        assert_eq!(std::fs::read_dir(&directory).unwrap().count(), 1);
        drop(holder);
        assert!(save_root_at(&path, Some(&new)));
        assert_eq!(read_saved_root(&path), Some(new));
    }

    #[cfg(windows)]
    #[test]
    fn saved_choice_shared_reader_retains_complete_old_snapshot() {
        use std::os::windows::fs::OpenOptionsExt;
        use windows_sys::Win32::Storage::FileSystem::{
            FILE_SHARE_DELETE, FILE_SHARE_READ, FILE_SHARE_WRITE,
        };
        let directory = choice_fixture();
        let path = directory.join(SETTINGS_FILE);
        assert!(save_root_at(&path, Some(&directory.join("old-package"))));
        let bytes = std::fs::read(&path).unwrap();
        let mut reader = std::fs::OpenOptions::new()
            .read(true)
            .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE)
            .open(&path)
            .unwrap();
        let new = directory.join("new-package");
        assert!(save_root_at(&path, Some(&new)));
        let mut snapshot = Vec::new();
        reader.read_to_end(&mut snapshot).unwrap();
        assert_eq!(snapshot, bytes);
        assert_eq!(read_saved_root(&path), Some(new));
    }

    #[test]
    fn saved_choices_are_bounded_absolute_and_leave_invalid_bytes_intact() {
        let directory = std::env::temp_dir().join(format!(
            "enouia-activity-settings-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir(&directory).unwrap();
        let path = directory.join("activity-install.json");
        assert_eq!(read_saved_root(&path), None);
        for value in [
            json!({"installRoot":"package"}),
            json!({"installRoot":""}),
            json!({"installRoot":null}),
            json!({}),
        ] {
            let bytes = serde_json::to_vec(&value).unwrap();
            std::fs::write(&path, &bytes).unwrap();
            assert_eq!(read_saved_root(&path), None);
            assert_eq!(std::fs::read(&path).unwrap(), bytes);
        }
        let expected = directory.join("package");
        let bytes = serde_json::to_vec(&json!({"installRoot":expected})).unwrap();
        let mut boundary = bytes.clone();
        boundary.resize(MAX_MANIFEST as usize, b' ');
        std::fs::write(&path, &boundary).unwrap();
        assert_eq!(read_saved_root(&path), Some(expected.clone()));
        boundary.push(b' ');
        std::fs::write(&path, &boundary).unwrap();
        assert_eq!(read_saved_root(&path), None);
        assert_eq!(std::fs::read(&path).unwrap(), boundary);
        std::fs::write(&path, b"{\"installRoot\":").unwrap();
        assert_eq!(read_saved_root(&path), None);
        std::fs::write(&path, bytes).unwrap();
        assert_eq!(read_saved_root(&path), Some(expected));
        std::fs::remove_file(path).unwrap();
        std::fs::remove_dir(directory).unwrap();
    }

    #[test]
    fn acceptance_settings_are_native_and_explicit() {
        let args = |items: &[&str]| {
            items
                .iter()
                .map(|item| (*item).to_owned())
                .collect::<Vec<_>>()
        };
        assert_eq!(settings_argument(&args(&["runtime"])), Ok(None));
        assert_eq!(
            settings_argument(&args(&[
                "runtime",
                "--activity-settings",
                "C:\\synthetic\\settings.json"
            ])),
            Ok(Some(PathBuf::from("C:\\synthetic\\settings.json")))
        );
        for items in [
            vec!["--activity-settings"],
            vec!["--activity-settings", "relative.json"],
            vec![
                "--activity-settings",
                "C:\\one.json",
                "--activity-settings",
                "C:\\two.json",
            ],
        ] {
            assert_eq!(settings_argument(&args(&items)), Err(()));
        }
    }

    #[test]
    fn requests_follow_the_ipc_v1_shapes() {
        assert_eq!(
            parse_request(&json!({"operation": "activity_get_overview"})),
            Some(Request::Overview)
        );
        assert_eq!(
            parse_request(&json!({"operation": "activity_set_paused", "paused": true})),
            Some(Request::SetPaused(true))
        );
        assert!(matches!(
            parse_request(&json!({"operation": "activity_get_days", "source": "codex",
                "from": "2024-02-29", "to": "2024-03-01"})),
            Some(Request::Days { .. })
        ));
        for bad in [
            json!({"operation": "activity_get_overview", "extra": 1}),
            json!({"operation": "activity_get_days", "source": "claude_design", "from": "2026-01-01", "to": "2026-01-02"}),
            json!({"operation": "activity_get_days", "source": "github", "from": "2026-02-30", "to": "2026-03-01"}),
            json!({"operation": "activity_get_days", "source": "github", "from": "中a-01-01", "to": "2026-03-01"}),
            json!({"operation": "activity_get_days", "source": "github", "from": "2026-03-02", "to": "2026-03-01"}),
            json!({"operation": "activity_set_paused", "paused": "true"}),
            json!({"operation": "activity_get_run", "runId": "../x"}),
            json!({"operation": "activity_reset_sequence"}),
            json!("activity_get_overview"),
        ] {
            assert_eq!(parse_request(&bad), None, "{bad}");
        }
    }

    #[test]
    fn days_filter_one_preview_without_inventing_dates() {
        let preview = json!({"schemaVersion": 1, "kind": "activity_public_preview", "sha256": "0",
            "data": {"version": 1, "sources": {"github": null, "codex": {"days": [
                {"date": "2026-09-23", "value": 0}, {"date": "2026-09-24", "value": 5}]}, "claude": null}}});
        let days = days(&preview, "codex", "2026-09-24", "2026-12-31");
        assert_eq!(days["days"], json!([{"date": "2026-09-24", "value": 5}]));
        assert_eq!(
            super::days(&preview, "github", "2026-01-01", "2026-12-31")["days"],
            json!([])
        );
        let failure = error("busy", "activity_archive", true);
        assert_eq!(
            super::days(&failure, "codex", "2026-01-01", "2026-12-31"),
            failure
        );
    }

    #[test]
    fn days_refuses_missing_or_malformed_history_before_filtering() {
        let base = json!({"schemaVersion":1,"kind":"activity_public_preview","data":{"version":1,"sources":{"github":null,"codex":{"days":[]},"claude":null}}});
        let mut cases = Vec::new();
        let mut wrong_version = base.clone();
        wrong_version["schemaVersion"] = json!(2);
        cases.push(wrong_version);
        let mut wrong_data_version = base.clone();
        wrong_data_version["data"]["version"] = json!(2);
        cases.push(wrong_data_version);
        let mut missing_sources = base.clone();
        missing_sources["data"] = json!({"version":1});
        cases.push(missing_sources);
        let mut missing = base.clone();
        missing["data"]["sources"]
            .as_object_mut()
            .unwrap()
            .remove("codex");
        cases.push(missing);
        for snapshot in [
            json!(false),
            json!({}),
            json!({"days":null}),
            json!({"days":"private-synthetic-path"}),
        ] {
            let mut preview = base.clone();
            preview["data"]["sources"]["codex"] = snapshot;
            cases.push(preview);
        }
        for entries in [
            json!([{"date":null,"value":1}]),
            json!([{"date":"2026-02-30","value":1}]),
            json!([{"date":"2026-01-01","value":-1}]),
            json!([{"date":"2026-01-01","value":1.5}]),
            json!([{"date":"2026-01-01","value":9007199254740992_u64}]),
            json!([{"date":"2026-01-01","value":1,"privatePath":"private-synthetic-path"}]),
            json!([{"date":"2026-01-01","value":1},{"date":"2026-01-01","value":2}]),
            json!([{"date":"2026-01-02","value":1},{"date":"2026-01-01","value":2}]),
            json!([{"date":"2026-01-01","value":9007199254740991_u64},{"date":"2026-01-02","value":1}]),
        ] {
            let mut preview = base.clone();
            preview["data"]["sources"]["codex"]["days"] = entries;
            cases.push(preview);
        }
        for preview in cases {
            // Bad entries are deliberately outside this range. Filtering
            // must not erase their invalidity and fabricate a valid empty list.
            assert_eq!(
                days(&preview, "codex", "2026-10-01", "2026-10-31"),
                error("contract_invalid", "activity_archive", false)
            );
        }
    }

    #[test]
    fn days_preserves_explicit_empty_and_exact_inclusive_values() {
        let mut preview = json!({"schemaVersion":1,"kind":"activity_public_preview","data":{"version":1,"sources":{"codex":null}}});
        let range = ("2026-10-01", "2026-10-31");
        assert_eq!(days(&preview, "codex", range.0, range.1)["days"], json!([]));
        preview["data"]["sources"]["codex"] = json!({"days":[]});
        assert_eq!(days(&preview, "codex", range.0, range.1)["days"], json!([]));
        let entries = json!([{"date":"2026-09-30","value":4},{"date":"2026-10-01","value":0},{"date":"2026-10-31","value":2.0},{"date":"2026-11-01","value":8}]);
        preview["data"]["sources"]["codex"]["days"] = entries.clone();
        assert_eq!(
            days(&preview, "codex", range.0, range.1)["days"],
            json!([entries[1], entries[2]])
        );
        let maximum = json!([{"date":"2026-10-01","value":9007199254740991_u64}]);
        preview["data"]["sources"]["codex"]["days"] = maximum.clone();
        assert_eq!(days(&preview, "codex", range.0, range.1)["days"], maximum);
        preview["schemaVersion"] = json!(1.0);
        preview["data"]["version"] = json!(1.0);
        assert_eq!(days(&preview, "codex", range.0, range.1)["days"], maximum);
    }

    #[test]
    fn only_the_package_marker_makes_a_task_ours() {
        let marker = "Enouia.Activity.Package.v1:0f8fad5b-d9cb-469f-a165-70867728950e";
        let xml = format!(
            "<Task><RegistrationInfo><Source>{marker}</Source></RegistrationInfo>\
             <Triggers><TimeTrigger><Enabled>true</Enabled></TimeTrigger></Triggers>\
             <Settings><Enabled>false</Enabled></Settings></Task>"
        );
        assert_eq!(
            task_state(&xml, marker),
            json!({"registered": true, "enabled": false})
        );
        let enabled = xml.replace(
            "<Settings><Enabled>false</Enabled></Settings>",
            "<Settings/>",
        );
        assert_eq!(task_state(&enabled, marker)["enabled"], true);
        assert_eq!(
            task_state(
                &xml.replace(marker, "Enouia.Activity.Package.v1:other"),
                marker
            )["registered"],
            false
        );
        let utf16: Vec<u8> = [0xFF, 0xFE]
            .into_iter()
            .chain(
                "<Source>x</Source>"
                    .encode_utf16()
                    .flat_map(u16::to_le_bytes),
            )
            .collect();
        assert_eq!(decode(&utf16), "<Source>x</Source>");
    }

    #[test]
    fn runner_exits_map_to_stages_and_structured_errors() {
        assert_eq!(finished(Ok((0, json!({})))).0, "completed");
        assert_eq!(finished(Ok((2, json!({})))).0, "completed");
        let busy = finished(Ok((3, json!({"state": "busy"}))));
        assert_eq!((busy.0, busy.1["code"].clone()), ("blocked", json!("busy")));
        assert_eq!(
            finished(Ok((4, json!({})))).1["code"],
            "delivery_unverified"
        );
        let invalid = finished(Ok((6, json!({"errorCode": "clock_regression"}))));
        assert_eq!(
            (invalid.0, invalid.1["code"].clone()),
            ("failed", json!("clock_regression"))
        );
        assert_eq!(
            finished(Ok((6, json!({"errorCode": "/raw/path"})))).1["code"],
            "storage_failed"
        );
        assert_eq!(finished(Err("unconfigured")).1["code"], "unconfigured");
    }

    fn package(name: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "enouia-activity-pkg-{name}-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir(&root).unwrap();
        std::fs::write(root.join("enouia-activity.exe"), b"synthetic runner").unwrap();
        std::fs::write(root.join("activity-config.json"), b"{}").unwrap();
        let hash = file_sha256(&root.join("enouia-activity.exe"))
            .unwrap()
            .to_ascii_uppercase();
        let manifest = json!({"schemaVersion": 1,
            "marker": "Enouia.Activity.Package.v1:0f8fad5b-d9cb-469f-a165-70867728950e",
            "taskName": "Enouia-Activity-Sandbox", "mode": "sandbox",
            "binary": root.join("enouia-activity.exe"), "config": root.join("activity-config.json"),
            "binaryHash": hash});
        std::fs::write(root.join("install.json"), manifest.to_string()).unwrap();
        root
    }

    #[test]
    fn packages_are_checked_against_their_manifest_and_binary_hash() {
        let root = package("valid");
        let install = load_install(&root).unwrap();
        assert_eq!(install.mode, "sandbox");
        assert_eq!(
            setup_status(Some(&install))["folder"],
            root.file_name().unwrap().to_string_lossy().as_ref()
        );
        // A replaced binary is refused, at selection and before every start.
        std::fs::write(root.join("enouia-activity.exe"), b"different runner").unwrap();
        assert_eq!(load_install(&root), Err("binary_changed"));
        assert_eq!(
            invoke(&install, &["overview"], READ_TIMEOUT),
            Err("unconfigured")
        );
        let mut manifest: Value =
            serde_json::from_slice(&std::fs::read(root.join("install.json")).unwrap()).unwrap();
        manifest["binary"] = json!("C:\\Windows\\System32\\cmd.exe");
        std::fs::write(root.join("install.json"), manifest.to_string()).unwrap();
        assert_eq!(load_install(&root), Err("not_a_package"));
        assert_eq!(load_install(&root.join("missing")), Err("not_found"));
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn status_verifies_the_exact_persisted_choice_without_exporting_paths() {
        let root = std::env::temp_dir().join(format!(
            "enouia-choice-status-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir(&root).unwrap();
        let package = root.join("package");
        let other = root.join("other");
        std::fs::create_dir(&package).unwrap();
        std::fs::create_dir(&other).unwrap();
        let install = Install {
            root: std::fs::canonicalize(&package).unwrap(),
            binary: package.join("synthetic.exe"),
            config: package.join("synthetic.json"),
            binary_sha256: String::new(),
            task_name: "Enouia-Activity-Synthetic".to_owned(),
            marker: String::new(),
            mode: "sandbox".to_owned(),
        };
        for saved in [None, Some(other.clone()), Some(root.join("absent"))] {
            assert_eq!(
                setup_status_with_saved(Some(&install), saved, Some(true))["saved"],
                false
            );
        }
        for saved in [&package, &package.join(".")] {
            let status = setup_status_with_saved(Some(&install), Some(saved.clone()), Some(false));
            assert_eq!(status["saved"], true);
            assert_eq!(status["folder"], "package");
            assert_eq!(status.as_object().unwrap().len(), 5);
            assert!(!status.to_string().contains("enouia-choice-status-"));
        }
        assert_eq!(
            setup_status_with_saved(None, Some(package.clone()), None),
            json!({"configured": false})
        );
        // Only the newly created empty owned directories are removed.
        std::fs::remove_dir(other).unwrap();
        std::fs::remove_dir(package).unwrap();
        std::fs::remove_dir(root).unwrap();
    }

    #[test]
    fn disconnected_status_retains_only_an_explicit_clear_outcome() {
        assert_eq!(
            setup_status_with_saved(None, None, None),
            json!({"configured": false})
        );
        for saved in [false, true] {
            assert_eq!(
                setup_status_with_saved(None, None, Some(saved)),
                json!({"configured": false, "saved": saved})
            );
        }
        assert!(
            ActivityHost::default()
                .last_clear_saved
                .lock()
                .unwrap()
                .is_none()
        );
    }

    #[test]
    fn a_registered_task_adds_scheduler_health_and_running_mode() {
        let overview = json!({"kind": "activity_overview", "generatedAt": "2026-10-07T00:00:00.000Z",
            "schedule": {"mode": "idle", "nextTriggerAt": null}, "health": []});
        let result = add_schedule(
            overview,
            json!({"registered": true, "enabled": false}),
            Value::Null,
            true,
        );
        assert_eq!(result["schedule"]["mode"], "running");
        assert_eq!(result["health"][0]["id"], "activity_scheduler");
        assert_eq!(result["health"][0]["state"], "degraded");
    }

    #[test]
    fn next_trigger_accepts_only_real_canonical_utc_dates() {
        assert!(valid_next_trigger(&json!("2028-02-29T01:02:03.000Z")));
        for value in [
            Value::Null,
            json!(42),
            json!("2026-02-29T01:02:03.000Z"),
            json!("2026-10-08T24:02:03.000Z"),
            json!("2026-10-08T01:60:03.000Z"),
            json!("2026-10-08T01:02:60.000Z"),
            json!("2026-10-08T01:02:03+08:00"),
            json!("1600-10-08T01:02:03.000Z"),
            json!("中202-10-08T01:02:03.000Z"),
        ] {
            assert!(!valid_next_trigger(&value), "{value}");
        }
        let next = json!("2026-10-09T01:02:03.000Z");
        let result = add_schedule(
            json!({"kind":"activity_overview","schedule":{},"health":[]}),
            json!({"registered":true,"enabled":true}),
            next.clone(),
            false,
        );
        assert_eq!(result["schedule"]["nextTriggerAt"], next);
    }
}
