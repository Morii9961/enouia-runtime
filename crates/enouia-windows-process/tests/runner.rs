#![cfg(windows)]

use enouia_common::{Cancellation, ComponentId, ErrorCode, ProcessRequest, ProcessRunner};
use enouia_windows_process::WindowsProcessRunner;
use std::ffi::OsString;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::{Duration, Instant};

struct Flag(AtomicBool);

impl Cancellation for Flag {
    fn is_cancelled(&self) -> bool {
        self.0.load(Ordering::Relaxed)
    }
}

fn request(mode: &str) -> ProcessRequest {
    ProcessRequest {
        executable: PathBuf::from(std::env::var_os("SystemRoot").unwrap())
            .join("System32/WindowsPowerShell/v1.0/powershell.exe"),
        arguments: vec![
            OsString::from("-NoLogo"),
            OsString::from("-NoProfile"),
            OsString::from("-NonInteractive"),
            OsString::from("-File"),
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("tests/fixtures/fake-app-server.ps1")
                .into_os_string(),
            OsString::from(mode),
        ],
        environment: Vec::new(),
        stdin: None,
        timeout: Duration::from_secs(5),
        max_output_bytes: 1024,
    }
}

fn runner() -> WindowsProcessRunner {
    WindowsProcessRunner::new(ComponentId::ActivityCollectorGithub)
}

fn active() -> Flag {
    Flag(AtomicBool::new(false))
}

#[test]
fn captures_both_streams_and_passes_stdin_and_process_local_environment() {
    let mut request = request("runner-stdio");
    request.stdin = Some(b"hello".to_vec());
    request
        .environment
        .push(("ENOU_TEST_MARKER".into(), "fixture".into()));
    let output = runner().run(&request, &active()).unwrap();
    assert_eq!(output.exit_code, Some(0));
    assert_eq!(output.stdout, b"answer:hello:fixture\r\n");
    assert_eq!(output.stderr, b"private stderr\r\n");
}

#[test]
fn preserves_nonzero_exit_and_private_stderr_for_the_caller_only() {
    let output = runner().run(&request("runner-exit"), &active()).unwrap();
    assert_eq!(output.exit_code, Some(7));
    assert!(output.stdout.is_empty());
    assert_eq!(output.stderr, b"private failure\r\n");
}

#[test]
fn timeout_cancellation_and_combined_output_limit_end_the_run() {
    let mut slow = request("runner-slow");
    slow.timeout = Duration::from_millis(350);
    let started = Instant::now();
    let error = runner().run(&slow, &active()).unwrap_err();
    assert_eq!(error.code, ErrorCode::SourceInvalid);
    assert_eq!(error.component, ComponentId::ActivityCollectorGithub);
    assert!(started.elapsed() < Duration::from_secs(2));

    let cancelled = Arc::new(Flag(AtomicBool::new(false)));
    let signal = Arc::clone(&cancelled);
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(350));
        signal.0.store(true, Ordering::Relaxed);
    });
    let started = Instant::now();
    assert_eq!(
        runner()
            .run(&request("runner-slow"), cancelled.as_ref())
            .unwrap_err()
            .code,
        ErrorCode::SourceInvalid
    );
    assert!(started.elapsed() < Duration::from_secs(2));

    let started = Instant::now();
    assert_eq!(
        runner()
            .run(&request("runner-flood"), &active())
            .unwrap_err()
            .code,
        ErrorCode::SourceInvalid
    );
    assert!(started.elapsed() < Duration::from_secs(3));
}

#[test]
fn invalid_execution_bounds_are_rejected_before_spawn() {
    let mut bad = request("runner-exit");
    bad.executable = PathBuf::from("powershell.exe");
    assert_eq!(
        runner().run(&bad, &active()).unwrap_err().code,
        ErrorCode::Unconfigured
    );
    bad = request("runner-exit");
    bad.max_output_bytes = 0;
    assert_eq!(
        runner().run(&bad, &active()).unwrap_err().code,
        ErrorCode::Unconfigured
    );
}
