#![cfg(windows)]
//! A sync whose CURRENT replacement is refused by a transient reader must not
//! leave the store blocked for every later invocation.

use enouia_activity::{SourceAttempt, SourceId};
use enouia_activity_contract::{ActivityData, normalize_batch, public_data_bytes};
use enouia_activity_delivery::public_fetch::{FetchError, FetchedResponse, PublicFetcher};
use enouia_activity_runner::collectors::{Cancelled, Collector};
use enouia_activity_runner::config::Config;
use enouia_activity_runner::run::{Command, Ports, run_locked};
use enouia_activity_store::WindowsActivityLock;
use enouia_activity_store::legacy_import::{ImportOptions, import_legacy_trio};
use enouia_activity_store::pause::set_paused_locked;
use enouia_activity_store::reader::read_current;
use enouia_common::{
    Cancellation, ErrorCode, FakeClock, LockProvider, ProcessOutput, ProcessRequest, ProcessRunner,
    StructuredError,
};
use serde_json::{Value, json};
use std::cell::{Cell, RefCell};
use std::fs::{self, File, OpenOptions};
use std::os::windows::fs::OpenOptionsExt;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const ORACLE: &str = include_str!("../../../tests/fixtures/activity/moriium-oracle-input.json");
const FILE_SHARE_READ: u32 = 0x0000_0001;

fn clock() -> FakeClock {
    FakeClock::new(1_790_410_200_000)
}

struct Fixture {
    base: PathBuf,
    root: PathBuf,
    archive: ActivityData,
}
impl Fixture {
    fn new() -> Self {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let base = std::env::temp_dir().join(format!(
            "enouia-runner-late-switch-{}-{nonce}",
            std::process::id()
        ));
        let root = base.join("runtime");
        let source = base.join("legacy");
        fs::create_dir_all(&root).unwrap();
        fs::create_dir(&source).unwrap();
        let batch =
            normalize_batch(&serde_json::from_str::<Value>(ORACLE).unwrap(), &clock()).unwrap();
        fs::write(
            source.join("activity.json"),
            public_data_bytes(&batch.data).unwrap(),
        )
        .unwrap();
        fs::write(source.join("sequence.json"), b"{\"sequence\":42}\n").unwrap();
        let guard = WindowsActivityLock
            .try_acquire(&root.join("sync.lock"))
            .unwrap();
        import_legacy_trio(
            &guard,
            &source,
            "g-import",
            &ImportOptions {
                reconciled_high_water: 42,
                verified_unused_identity: false,
            },
            &clock(),
        )
        .unwrap();
        set_paused_locked(&guard, &clock(), "g-ready", false).unwrap();
        Self {
            base,
            root,
            archive: batch.data,
        }
    }

    fn config(&self) -> Config {
        serde_json::from_value(json!({"version":1,"mode":"sandbox","dataRoot":self.root,"deliveryEnabled":false,
            "delivery":{"sshExecutable":self.base.join("fake-ssh.exe"),"curlExecutable":self.base.join("fake-curl.exe"),
                "restrictedAlias":"sandbox","publicOrigin":"http://127.0.0.1:9","observationSeconds":0,"retrySeconds":3600}})).unwrap()
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        assert!(self.base.starts_with(std::env::temp_dir()));
        assert!(
            self.base
                .file_name()
                .unwrap()
                .to_string_lossy()
                .starts_with("enouia-runner-late-switch-")
        );
        fs::remove_dir_all(&self.base).unwrap();
    }
}

