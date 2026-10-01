#![cfg(windows)]

use enouia_activity::{SourceAttempt, SourceId};
use enouia_activity_contract::{
    ActivityData, format_activity_timestamp, normalize_batch, public_data_bytes, sha256_hex,
};
use enouia_activity_delivery::public_fetch::{FetchError, FetchedResponse, PublicFetcher};
use enouia_activity_runner::collectors::{Cancelled, Collector};
use enouia_activity_runner::config::Config;
use enouia_activity_runner::run::{Command, Ports, run_locked};
use enouia_activity_store::WindowsActivityLock;
use enouia_activity_store::legacy_import::{ImportOptions, import_legacy_trio};
use enouia_activity_store::pause::set_paused_locked;
use enouia_activity_store::reader::read_current;
use enouia_activity_store::retry::record_retry_failure_locked;
use enouia_common::{
    Cancellation, Clock, ErrorCode, FakeClock, LockProvider, ProcessOutput, ProcessRequest,
    ProcessRunner, StructuredError,
};
use serde_json::{Value, json};
use std::cell::{Cell, RefCell};
use std::fs;
use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const ORACLE: &str = include_str!("../../../tests/fixtures/activity/moriium-oracle-input.json");
const ORIGIN: &str = "http://127.0.0.1:9";

fn clock() -> FakeClock {
    FakeClock::new(1_790_410_200_000)
}

struct Fixture {
    base: PathBuf,
    root: PathBuf,
    archive: ActivityData,
    pending: Vec<u8>,
}
impl Fixture {
    fn new(pending: bool) -> Self {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let base =
            std::env::temp_dir().join(format!("enouia-runner-{}-{nonce}", std::process::id()));
        let root = base.join("runtime");
        let source = base.join("legacy");
        fs::create_dir_all(&root).unwrap();
        fs::create_dir(&source).unwrap();
        let batch =
            normalize_batch(&serde_json::from_str::<Value>(ORACLE).unwrap(), &clock()).unwrap();
        let mut bytes = serde_json::to_vec_pretty(&batch).unwrap();
        bytes.extend_from_slice(b"\r\n");
        fs::write(
            source.join("activity.json"),
            public_data_bytes(&batch.data).unwrap(),
        )
        .unwrap();
        fs::write(source.join("sequence.json"), b"{\"sequence\":42}\n").unwrap();
        if pending {
            fs::write(source.join("pending.json"), &bytes).unwrap();
        }
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
            pending: bytes,
        }
    }

    fn config(&self, enabled: bool) -> Config {
        serde_json::from_value(json!({"version":1,"mode":"sandbox","dataRoot":self.root,"deliveryEnabled":enabled,
            "delivery":{"sshExecutable":self.base.join("fake-ssh.exe"),"curlExecutable":self.base.join("fake-curl.exe"),
                "restrictedAlias":"sandbox","publicOrigin":ORIGIN,"observationSeconds":0,"retrySeconds":3600}})).unwrap()
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
                .starts_with("enouia-runner-")
        );
        fs::remove_dir_all(&self.base).unwrap();
    }
}

struct CancelFlag(Cell<bool>);
impl Cancellation for CancelFlag {
    fn is_cancelled(&self) -> bool {
        self.0.get()
    }
}

struct FakeCollector<'a> {
    fixture: &'a Fixture,
    calls: Cell<usize>,
    failed_codex: bool,
    cancel_after: Option<&'a CancelFlag>,
    clock_after: Option<&'a FakeClock>,
}
impl<'a> FakeCollector<'a> {
    fn new(fixture: &'a Fixture) -> Self {
        Self {
            fixture,
            calls: Cell::new(0),
            failed_codex: false,
            cancel_after: None,
            clock_after: None,
        }
    }
}
impl Collector for FakeCollector<'_> {
    fn collect(&self, at: &str, _: &dyn Cancellation) -> Result<[SourceAttempt; 3], Cancelled> {
        self.calls.set(self.calls.get() + 1);
        if let Some(cancel) = self.cancel_after {
            cancel.0.set(true);
        }
        if let Some(clock) = self.clock_after {
            clock.set(clock.now_unix_ms() - 1000);
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
        Ok([
            success(SourceId::Github, &self.fixture.archive.sources.github),
            if self.failed_codex {
                SourceAttempt::Failed {
                    source: SourceId::Codex,
                    attempted_at: at.to_owned(),
                    error_code: ErrorCode::UnsupportedMethod,
                }
            } else {
                success(SourceId::Codex, &self.fixture.archive.sources.codex)
            },
            success(SourceId::Claude, &self.fixture.archive.sources.claude),
        ])
    }
}

