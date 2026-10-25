use enouia_common::ProcessRequest;
use std::os::windows::ffi::OsStrExt;
use std::process::Stdio;
use windows_sys::Win32::Foundation::WAIT_OBJECT_0;
use windows_sys::Win32::System::Threading::WaitForSingleObject;
fn command(r: &ProcessRequest) -> Command {
    let mut command = Command::new(&r.executable);
    command
        .args(&r.arguments)
        .envs(r.environment.iter().map(|(k, v)| (k, v)))
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    command
}
use super::*;
use enouia_common::{Cancellation, ProcessRunner};
use std::ffi::OsString;
use std::io::{BufRead, BufReader, Read};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering as AtomicOrdering};
use std::thread;
use std::time::{Duration, Instant};
use windows_sys::Win32::System::JobObjects::IsProcessInJob;

#[test]
#[ignore = "private synthetic child entry, invoked only by the parent tests"]
fn child_process_probe() {
    if let Some(path) = std::env::var_os("ENOU_ATOMIC_MARKER_PATH") {
        std::fs::write(path, b"started").unwrap();
    }
    let args: Vec<Vec<u16>> = std::env::args_os()
        .map(|arg| arg.encode_wide().collect())
        .collect();
    println!("ENCODED={args:?}");
    println!(
        "MARKER={}",
        std::env::var("ENOU_ATOMIC_CHILD_TEST").unwrap()
    );
    assert!(std::env::var_os("SystemRoot").is_some());
    if std::env::var_os("ENOU_ATOMIC_TREE").is_some() {
        let descendant = std::process::Command::new(std::env::current_exe().unwrap())
            .args([
                "--exact",
                "job::tests::child_process_probe",
                "--ignored",
                "--nocapture",
            ])
            .env_remove("ENOU_ATOMIC_TREE")
            .env_remove("ENOU_ATOMIC_MARKER_PATH")
            .env("ENOU_ATOMIC_LINGER", "1")
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .unwrap();
        println!("DESCENDANT={}", descendant.id());
        // The private Job, not a PID-based cleanup, owns this descendant.
        drop(descendant);
    }
    if std::env::var_os("ENOU_ATOMIC_LINGER").is_some() {
        thread::sleep(Duration::from_secs(30));
    }
}
fn request() -> ProcessRequest {
    ProcessRequest {
        executable: std::env::current_exe().unwrap(),
        arguments: [
            "--exact",
            "job::tests::child_process_probe",
            "--ignored",
            "--nocapture",
        ]
        .map(OsString::from)
        .to_vec(),
        environment: vec![
            ("ENOU_ATOMIC_CHILD_TEST".into(), "original".into()),
            ("enou_atomic_child_test".into(), "synthetic-雪".into()),
        ],
        stdin: None,
        timeout: Duration::from_secs(5),
        max_output_bytes: 16384,
    }
}
#[test]
fn native_spawn_attaches_exact_job_and_preserves_executable_arguments_and_environment() {
    let mut request = request();
    request.arguments.extend(
        [
            "",
            "space value",
            "back\\slash\\",
            "q\"uote",
            "&<>|%^",
            "雪🌸",
            "line\nbreak",
        ]
        .map(OsString::from),
    );
    let job = KillOnCloseJob::create(ComponentId::ActivityCollectorGithub).unwrap();
    let mut command = command(&request);
    command.current_dir(request.executable.parent().unwrap());
    let mut child = job
        .spawn(&mut command, ComponentId::ActivityCollectorGithub)
        .unwrap();
    let mut attached = 0;
    // SAFETY: these are this test's exact live process and job handles.
    assert_ne!(
        unsafe { IsProcessInJob(child.as_raw_handle(), job.0, &mut attached) },
        0
    );
    assert_ne!(attached, 0);
    let mut output = String::new();
    child
        .stdout
        .take()
        .unwrap()
        .read_to_string(&mut output)
        .unwrap();
    let expected: Vec<Vec<u16>> = std::iter::once(request.executable.as_os_str())
        .chain(request.arguments.iter().map(|a| a.as_os_str()))
        .map(|s| s.encode_wide().collect())
        .collect();
    assert!(
        output.contains(&format!("ENCODED={expected:?}")),
        "{output}"
    );
    assert!(output.contains("MARKER=synthetic-雪"), "{output}");
    let deadline = Instant::now() + Duration::from_secs(2);
    while child.try_wait().unwrap().is_none() {
        assert!(Instant::now() < deadline);
        thread::sleep(Duration::from_millis(10));
    }
    assert_eq!(
        child.try_wait().unwrap().and_then(|status| status.code()),
        Some(0)
    );
}
#[test]
fn closing_the_private_job_ends_the_child_and_its_immediate_descendant() {
    use windows_sys::Win32::System::Threading::{
        OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_SYNCHRONIZE,
    };
    let component = ComponentId::ActivityCollectorGithub;
    let job = KillOnCloseJob::create(component).unwrap();
    let mut r = request();
    r.environment.extend([
        ("ENOU_ATOMIC_TREE".into(), "1".into()),
        ("ENOU_ATOMIC_LINGER".into(), "1".into()),
    ]);
    let mut child = job.spawn(&mut command(&r), component).unwrap();
    let mut lines = BufReader::new(child.stdout.take().unwrap());
    let descendant_id = loop {
        let mut line = String::new();
        assert_ne!(lines.read_line(&mut line).unwrap(), 0);
        if let Some(id) = line.trim().strip_prefix("DESCENDANT=") {
            break id.parse::<u32>().unwrap();
        }
    };
    // SAFETY: this PID was just reported by our still-running child. We
    // obtain a query/wait handle only; it is never a termination target.
    let raw = unsafe {
        OpenProcess(
            PROCESS_SYNCHRONIZE | PROCESS_QUERY_LIMITED_INFORMATION,
            0,
            descendant_id,
        )
    };
    assert!(!raw.is_null());
    let descendant = unsafe { OwnedHandle::from_raw_handle(raw) };
    let mut attached = 0;
    assert_ne!(
        unsafe { IsProcessInJob(descendant.as_raw_handle(), job.0, &mut attached) },
        0
    );
    assert_ne!(attached, 0);
    drop(job);
    assert_eq!(
        unsafe { WaitForSingleObject(child.as_raw_handle(), 2000) },
        WAIT_OBJECT_0
    );
    assert_eq!(
        unsafe { WaitForSingleObject(descendant.as_raw_handle(), 2000) },
        WAIT_OBJECT_0
    );
}
#[test]
fn cancelling_a_runner_preserves_an_unrelated_owned_sentinel() {
    struct Flag(AtomicBool);
    impl Cancellation for Flag {
        fn is_cancelled(&self) -> bool {
            self.0.load(AtomicOrdering::Relaxed)
        }
    }
    let component = ComponentId::ActivityCollectorGithub;
    let mut r = request();
    r.environment
        .push(("ENOU_ATOMIC_LINGER".into(), "1".into()));
    let sentinel_job = KillOnCloseJob::create(component).unwrap();
    let mut sentinel = sentinel_job.spawn(&mut command(&r), component).unwrap();
    let cancel = Arc::new(Flag(AtomicBool::new(false)));
    let signal = Arc::clone(&cancel);
    let marker = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../target/atomic-child-job/cancelled-child-marker");
    std::fs::create_dir_all(marker.parent().unwrap()).unwrap();
    assert!(!marker.exists());
    r.environment.push((
        "ENOU_ATOMIC_MARKER_PATH".into(),
        marker.clone().into_os_string(),
    ));
    let started_marker = marker.clone();
    let cancellation = thread::spawn(move || {
        let deadline = Instant::now() + Duration::from_secs(2);
        while !started_marker.exists() {
            assert!(Instant::now() < deadline);
            thread::sleep(Duration::from_millis(5));
        }
        signal.0.store(true, AtomicOrdering::Relaxed);
    });
    assert!(
        crate::WindowsProcessRunner::new(component)
            .run(&r, cancel.as_ref())
            .is_err()
    );
    cancellation.join().unwrap();
    assert_eq!(std::fs::read(&marker).unwrap(), b"started");
    std::fs::remove_file(&marker).unwrap();
    assert_eq!(sentinel.try_wait().unwrap(), None);
    drop(sentinel_job);
    let deadline = Instant::now() + Duration::from_secs(2);
    while sentinel.try_wait().unwrap().is_none() {
        assert!(Instant::now() < deadline);
        thread::sleep(Duration::from_millis(10));
    }
}