/// Collects unchanged snapshots. On request it opens CURRENT without delete
/// sharing during collection, so the following commit's replace is refused.
struct HoldingCollector<'a> {
    fixture: &'a Fixture,
    hold: Cell<bool>,
    held: RefCell<Option<File>>,
    calls: Cell<usize>,
}
impl Collector for HoldingCollector<'_> {
    fn collect(&self, at: &str, _: &dyn Cancellation) -> Result<[SourceAttempt; 3], Cancelled> {
        self.calls.set(self.calls.get() + 1);
        if self.hold.get() {
            *self.held.borrow_mut() = Some(
                OpenOptions::new()
                    .read(true)
                    .share_mode(FILE_SHARE_READ)
                    .open(self.fixture.root.join("CURRENT"))
                    .unwrap(),
            );
        }
        let success = |source, original: &Option<enouia_activity_contract::Snapshot>| {
            let mut snapshot = original.clone().unwrap();
            snapshot.updated_at = at.to_owned();
            SourceAttempt::Success {
                source,
                attempted_at: at.to_owned(),
                snapshot,
            }
        };
        let sources = &self.fixture.archive.sources;
        Ok([
            success(SourceId::Github, &sources.github),
            success(SourceId::Codex, &sources.codex),
            success(SourceId::Claude, &sources.claude),
        ])
    }
}

struct NoProcess;
impl ProcessRunner for NoProcess {
    fn run(
        &self,
        _: &ProcessRequest,
        _: &dyn Cancellation,
    ) -> Result<ProcessOutput, StructuredError> {
        panic!("delivery is disabled");
    }
}

struct NoFetch;
impl PublicFetcher for NoFetch {
    fn fetch(
        &self,
        _: &str,
        _: usize,
        _: Duration,
        _: &dyn Cancellation,
    ) -> Result<FetchedResponse, FetchError> {
        panic!("delivery is disabled");
    }
}

struct Never;
impl Cancellation for Never {
    fn is_cancelled(&self) -> bool {
        false
    }
}

fn generation_names(root: &Path) -> Vec<String> {
    let mut names: Vec<String> = fs::read_dir(root.join("generations"))
        .unwrap()
        .map(|entry| entry.unwrap().file_name().into_string().unwrap())
        .collect();
    names.sort();
    names
}

#[test]
fn refused_pointer_replacement_fails_one_sync_and_the_next_sync_commits() {
    let fixture = Fixture::new();
    let guard = WindowsActivityLock
        .try_acquire(&fixture.root.join("sync.lock"))
        .unwrap();
    let collector = HoldingCollector {
        fixture: &fixture,
        hold: Cell::new(true),
        held: RefCell::new(None),
        calls: Cell::new(0),
    };
    let ports = Ports {
        clock: &clock(),
        collector: &collector,
        process: &NoProcess,
        fetcher: &NoFetch,
        cancellation: &Never,
    };
    let before = read_current(&fixture.root, &clock()).unwrap();
    let failed = run_locked(&guard, &fixture.config(), Command::Sync, &ports);
    assert_eq!(failed.state, "storage_failed");
    assert_eq!(failed.error_code, Some(ErrorCode::StorageFailed));
    assert_eq!(failed.sequence, None);
    collector.hold.set(false);
    drop(collector.held.borrow_mut().take());
    let unchanged = read_current(&fixture.root, &clock()).unwrap();
    assert_eq!(unchanged.id, before.id);
    assert_eq!(unchanged.validated.highest_reserved, 42);
    assert!(unchanged.image.pending.is_none());

    let next = run_locked(&guard, &fixture.config(), Command::Sync, &ports);
    assert_eq!(next.state, "delivery_disabled");
    assert_eq!(next.sequence, Some(43));
    assert_eq!(collector.calls.get(), 2);
    let selected = read_current(&fixture.root, &clock()).unwrap();
    assert_eq!(selected.validated.highest_reserved, 43);
    assert_eq!(
        selected
            .validated
            .pending
            .as_ref()
            .map(|batch| batch.sequence),
        Some(43)
    );
    // The refused directory is retained under its staging name, not deleted.
    let staged: Vec<String> = generation_names(&fixture.root)
        .into_iter()
        .filter(|name| name.starts_with(".staging-g-run-"))
        .collect();
    assert_eq!(staged.len(), 1);
}