struct Transport<'a> {
    root: &'a PathBuf,
    published: &'a Cell<bool>,
    calls: RefCell<Vec<Vec<u8>>>,
    accept: bool,
    exit: i32,
}
impl ProcessRunner for Transport<'_> {
    fn run(
        &self,
        request: &ProcessRequest,
        _: &dyn Cancellation,
    ) -> Result<ProcessOutput, StructuredError> {
        let current = read_current(self.root, &clock()).unwrap();
        let bytes = request.stdin.as_ref().unwrap();
        assert_eq!(
            current.image.pending.as_ref().unwrap(),
            bytes,
            "send must follow durable commit"
        );
        assert_eq!(request.arguments.last().unwrap(), "sandbox");
        assert_eq!(request.timeout, Duration::from_secs(60));
        self.calls.borrow_mut().push(bytes.clone());
        if self.accept {
            self.published.set(true);
        }
        Ok(ProcessOutput {
            exit_code: Some(self.exit),
            stdout: b"PRIVATE_PROCESS_SENTINEL".to_vec(),
            stderr: b"PRIVATE_SECRET_SENTINEL".to_vec(),
        })
    }
}

struct Fetcher<'a> {
    root: &'a PathBuf,
    published: &'a Cell<bool>,
    calls: Cell<usize>,
    mismatch: bool,
}
impl PublicFetcher for Fetcher<'_> {
    fn fetch(
        &self,
        url: &str,
        _: usize,
        _: Duration,
        _: &dyn Cancellation,
    ) -> Result<FetchedResponse, FetchError> {
        self.calls.set(self.calls.get() + 1);
        if !self.published.get() {
            return Err(FetchError::Unavailable);
        }
        let current = read_current(self.root, &clock()).unwrap();
        let batch = current.validated.pending.unwrap();
        let data = public_data_bytes(&batch.data).unwrap();
        let hash = sha256_hex(&data);
        let now = format_activity_timestamp(clock().now_unix_ms()).unwrap();
        let body = if url.ends_with("/current.json") {
            let mut manifest = json!({"version":1,"generatedAt":now,"validUntil":format_activity_timestamp(clock().now_unix_ms()+600000),
                "activity":{"hash":hash,"url":format!("/status-data/activity/{hash}.json"),"publishedAt":now,"receivedAt":now,"sources":batch.sources}});
            if self.mismatch {
                manifest["activity"]["sources"]["github"]["attemptedAt"] =
                    json!("2026-09-26T08:09:00.000Z");
            }
            serde_json::to_vec(&manifest).unwrap()
        } else {
            data
        };
        Ok(FetchedResponse {
            status: 200,
            final_url: url.to_owned(),
            redirected: false,
            body,
        })
    }
}

#[test]
fn collects_commits_sends_once_and_clears_only_after_matching_publication() {
    let fixture = Fixture::new(false);
    let guard = WindowsActivityLock
        .try_acquire(&fixture.root.join("sync.lock"))
        .unwrap();
    let collector = FakeCollector::new(&fixture);
    let published = Cell::new(false);
    let transport = Transport {
        root: &fixture.root,
        published: &published,
        calls: RefCell::new(vec![]),
        accept: true,
        exit: 0,
    };
    let fetcher = Fetcher {
        root: &fixture.root,
        published: &published,
        calls: Cell::new(0),
        mismatch: false,
    };
    let result = run_locked(
        &guard,
        &fixture.config(true),
        Command::Sync,
        &Ports {
            clock: &clock(),
            collector: &collector,
            process: &transport,
            fetcher: &fetcher,
            cancellation: &CancelFlag(Cell::new(false)),
        },
    );
    assert_eq!(result.exit_code, 0);
    assert_eq!(result.sequence, Some(43));
    assert!(
        result.publication_observed && result.transport_completed && result.collection_attempted
    );
    assert_eq!(collector.calls.get(), 1);
    assert_eq!(transport.calls.borrow().len(), 1);
    let current = read_current(guard.root(), &clock()).unwrap();
    assert!(current.image.pending.is_none());
    assert_eq!(current.validated.highest_reserved, 43);
    assert!(
        serde_json::from_slice::<Value>(&current.image.delivery).unwrap()["publicationObserved"]
            .is_object()
    );
    assert!(!serde_json::to_string(&result).unwrap().contains("PRIVATE"));
}