fn owned_marker(name: &str) -> std::path::PathBuf {
    let path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../target/atomic-child-job")
        .join(name);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    assert!(!path.exists());
    path
}

#[test]
fn child_cannot_execute_before_job_assignment_and_explicit_resume() {
    struct Cleanup(Child);
    impl Drop for Cleanup {
        fn drop(&mut self) {
            let _ = self.0.kill();
            let _ = self.0.wait();
        }
    }
    let marker = owned_marker("suspended-before-assignment-marker");
    let mut r = request();
    r.environment.push((
        "ENOU_ATOMIC_MARKER_PATH".into(),
        marker.clone().into_os_string(),
    ));
    let mut command = command(&r);
    command.creation_flags(CREATE_NO_WINDOW | CREATE_SUSPENDED);
    let mut child = Cleanup(command.spawn().unwrap());
    thread::sleep(Duration::from_millis(50));
    assert!(!marker.exists());
    let job = KillOnCloseJob::create(ComponentId::ActivityCollectorGithub).unwrap();
    job.assign(&child.0, ComponentId::ActivityCollectorGithub)
        .unwrap();
    assert!(!marker.exists());
    resume_owned_primary(&child.0, ComponentId::ActivityCollectorGithub).unwrap();
    let mut output = String::new();
    child
        .0
        .stdout
        .take()
        .unwrap()
        .read_to_string(&mut output)
        .unwrap();
    assert!(child.0.wait().unwrap().success());
    assert_eq!(std::fs::read(&marker).unwrap(), b"started");
    std::fs::remove_file(&marker).unwrap();
}

