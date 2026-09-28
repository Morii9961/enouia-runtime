#![cfg(windows)]

use enouia_activity_contract::{normalize_batch, public_data_bytes, sha256_hex};
use enouia_activity_delivery::ssh::{
    SshConfig, TransportCompletedUnverified, TransportError, send_pending_locked,
};
use enouia_activity_store::WindowsActivityLock;
use enouia_activity_store::generation::GenerationImage;
use enouia_activity_store::pause::set_paused_locked;
use enouia_common::{
    Cancellation, ComponentId, ErrorCode, FakeClock, LockProvider, ProcessOutput, ProcessRequest,
    ProcessRunner, StructuredError,
};
use serde_json::{Value, json};
use std::cell::Cell;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const ORACLE: &str = include_str!("../../../tests/fixtures/activity/moriium-oracle-input.json");

fn clock() -> FakeClock {
    FakeClock::new(1_790_409_601_000)
}

fn root() -> PathBuf {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let root = std::env::temp_dir().join(format!("enouia-ssh-test-{}-{nonce}", std::process::id()));
    fs::create_dir(&root).unwrap();
    root
}

fn clean(root: &Path) {
    assert!(root.starts_with(std::env::temp_dir()));
    assert!(
        root.file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with("enouia-ssh-test-")
    );
    fs::remove_dir_all(root).unwrap();
}

fn seed(root: &Path, with_pending: bool) -> Option<Vec<u8>> {
    let mut raw: Value = serde_json::from_str(ORACLE).unwrap();
    raw["sequence"] = json!(1);
    let batch = normalize_batch(&raw, &clock()).unwrap();
    let mut pending = serde_json::to_vec(&batch).unwrap();
    pending.push(b'\n');
    let image = GenerationImage {
        activity: public_data_bytes(&batch.data).unwrap(),
        sequence: b"{\"sequence\":1}\n".to_vec(),
        pending: with_pending.then_some(pending),
        delivery: b"{}\n".to_vec(),
    };
    let path = root.join("generations/g-1-seed");
    fs::create_dir_all(&path).unwrap();
    fs::write(path.join("activity.json"), &image.activity).unwrap();
    fs::write(path.join("sequence.json"), &image.sequence).unwrap();
    if let Some(bytes) = &image.pending {
        fs::write(path.join("pending.json"), bytes).unwrap();
    }
    fs::write(path.join("delivery.json"), &image.delivery).unwrap();
    fs::write(
        path.join("manifest.json"),
        image.manifest_bytes("g-1-seed", &clock()).unwrap(),
    )
    .unwrap();
    fs::write(root.join("CURRENT"), b"g-1-seed\n").unwrap();
    image.pending
}

struct Cancelled(bool);

impl Cancellation for Cancelled {
    fn is_cancelled(&self) -> bool {
        self.0
    }
}

struct FakeRunner {
    expected_pending: Vec<u8>,
    result: Result<ProcessOutput, StructuredError>,
    calls: Cell<usize>,
}

impl FakeRunner {
    fn exit(expected_pending: Vec<u8>, exit_code: i32, stdout: &[u8]) -> Self {
        Self {
            expected_pending,
            result: Ok(ProcessOutput {
                exit_code: Some(exit_code),
                stdout: stdout.to_vec(),
                stderr: Vec::new(),
            }),
            calls: Cell::new(0),
        }
    }
}

impl ProcessRunner for FakeRunner {
    fn run(
        &self,
        request: &ProcessRequest,
        _: &dyn Cancellation,
    ) -> Result<ProcessOutput, StructuredError> {
        self.calls.set(self.calls.get() + 1);
        assert_eq!(request.executable, Path::new("C:/tools/ssh.exe"));
        assert_eq!(
            request
                .arguments
                .iter()
                .map(|arg| arg.to_string_lossy().into_owned())
                .collect::<Vec<_>>(),
            [
                "-T",
                "-o",
                "BatchMode=yes",
                "-o",
                "StrictHostKeyChecking=yes",
                "-o",
                "ConnectTimeout=15",
                "activity_receiver"
            ]
        );
        assert!(request.environment.is_empty());
        assert_eq!(
            request.stdin.as_deref(),
            Some(self.expected_pending.as_slice())
        );
        assert_eq!(request.timeout, Duration::from_secs(60));
        assert_eq!(request.max_output_bytes, 64 * 1024);
        match &self.result {
            Ok(output) => Ok(ProcessOutput {
                exit_code: output.exit_code,
                stdout: output.stdout.clone(),
                stderr: output.stderr.clone(),
            }),
            Err(error) => Err(error.clone()),
        }
    }
}

fn config() -> SshConfig<'static> {
    SshConfig {
        executable: Path::new("C:/tools/ssh.exe"),
        restricted_alias: "activity_receiver",
    }
}