#[test]
fn failed_source_retains_old_snapshot_and_reports_degraded_published_cycle() {
    let fixture = Fixture::new(false);
    let guard = WindowsActivityLock
        .try_acquire(&fixture.root.join("sync.lock"))
        .unwrap();
    let mut collector = FakeCollector::new(&fixture);
    collector.failed_codex = true;
    let published = Cell::new(false);
    let transport = Transport {
        root: &fixture.root,
        published: &published,
        calls: RefCell::new(vec![]),
        accept: true,
        exit: 0,
    };
    let fetcher = Fetcher {
        root: &fixture.root,
        published: &published,
        calls: Cell::new(0),
        mismatch: false,
    };
    let result = run_locked(
        &guard,
        &fixture.config(true),
        Command::Sync,
        &Ports {
            clock: &clock(),
            collector: &collector,
            process: &transport,
            fetcher: &fetcher,
            cancellation: &CancelFlag(Cell::new(false)),
        },
    );
    assert_eq!(result.exit_code, 2);
    assert_eq!(result.source_failures, 1);
    assert_eq!(
        read_current(guard.root(), &clock())
            .unwrap()
            .validated
            .archive
            .sources
            .codex,
        fixture.archive.sources.codex
    );
}

#[test]
fn exit_zero_without_publication_keeps_exact_pending_and_persists_retry_wait() {
    let fixture = Fixture::new(false);
    let guard = WindowsActivityLock
        .try_acquire(&fixture.root.join("sync.lock"))
        .unwrap();
    let collector = FakeCollector::new(&fixture);
    let published = Cell::new(false);
    let transport = Transport {
        root: &fixture.root,
        published: &published,
        calls: RefCell::new(vec![]),
        accept: false,
        exit: 0,
    };
    let fetcher = Fetcher {
        root: &fixture.root,
        published: &published,
        calls: Cell::new(0),
        mismatch: false,
    };
    let ports = Ports {
        clock: &clock(),
        collector: &collector,
        process: &transport,
        fetcher: &fetcher,
        cancellation: &CancelFlag(Cell::new(false)),
    };
    let result = run_locked(&guard, &fixture.config(true), Command::Sync, &ports);
    assert_eq!(result.exit_code, 4);
    assert!(result.transport_completed);
    assert!(!result.publication_observed);
    let current = read_current(guard.root(), &clock()).unwrap();
    assert_eq!(
        current.image.pending.as_ref().unwrap(),
        &transport.calls.borrow()[0]
    );
    let delivery: Value = serde_json::from_slice(&current.image.delivery).unwrap();
    assert_eq!(delivery["retry"]["failureCount"], 1);
    assert_eq!(
        delivery["retry"]["lastTransportAtMs"],
        clock().now_unix_ms()
    );
    let result = run_locked(&guard, &fixture.config(true), Command::Sync, &ports);
    assert_eq!(result.state, "not_due");
    assert_eq!(result.exit_code, 3);
    assert_eq!(collector.calls.get(), 1);
    assert_eq!(transport.calls.borrow().len(), 1);
}

#[test]
fn lost_acknowledgment_resolves_during_wait_without_collection_or_send() {
    let fixture = Fixture::new(true);
    let guard = WindowsActivityLock
        .try_acquire(&fixture.root.join("sync.lock"))
        .unwrap();
    record_retry_failure_locked(
        &guard,
        &clock(),
        "g-wait",
        ErrorCode::DeliveryUnverified,
        clock().now_unix_ms() + 3600000,
        true,
    )
    .unwrap();
    let collector = FakeCollector::new(&fixture);
    let published = Cell::new(true);
    let transport = Transport {
        root: &fixture.root,
        published: &published,
        calls: RefCell::new(vec![]),
        accept: false,
        exit: 0,
    };
    let fetcher = Fetcher {
        root: &fixture.root,
        published: &published,
        calls: Cell::new(0),
        mismatch: false,
    };
    let result = run_locked(
        &guard,
        &fixture.config(true),
        Command::Sync,
        &Ports {
            clock: &clock(),
            collector: &collector,
            process: &transport,
            fetcher: &fetcher,
            cancellation: &CancelFlag(Cell::new(false)),
        },
    );
    assert_eq!(result.exit_code, 2);
    assert!(result.publication_observed);
    assert!(!result.transport_attempted);
    assert_eq!(collector.calls.get(), 0);
    assert!(transport.calls.borrow().is_empty());
    assert!(
        read_current(guard.root(), &clock())
            .unwrap()
            .image
            .pending
            .is_none()
    );
}