#[test]
fn refused_job_never_resumes_an_unowned_child() {
    let marker = owned_marker("refused-suspended-child-marker");
    let mut r = request();
    r.environment.push((
        "ENOU_ATOMIC_MARKER_PATH".into(),
        marker.clone().into_os_string(),
    ));
    let invalid = KillOnCloseJob(std::ptr::null_mut());
    assert!(
        invalid
            .spawn(&mut command(&r), ComponentId::ActivityCollectorGithub)
            .is_err()
    );
    assert!(!marker.exists());
    let valid = KillOnCloseJob::create(ComponentId::ActivityCollectorGithub).unwrap();
    let output = valid
        .spawn(&mut command(&r), ComponentId::ActivityCollectorGithub)
        .unwrap()
        .wait_with_output()
        .unwrap();
    assert!(output.status.success());
    assert_eq!(std::fs::read(&marker).unwrap(), b"started");
    std::fs::remove_file(&marker).unwrap();
}

#[test]
fn suspended_job_start_preserves_existing_command_batch_launcher_behavior() {
    let path = owned_marker("owned batch launcher.cmd");
    std::fs::write(
        &path,
        b"@echo off\r\necho synthetic-batch-launcher\r\nexit /b 0\r\n",
    )
    .unwrap();
    let job = KillOnCloseJob::create(ComponentId::ActivityCollectorGithub).unwrap();
    let mut command = Command::new(&path);
    command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let output = job
        .spawn(&mut command, ComponentId::ActivityCollectorGithub)
        .unwrap()
        .wait_with_output()
        .unwrap();
    assert!(output.status.success());
    assert_eq!(output.stdout, b"synthetic-batch-launcher\r\n");
    std::fs::remove_file(&path).unwrap();
}
