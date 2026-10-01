//! Development-only gh/Codex/SSH stand-ins. Refuses roots without the test marker.
use serde_json::{Value, json};
use std::fs;
use std::io::{BufRead, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{SystemTime, UNIX_EPOCH};

fn env_path(name: &str) -> Result<PathBuf, ()> {
    let path = PathBuf::from(std::env::var_os(name).ok_or(())?);
    if !path.is_absolute() {
        return Err(());
    }
    fs::canonicalize(path).map_err(|_| ())
}
fn within(root: &Path, name: &str) -> Result<PathBuf, ()> {
    let path = env_path(name)?;
    if !path.starts_with(root) {
        return Err(());
    }
    Ok(path)
}
fn root() -> Result<PathBuf, ()> {
    let root = env_path("ENOU_TEST_ROOT")?;
    if !root
        .file_name()
        .is_some_and(|name| name.to_string_lossy().starts_with("enouia-handback-"))
        || fs::read(root.join("ACTIVITY_SANDBOX_FIXTURE")).map_err(|_| ())?
            != b"enouia-activity-isolated-handback-v1"
    {
        return Err(());
    }
    Ok(root)
}
fn write_json(value: &Value) -> Result<(), ()> {
    let mut stdout = std::io::stdout().lock();
    serde_json::to_writer(&mut stdout, value).map_err(|_| ())?;
    stdout.write_all(b"\n").map_err(|_| ())?;
    stdout.flush().map_err(|_| ())
}
fn json_file(path: &Path) -> Result<Value, ()> {
    serde_json::from_slice(&fs::read(path).map_err(|_| ())?).map_err(|_| ())
}
fn node_command(node: &Path) -> Command {
    let mut command = Command::new(node);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }
    command.stdout(Stdio::null()).stderr(Stdio::null());
    command
}
fn node_script(path: &Path) -> PathBuf {
    // Node's main-module resolver rejects Rust's canonical \\?\ drive prefix.
    // The target has already passed canonical containment checks above.
    #[cfg(windows)]
    if let Some(value) = path.to_str().and_then(|value| value.strip_prefix(r"\\?\"))
        && value.as_bytes().get(1) == Some(&b':')
    {
        return PathBuf::from(value);
    }
    path.to_path_buf()
}
fn linger(root: &Path, role: &str) -> Result<u8, ()> {
    let child_path = within(root, "ENOU_TEST_DESCENDANT")?;
    let mut child = node_command(&child_path)
        .arg("--fixture-descendant")
        .stdin(Stdio::null())
        .spawn()
        .map_err(|_| ())?;
    let ready = root.join(format!("traces/owned-{}", child.id()));
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(2);
    while !ready.is_file() {
        if std::time::Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            return Err(());
        }
        std::thread::sleep(std::time::Duration::from_millis(5));
    }
    fs::write(
        root.join(format!("traces/owned-{}", std::process::id())),
        b"owned fixture",
    )
    .map_err(|_| ())?;
    let marker = json!({"parentPid":std::process::id(),"childPid":child.id()});
    fs::write(
        root.join(format!("traces/linger-{role}.json")),
        serde_json::to_vec(&marker).map_err(|_| ())?,
    )
    .map_err(|_| ())?;
    std::thread::sleep(std::time::Duration::from_secs(8));
    let _ = child.wait();
    Ok(0)
}
#[cfg(windows)]
fn watch(root: &Path, args: &[String]) -> Result<u8, ()> {
    use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle};
    use windows_sys::Win32::Foundation::{WAIT_OBJECT_0, WAIT_TIMEOUT};
    use windows_sys::Win32::System::Threading::{
        OpenProcess, PROCESS_SYNCHRONIZE, WaitForSingleObject,
    };
    if args.len() != 3 {
        return Err(());
    }
    let mut handles = Vec::new();
    for arg in args {
        let pid = arg.parse::<u32>().map_err(|_| ())?;
        if !root.join(format!("traces/owned-{pid}")).is_file() {
            return Err(());
        }
        // SAFETY: these PIDs are marked fixture processes; only synchronization access is requested.
        let raw = unsafe { OpenProcess(PROCESS_SYNCHRONIZE, 0, pid) };
        if raw.is_null() {
            return Err(());
        }
        // SAFETY: OpenProcess transferred this one handle, which OwnedHandle closes once.
        let handle = unsafe { OwnedHandle::from_raw_handle(raw) };
        if unsafe { WaitForSingleObject(handle.as_raw_handle(), 0) } != WAIT_TIMEOUT {
            return Err(());
        }
        handles.push(handle);
    }
    write_json(&json!({"state":"watching_owned_processes","count":handles.len()}))?;
    for handle in &handles {
        // SAFETY: handles remain open; waiting never terminates or mutates a process.
        if unsafe { WaitForSingleObject(handle.as_raw_handle(), 1500) } != WAIT_OBJECT_0 {
            return Err(());
        }
    }
    write_json(&json!({"state":"all_owned_processes_terminated","count":handles.len()}))?;
    Ok(0)
}
fn invoke() -> Result<u8, ()> {
    let root = root()?;
    let role = std::env::current_exe()
        .map_err(|_| ())?
        .file_stem()
        .ok_or(())?
        .to_string_lossy()
        .to_lowercase();
    let args = std::env::args().skip(1).collect::<Vec<_>>();
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| ())?
        .as_nanos();
    let trace = root.join("traces");
    if !trace.is_dir() {
        return Err(());
    }
    fs::write(
        trace.join(format!("{role}-{}-{nonce}", std::process::id())),
        b"fixture invocation",
    )
    .map_err(|_| ())?;
    match role.as_str() {
        #[cfg(windows)]
        "watch" => watch(&root, &args),
        "descendant" if args == ["--fixture-descendant"] => {
            fs::write(
                root.join(format!("traces/owned-{}", std::process::id())),
                b"owned fixture",
            )
            .map_err(|_| ())?;
            std::thread::sleep(std::time::Duration::from_secs(8));
            Ok(0)
        }
        "gh" if args.first().map(String::as_str) == Some("api")
            && args.get(1).map(String::as_str) == Some("graphql") =>
        {
            if std::env::var("ENOU_TEST_LINGER").ok().as_deref() == Some("gh") {
                return linger(&root, "gh");
            }
            write_json(&json_file(&root.join("fixtures/github.json"))?)?;
            Ok(0)
        }
        "codex" if args == ["app-server"] => {
            if std::env::var("ENOU_TEST_LINGER").ok().as_deref() == Some("codex") {
                return linger(&root, "codex");
            }
            for line in std::io::stdin().lock().lines().take(8) {
                let message: Value =
                    serde_json::from_str(&line.map_err(|_| ())?).map_err(|_| ())?;
                match message["method"].as_str() {
                    Some("initialize") => write_json(
                        &json!({"id":message["id"],"result":{"serverInfo":{"name":"fixture","version":"1"}}}),
                    )?,
                    Some("initialized") => {}
                    Some("account/usage/read") => {
                        write_json(
                            &json!({"id":message["id"],"result":json_file(&root.join("fixtures/codex.json"))?}),
                        )?;
                        return Ok(0);
                    }
                    _ => return Err(()),
                }
            }
            Err(())
        }
        "ssh"
            if args
                == [
                    "-T",
                    "-o",
                    "BatchMode=yes",
                    "-o",
                    "StrictHostKeyChecking=yes",
                    "-o",
                    "ConnectTimeout=15",
                    "sandbox-handback",
                ] =>
        {
            let mut bytes = Vec::new();
            std::io::stdin()
                .take(4 * 1024 * 1024 + 1)
                .read_to_end(&mut bytes)
                .map_err(|_| ())?;
            if bytes.len() > 4 * 1024 * 1024 {
                return Err(());
            }
            let batch: Value = serde_json::from_slice(&bytes).map_err(|_| ())?;
            let sequence = batch["sequence"].as_u64().ok_or(())?;
            let captures = within(&root, "ENOU_TEST_CAPTURES")?;
            fs::write(
                captures.join(format!("s{sequence}-{}-{nonce}.json", std::process::id())),
                &bytes,
            )
            .map_err(|_| ())?;
            if std::env::var("ENOU_TEST_LINGER").ok().as_deref() == Some("ssh") {
                return linger(&root, "ssh");
            }
            let mode = std::env::var("ENOU_TEST_TRANSPORT").map_err(|_| ())?;
            if mode == "before_receipt" {
                return Ok(255);
            }
            if mode != "none" && mode != "after_receipt" {
                return Err(());
            }
            let node = env_path("ENOU_TEST_NODE")?;
            let receiver = within(&root, "ENOU_TEST_RECEIVER")?;
            let publisher = within(&root, "ENOU_TEST_PUBLISHER")?;
            let inbox = within(&root, "MORIIUM_STATUS_INBOX")?;
            let publisher_root = within(&root, "MORIIUM_STATUS_ROOT")?;
            let mut child = node_command(&node)
                .arg(node_script(&receiver))
                .current_dir(&root)
                .env("MORIIUM_STATUS_INBOX", inbox)
                .stdin(Stdio::piped())
                .spawn()
                .map_err(|_| ())?;
            child
                .stdin
                .take()
                .ok_or(())?
                .write_all(&bytes)
                .map_err(|_| ())?;
            let receiver_status = child.wait().map_err(|_| ())?;
            fs::write(
                trace.join(format!(
                    "receiver-code-{}",
                    receiver_status.code().unwrap_or(-1)
                )),
                b"stage",
            )
            .map_err(|_| ())?;
            if !receiver_status.success() {
                return Err(());
            }
            let publisher_status = node_command(&node)
                .arg(node_script(&publisher))
                .current_dir(&root)
                .env("MORIIUM_STATUS_ROOT", publisher_root)
                .status()
                .map_err(|_| ())?;
            fs::write(
                trace.join(format!(
                    "publisher-code-{}",
                    publisher_status.code().unwrap_or(-1)
                )),
                b"stage",
            )
            .map_err(|_| ())?;
            if !publisher_status.success() {
                return Err(());
            }
            Ok(if mode == "after_receipt" { 255 } else { 0 })
        }
        _ => Err(()),
    }
}
fn main() -> std::process::ExitCode {
    std::process::ExitCode::from(invoke().unwrap_or(5))
}