#[test]
fn manual_retry_bypasses_wait_and_disconnect_after_acceptance_can_be_observed() {
    let fixture = Fixture::new(true);
    let guard = WindowsActivityLock
        .try_acquire(&fixture.root.join("sync.lock"))
        .unwrap();
    record_retry_failure_locked(
        &guard,
        &clock(),
        "g-wait",
        ErrorCode::DeliveryUnverified,
        clock().now_unix_ms() + 3600000,
        true,
    )
    .unwrap();
    let collector = FakeCollector::new(&fixture);
    let published = Cell::new(false);
    let transport = Transport {
        root: &fixture.root,
        published: &published,
        calls: RefCell::new(vec![]),
        accept: true,
        exit: 255,
    };
    let fetcher = Fetcher {
        root: &fixture.root,
        published: &published,
        calls: Cell::new(0),
        mismatch: false,
    };
    let result = run_locked(
        &guard,
        &fixture.config(true),
        Command::RetryPending,
        &Ports {
            clock: &clock(),
            collector: &collector,
            process: &transport,
            fetcher: &fetcher,
            cancellation: &CancelFlag(Cell::new(false)),
        },
    );
    assert!(result.publication_observed && result.transport_attempted);
    assert!(!result.transport_completed);
    assert_eq!(collector.calls.get(), 0);
    assert_eq!(&transport.calls.borrow()[0], &fixture.pending);
}

#[test]
fn matching_data_with_wrong_outcomes_cannot_clear_pending() {
    let fixture = Fixture::new(true);
    let guard = WindowsActivityLock
        .try_acquire(&fixture.root.join("sync.lock"))
        .unwrap();
    let collector = FakeCollector::new(&fixture);
    let published = Cell::new(true);
    let transport = Transport {
        root: &fixture.root,
        published: &published,
        calls: RefCell::new(vec![]),
        accept: true,
        exit: 0,
    };
    let fetcher = Fetcher {
        root: &fixture.root,
        published: &published,
        calls: Cell::new(0),
        mismatch: true,
    };
    let result = run_locked(
        &guard,
        &fixture.config(true),
        Command::Sync,
        &Ports {
            clock: &clock(),
            collector: &collector,
            process: &transport,
            fetcher: &fetcher,
            cancellation: &CancelFlag(Cell::new(false)),
        },
    );
    assert_eq!(result.exit_code, 4);
    assert!(!result.publication_observed);
    assert_eq!(
        read_current(guard.root(), &clock())
            .unwrap()
            .image
            .pending
            .unwrap(),
        fixture.pending
    );
}

#[test]
fn paused_corrupt_cancelled_and_disabled_invocations_do_not_launch_delivery() {
    let fixture = Fixture::new(true);
    let guard = WindowsActivityLock
        .try_acquire(&fixture.root.join("sync.lock"))
        .unwrap();
    let collector = FakeCollector::new(&fixture);
    let published = Cell::new(false);
    let transport = Transport {
        root: &fixture.root,
        published: &published,
        calls: RefCell::new(vec![]),
        accept: false,
        exit: 0,
    };
    let fetcher = Fetcher {
        root: &fixture.root,
        published: &published,
        calls: Cell::new(0),
        mismatch: false,
    };
    let cancellation = CancelFlag(Cell::new(false));
    let ports = Ports {
        clock: &clock(),
        collector: &collector,
        process: &transport,
        fetcher: &fetcher,
        cancellation: &cancellation,
    };
    set_paused_locked(&guard, &clock(), "g-pause", true).unwrap();
    assert_eq!(
        run_locked(&guard, &fixture.config(true), Command::Sync, &ports).state,
        "paused"
    );
    set_paused_locked(&guard, &clock(), "g-resume", false).unwrap();
    assert_eq!(
        run_locked(&guard, &fixture.config(false), Command::Sync, &ports).state,
        "delivery_disabled"
    );
    cancellation.0.set(true);
    assert_eq!(
        run_locked(&guard, &fixture.config(true), Command::Sync, &ports).state,
        "cancelled"
    );
    cancellation.0.set(false);
    fs::write(fixture.root.join("CURRENT"), b"broken").unwrap();
    assert_eq!(
        run_locked(&guard, &fixture.config(true), Command::Sync, &ports).exit_code,
        6
    );
    assert_eq!(collector.calls.get(), 0);
    assert!(transport.calls.borrow().is_empty());
    assert_eq!(fetcher.calls.get(), 0);
}