#[test]
fn exit_zero_is_only_unverified_transport_and_keeps_exact_pending() {
    let root = root();
    let pending = seed(&root, true).unwrap();
    let guard = WindowsActivityLock
        .try_acquire(&root.join("sync.lock"))
        .unwrap();
    let runner = FakeRunner::exit(pending.clone(), 0, b"accepted\n");
    assert_eq!(
        send_pending_locked(&guard, &clock(), &config(), &runner, &Cancelled(false)).unwrap(),
        TransportCompletedUnverified {
            sequence: 1,
            exact_pending_sha256: sha256_hex(&pending),
        }
    );
    assert_eq!(runner.calls.get(), 1);
    let ignored = FakeRunner::exit(pending.clone(), 0, b"old sequence ignored\n");
    assert_eq!(
        send_pending_locked(&guard, &clock(), &config(), &ignored, &Cancelled(false)).unwrap(),
        TransportCompletedUnverified {
            sequence: 1,
            exact_pending_sha256: sha256_hex(&pending),
        }
    );
    assert_eq!(
        fs::read(root.join("generations/g-1-seed/pending.json")).unwrap(),
        pending
    );
    assert_eq!(fs::read(root.join("CURRENT")).unwrap(), b"g-1-seed\n");
    drop(guard);
    clean(&root);
}

#[test]
fn pause_prevents_ssh_transport_before_process_launch() {
    let root = root();
    let pending = seed(&root, true).unwrap();
    let guard = WindowsActivityLock
        .try_acquire(&root.join("sync.lock"))
        .unwrap();
    set_paused_locked(&guard, &clock(), "g-1-paused", true).unwrap();
    let runner = FakeRunner::exit(pending.clone(), 0, b"accepted\n");
    assert_eq!(
        send_pending_locked(&guard, &clock(), &config(), &runner, &Cancelled(false)),
        Err(TransportError::Paused)
    );
    assert_eq!(runner.calls.get(), 0);
    assert_eq!(
        fs::read(root.join("generations/g-1-paused/pending.json")).unwrap(),
        pending
    );
    drop(guard);
    clean(&root);
}

#[test]
fn invalid_alias_cancellation_and_absent_pending_never_spawn() {
    let pending_root = root();
    let pending = seed(&pending_root, true).unwrap();
    let guard = WindowsActivityLock
        .try_acquire(&pending_root.join("sync.lock"))
        .unwrap();
    let runner = FakeRunner::exit(pending, 0, b"");
    for alias in ["-bad", "bad host", "bad;command", "é", &"a".repeat(81)] {
        let config = SshConfig {
            executable: Path::new("C:/tools/ssh.exe"),
            restricted_alias: alias,
        };
        assert_eq!(
            send_pending_locked(&guard, &clock(), &config, &runner, &Cancelled(false)).unwrap_err(),
            TransportError::InvalidConfig
        );
    }
    assert_eq!(
        send_pending_locked(&guard, &clock(), &config(), &runner, &Cancelled(true)).unwrap_err(),
        TransportError::Cancelled
    );
    assert_eq!(runner.calls.get(), 0);
    drop(guard);
    clean(&pending_root);

    let empty_root = root();
    seed(&empty_root, false);
    let guard = WindowsActivityLock
        .try_acquire(&empty_root.join("sync.lock"))
        .unwrap();
    assert_eq!(
        send_pending_locked(&guard, &clock(), &config(), &runner, &Cancelled(false)).unwrap_err(),
        TransportError::NoPending
    );
    assert_eq!(runner.calls.get(), 0);
    drop(guard);
    clean(&empty_root);
}

#[test]
fn failed_process_or_nonzero_exit_never_becomes_a_receipt() {
    let root = root();
    let pending = seed(&root, true).unwrap();
    let guard = WindowsActivityLock
        .try_acquire(&root.join("sync.lock"))
        .unwrap();
    let runner = FakeRunner::exit(pending.clone(), 255, b"no route");
    assert_eq!(
        send_pending_locked(&guard, &clock(), &config(), &runner, &Cancelled(false)).unwrap_err(),
        TransportError::NonZeroExit(Some(255))
    );
    let runner = FakeRunner {
        expected_pending: pending.clone(),
        result: Err(StructuredError {
            code: ErrorCode::DeliveryUnverified,
            component: ComponentId::ActivityDelivery,
            retryable: true,
        }),
        calls: Cell::new(0),
    };
    assert_eq!(
        send_pending_locked(&guard, &clock(), &config(), &runner, &Cancelled(false)).unwrap_err(),
        TransportError::Process(ErrorCode::DeliveryUnverified)
    );
    let oversized = FakeRunner::exit(pending.clone(), 0, &vec![b'x'; 64 * 1024 + 1]);
    assert_eq!(
        send_pending_locked(&guard, &clock(), &config(), &oversized, &Cancelled(false))
            .unwrap_err(),
        TransportError::OutputTooLarge
    );
    assert_eq!(
        fs::read(root.join("generations/g-1-seed/pending.json")).unwrap(),
        pending
    );
    drop(guard);
    clean(&root);
}
