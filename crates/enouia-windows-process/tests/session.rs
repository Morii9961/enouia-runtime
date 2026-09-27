#![cfg(windows)]

use enouia_activity::{SourceAttempt, SourceId, codex};
use enouia_common::{Cancellation, ErrorCode, JsonLineSession};
use enouia_windows_process::WindowsJsonLineSession;
use std::ffi::OsString;
use std::path::PathBuf;
use std::time::{Duration, Instant};
use windows_sys::Win32::Foundation::{CloseHandle, WAIT_OBJECT_0};
use windows_sys::Win32::System::Threading::{
    OpenProcess, PROCESS_SYNCHRONIZE, WaitForSingleObject,
};

struct NeverCancelled;

impl Cancellation for NeverCancelled {
    fn is_cancelled(&self) -> bool {
        false
    }
}

fn powershell() -> PathBuf {
    PathBuf::from(std::env::var_os("SystemRoot").unwrap())
        .join("System32/WindowsPowerShell/v1.0/powershell.exe")
}

fn arguments(mode: &str) -> Vec<OsString> {
    vec![
        "-NoLogo".into(),
        "-NoProfile".into(),
        "-NonInteractive".into(),
        "-File".into(),
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures/fake-app-server.ps1")
            .into_os_string(),
        mode.into(),
    ]
}

#[test]
fn real_pipes_complete_a_synthetic_three_message_exchange() {
    let mut session = WindowsJsonLineSession::spawn(
        &powershell(),
        &arguments("echo"),
        Duration::from_secs(10),
        1024 * 1024,
    )
    .unwrap();
    session
        .write_line(b"{\"method\":\"initialize\",\"id\":1}\n", &NeverCancelled)
        .unwrap();
    let first = session
        .read_line(Duration::from_secs(5), 1024, &NeverCancelled)
        .unwrap();
    assert!(first.starts_with(b"{\"id\":1,"));
    session
        .write_line(b"{\"method\":\"initialized\"}\n", &NeverCancelled)
        .unwrap();
    session
        .write_line(
            b"{\"method\":\"account/usage/read\",\"id\":2}\n",
            &NeverCancelled,
        )
        .unwrap();
    let second = session
        .read_line(Duration::from_secs(5), 1024, &NeverCancelled)
        .unwrap();
    assert!(second.starts_with(b"{\"id\":2,"));
}

#[test]
fn real_pipes_drive_codex_collection_to_a_normalized_attempt() {
    let mut session = WindowsJsonLineSession::spawn(
        &powershell(),
        &arguments("echo"),
        Duration::from_secs(10),
        1024 * 1024,
    )
    .unwrap();
    let attempt = codex::collect(&mut session, "2026-09-26T08:00:00.000Z", &NeverCancelled)
        .expect("synthetic collection is not cancelled");
    match attempt {
        SourceAttempt::Success {
            source,
            attempted_at,
            snapshot,
        } => {
            assert_eq!(source, SourceId::Codex);
            assert_eq!(attempted_at, "2026-09-26T08:00:00.000Z");
            assert_eq!(snapshot.timezone, "Codex");
            assert_eq!(snapshot.metric, "tokens");
            assert_eq!(snapshot.days.len(), 1);
            assert_eq!(snapshot.days[0].date, "2026-09-26");
            assert_eq!(snapshot.days[0].value, 0);
        }
        SourceAttempt::Failed { error_code, .. } => {
            panic!("synthetic collection failed: {error_code:?}")
        }
    }
}

#[test]
fn timeout_and_stderr_overflow_fail_without_returning_private_text() {
    let mut silent = WindowsJsonLineSession::spawn(
        &powershell(),
        &arguments("silent"),
        Duration::from_secs(5),
        1024,
    )
    .unwrap();
    let started = Instant::now();
    let timeout = silent.read_line(Duration::from_millis(150), 1024, &NeverCancelled);
    assert_eq!(timeout.unwrap_err().code, ErrorCode::SourceInvalid);
    assert!(started.elapsed() < Duration::from_secs(2));
    drop(silent);

    let mut flood = WindowsJsonLineSession::spawn(
        &powershell(),
        &arguments("flood"),
        Duration::from_secs(5),
        1024,
    )
    .unwrap();
    let result = flood.read_line(Duration::from_secs(3), 1024, &NeverCancelled);
    assert_eq!(result.unwrap_err().code, ErrorCode::SourceInvalid);
}

#[test]
fn relative_executable_is_rejected_before_spawn() {
    assert_eq!(
        WindowsJsonLineSession::spawn(
            std::path::Path::new("powershell.exe"),
            &[],
            Duration::from_secs(1),
            1024
        )
        .err()
        .unwrap()
        .code,
        ErrorCode::Unconfigured
    );
}

#[test]
fn writes_to_a_nonreading_process_obey_the_session_deadline() {
    let mut session = WindowsJsonLineSession::spawn(
        &powershell(),
        &arguments("silent"),
        Duration::from_secs(2),
        1024,
    )
    .unwrap();
    let mut line = vec![b'x'; 4095];
    line.push(b'\n');
    let started = Instant::now();
    let mut writes = 0;
    loop {
        match session.write_line(&line, &NeverCancelled) {
            Ok(()) => writes += 1,
            Err(error) => {
                assert_eq!(error.code, ErrorCode::SourceInvalid);
                break;
            }
        }
    }
    assert!(writes > 0);
    assert!(started.elapsed() < Duration::from_secs(4));
}

#[test]
fn dropping_the_session_terminates_its_owned_process() {
    let mut session = WindowsJsonLineSession::spawn(
        &powershell(),
        &arguments("linger"),
        Duration::from_secs(10),
        1024,
    )
    .unwrap();
    let pid = String::from_utf8(
        session
            .read_line(Duration::from_secs(5), 64, &NeverCancelled)
            .unwrap(),
    )
    .unwrap()
    .parse::<u32>()
    .unwrap();
    // SAFETY: the PID came from the live child and the returned handle is closed below.
    let handle = unsafe { OpenProcess(PROCESS_SYNCHRONIZE, 0, pid) };
    assert!(!handle.is_null());
    drop(session);
    // SAFETY: the process handle remains valid across session drop.
    let result = unsafe { WaitForSingleObject(handle, 2000) };
    unsafe { CloseHandle(handle) };
    assert_eq!(result, WAIT_OBJECT_0);
}