#[test]
fn cancellation_and_clock_regression_after_collection_never_reserve_a_sequence() {
    for rollback in [false, true] {
        let fixture = Fixture::new(false);
        let guard = WindowsActivityLock
            .try_acquire(&fixture.root.join("sync.lock"))
            .unwrap();
        let cancellation = CancelFlag(Cell::new(false));
        let clock = clock();
        let mut collector = FakeCollector::new(&fixture);
        if rollback {
            collector.clock_after = Some(&clock);
        } else {
            collector.cancel_after = Some(&cancellation);
        }
        let published = Cell::new(false);
        let transport = Transport {
            root: &fixture.root,
            published: &published,
            calls: RefCell::new(vec![]),
            accept: false,
            exit: 0,
        };
        let fetcher = Fetcher {
            root: &fixture.root,
            published: &published,
            calls: Cell::new(0),
            mismatch: false,
        };
        let result = run_locked(
            &guard,
            &fixture.config(true),
            Command::Sync,
            &Ports {
                clock: &clock,
                collector: &collector,
                process: &transport,
                fetcher: &fetcher,
                cancellation: &cancellation,
            },
        );
        assert_eq!(result.exit_code, if rollback { 6 } else { 3 });
        let current = read_current(guard.root(), &clock).unwrap();
        assert_eq!(current.validated.highest_reserved, 42);
        assert!(current.image.pending.is_none());
        assert!(transport.calls.borrow().is_empty());
    }
}

#[test]
fn retry_without_pending_is_a_noop_and_disabled_sync_commits_without_network() {
    let fixture = Fixture::new(false);
    let guard = WindowsActivityLock
        .try_acquire(&fixture.root.join("sync.lock"))
        .unwrap();
    let collector = FakeCollector::new(&fixture);
    let published = Cell::new(false);
    let transport = Transport {
        root: &fixture.root,
        published: &published,
        calls: RefCell::new(vec![]),
        accept: false,
        exit: 0,
    };
    let fetcher = Fetcher {
        root: &fixture.root,
        published: &published,
        calls: Cell::new(0),
        mismatch: false,
    };
    let ports = Ports {
        clock: &clock(),
        collector: &collector,
        process: &transport,
        fetcher: &fetcher,
        cancellation: &CancelFlag(Cell::new(false)),
    };
    let result = run_locked(
        &guard,
        &fixture.config(false),
        Command::RetryPending,
        &ports,
    );
    assert_eq!(result.state, "no_pending");
    assert_eq!(collector.calls.get(), 0);
    let result = run_locked(&guard, &fixture.config(false), Command::Sync, &ports);
    assert_eq!(result.state, "delivery_disabled");
    assert_eq!(result.sequence, Some(43));
    assert!(
        read_current(guard.root(), &clock())
            .unwrap()
            .image
            .pending
            .is_some()
    );
    assert!(transport.calls.borrow().is_empty());
    assert_eq!(fetcher.calls.get(), 0);
}

#[test]
fn invalid_config_blocks_collection_and_all_mutations() {
    let fixture = Fixture::new(false);
    let guard = WindowsActivityLock
        .try_acquire(&fixture.root.join("sync.lock"))
        .unwrap();
    let collector = FakeCollector::new(&fixture);
    let published = Cell::new(false);
    let transport = Transport {
        root: &fixture.root,
        published: &published,
        calls: RefCell::new(vec![]),
        accept: false,
        exit: 0,
    };
    let fetcher = Fetcher {
        root: &fixture.root,
        published: &published,
        calls: Cell::new(0),
        mismatch: false,
    };
    let ports = Ports {
        clock: &clock(),
        collector: &collector,
        process: &transport,
        fetcher: &fetcher,
        cancellation: &CancelFlag(Cell::new(false)),
    };
    let mut config = fixture.config(true);
    config.delivery.as_mut().unwrap().restricted_alias = "bad;PRIVATE".to_owned();
    assert_eq!(
        run_locked(&guard, &config, Command::Sync, &ports).exit_code,
        5
    );
    assert_eq!(collector.calls.get(), 0);
    assert_eq!(
        read_current(guard.root(), &clock())
            .unwrap()
            .validated
            .highest_reserved,
        42
    );
}

struct OversizeCollector;
impl Collector for OversizeCollector {
    fn collect(&self, at: &str, _: &dyn Cancellation) -> Result<[SourceAttempt; 3], Cancelled> {
        let start =
            enouia_activity_contract::exact_activity_timestamp_ms("1000-01-01T00:00:00.000Z")
                .unwrap();
        let days = (0..150_000)
            .map(|i| enouia_activity_contract::Day {
                date: format_activity_timestamp(start + i * 86_400_000).unwrap()[..10].to_owned(),
                value: 1,
            })
            .collect();
        Ok([
            SourceAttempt::Success {
                source: SourceId::Github,
                attempted_at: at.to_owned(),
                snapshot: enouia_activity_contract::Snapshot {
                    updated_at: at.to_owned(),
                    timezone: "GitHub".to_owned(),
                    metric: "contributions".to_owned(),
                    days,
                },
            },
            SourceAttempt::Failed {
                source: SourceId::Codex,
                attempted_at: at.to_owned(),
                error_code: ErrorCode::Unconfigured,
            },
            SourceAttempt::Failed {
                source: SourceId::Claude,
                attempted_at: at.to_owned(),
                error_code: ErrorCode::Unconfigured,
            },
        ])
    }
}

#[test]
fn oversized_batch_does_not_truncate_history_or_reserve_a_sequence() {
    let fixture = Fixture::new(false);
    let guard = WindowsActivityLock
        .try_acquire(&fixture.root.join("sync.lock"))
        .unwrap();
    let published = Cell::new(false);
    let transport = Transport {
        root: &fixture.root,
        published: &published,
        calls: RefCell::new(vec![]),
        accept: false,
        exit: 0,
    };
    let fetcher = Fetcher {
        root: &fixture.root,
        published: &published,
        calls: Cell::new(0),
        mismatch: false,
    };
    let result = run_locked(
        &guard,
        &fixture.config(true),
        Command::Sync,
        &Ports {
            clock: &clock(),
            collector: &OversizeCollector,
            process: &transport,
            fetcher: &fetcher,
            cancellation: &CancelFlag(Cell::new(false)),
        },
    );
    assert_eq!(result.state, "batch_too_large");
    assert_eq!(result.exit_code, 6);
    let current = read_current(guard.root(), &clock()).unwrap();
    assert_eq!(current.validated.highest_reserved, 42);
    assert_eq!(current.validated.archive, fixture.archive);
    assert!(current.image.pending.is_none());
    assert!(transport.calls.borrow().is_empty());
}

struct MissingTransport;
impl ProcessRunner for MissingTransport {
    fn run(
        &self,
        _: &ProcessRequest,
        _: &dyn Cancellation,
    ) -> Result<ProcessOutput, StructuredError> {
        Err(StructuredError {
            code: ErrorCode::Unconfigured,
            component: enouia_common::ComponentId::ActivityDelivery,
            retryable: false,
        })
    }
}

#[test]
fn unavailable_transport_is_a_configuration_failure_with_pending_retained() {
    let fixture = Fixture::new(true);
    let guard = WindowsActivityLock
        .try_acquire(&fixture.root.join("sync.lock"))
        .unwrap();
    let collector = FakeCollector::new(&fixture);
    let published = Cell::new(false);
    let fetcher = Fetcher {
        root: &fixture.root,
        published: &published,
        calls: Cell::new(0),
        mismatch: false,
    };
    let result = run_locked(
        &guard,
        &fixture.config(true),
        Command::Sync,
        &Ports {
            clock: &clock(),
            collector: &collector,
            process: &MissingTransport,
            fetcher: &fetcher,
            cancellation: &CancelFlag(Cell::new(false)),
        },
    );
    assert_eq!(result.exit_code, 5);
    assert_eq!(result.error_code, Some(ErrorCode::Unconfigured));
    assert_eq!(collector.calls.get(), 0);
    assert_eq!(
        read_current(guard.root(), &clock())
            .unwrap()
            .image
            .pending
            .unwrap(),
        fixture.pending
    );
}
