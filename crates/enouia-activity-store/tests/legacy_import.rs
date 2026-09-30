#![cfg(windows)]

use enouia_activity_contract::{MAX_SAFE_INTEGER, normalize_batch, public_data_bytes, sha256_hex};
use enouia_activity_store::WindowsActivityLock;
use enouia_activity_store::generation::GenerationError;
use enouia_activity_store::legacy_export::export_legacy_trio;
use enouia_activity_store::legacy_import::{
    ImportError, ImportOptions, import_legacy_trio, import_legacy_trio_with_hook,
};
use enouia_activity_store::legacy_inspect::{InspectError, inspect_legacy_trio};
use enouia_activity_store::pause::set_paused_locked;
use enouia_activity_store::reader::{ReadError, read_current};
use enouia_activity_store::recovery::audit_generations;
use enouia_activity_store::run_start::{RunDecision, RunStartError, decide_run_start};
use enouia_activity_store::writer::{CommitError, CommitPhase};
use enouia_common::{FakeClock, LockProvider};
use serde_json::{Value, json};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const ORACLE: &str = include_str!("../../../tests/fixtures/activity/moriium-oracle-input.json");

fn clock() -> FakeClock {
    FakeClock::new(1_790_409_601_000)
}

struct Fixture {
    base: PathBuf,
    source: PathBuf,
    target: PathBuf,
    pending: Vec<u8>,
}

impl Fixture {
    fn new(with_pending: bool) -> Self {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let base = std::env::temp_dir().join(format!(
            "enouia-legacy-import-{}-{nonce}",
            std::process::id()
        ));
        let source = base.join("legacy");
        let target = base.join("runtime");
        fs::create_dir_all(&source).unwrap();
        fs::create_dir(&target).unwrap();
        let mut raw: Value = serde_json::from_str(ORACLE).unwrap();
        raw["sequence"] = json!(1);
        let batch = normalize_batch(&raw, &clock()).unwrap();
        // Noncanonical whitespace must survive import, export, and retry exactly.
        let mut pending = serde_json::to_vec_pretty(&batch).unwrap();
        pending.extend_from_slice(b"\r\n");
        let archive: Value =
            serde_json::from_slice(&public_data_bytes(&batch.data).unwrap()).unwrap();
        fs::write(
            source.join("activity.json"),
            serde_json::to_vec_pretty(&archive).unwrap(),
        )
        .unwrap();
        fs::write(source.join("sequence.json"), b"{\"sequence\":5}\r\n").unwrap();
        if with_pending {
            fs::write(source.join("pending.json"), &pending).unwrap();
        }
        Self {
            base,
            source,
            target,
            pending,
        }
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
                .starts_with("enouia-legacy-import-")
        );
        fs::remove_dir_all(&self.base).unwrap();
    }
}

fn options(high_water: u64) -> ImportOptions {
    ImportOptions {
        reconciled_high_water: high_water,
        verified_unused_identity: false,
    }
}

#[test]
fn round_trip_preserves_richer_archive_exact_pending_and_reconciled_high_water() {
    let fixture = Fixture::new(true);
    let mut archive: Value =
        serde_json::from_slice(&fs::read(fixture.source.join("activity.json")).unwrap()).unwrap();
    archive["sources"]["github"]["updatedAt"] = json!("2026-09-26T08:00:01.000Z");
    archive["sources"]["github"]["days"][0]["value"] = json!(3);
    archive["sources"]["github"]["days"]
        .as_array_mut()
        .unwrap()
        .push(json!({"date":"2026-01-01", "value":10}));
    fs::write(
        fixture.source.join("activity.json"),
        serde_json::to_vec_pretty(&archive).unwrap(),
    )
    .unwrap();
    let inspected = inspect_legacy_trio(&fixture.source, &clock()).unwrap();
    let guard = WindowsActivityLock
        .try_acquire(&fixture.target.join("sync.lock"))
        .unwrap();
    let summary =
        import_legacy_trio(&guard, &fixture.source, "g-import", &options(9), &clock()).unwrap();
    assert_eq!(summary.legacy_high_water, 5);
    assert_eq!(summary.highest_reserved, 9);
    assert_eq!(summary.raw_archive_sha256, inspected.raw_archive_sha256);
    assert_eq!(
        summary.raw_sequence_sha256,
        sha256_hex(b"{\"sequence\":5}\r\n")
    );
    assert_eq!(
        summary.activity_sha256,
        sha256_hex(&inspected.canonical_archive_bytes)
    );
    assert_eq!(summary.pending_sha256, Some(sha256_hex(&fixture.pending)));
    let current = audit_generations(guard.root(), &clock()).unwrap().current;
    assert_eq!(current.validated.archive, inspected.archive);
    assert_eq!(current.validated.highest_reserved, 9);
    assert_eq!(current.validated.pending.unwrap().sequence, 1);
    assert_eq!(current.image.pending, Some(fixture.pending.clone()));
    assert_eq!(current.image.delivery, b"{\"paused\":true}\n");
    assert!(matches!(
        decide_run_start(&guard, &clock()).unwrap(),
        RunDecision::Paused {
            pending_sequence: Some(1),
            ..
        }
    ));
    // Export is still permitted while paused and never changes original input.
    let bundle = fixture.base.join("rollback");
    export_legacy_trio(&guard, &bundle, &clock()).unwrap();
    let exported = inspect_legacy_trio(&bundle, &clock()).unwrap();
    assert_eq!(exported.archive, inspected.archive);
    assert_eq!(exported.highest_reserved, 9);
    assert_eq!(exported.exact_pending_bytes, Some(fixture.pending.clone()));
    assert_eq!(
        inspect_legacy_trio(&fixture.source, &clock())
            .unwrap()
            .raw_archive_sha256,
        summary.raw_archive_sha256
    );
    assert_eq!(
        fs::read(fixture.source.join("sequence.json")).unwrap(),
        b"{\"sequence\":5}\r\n"
    );
    set_paused_locked(&guard, &clock(), "g-resumed", false).unwrap();
    assert_eq!(
        decide_run_start(&guard, &clock()).unwrap(),
        RunDecision::RetryPending {
            generation_id: "g-resumed".to_owned(),
            sequence: 1,
            exact_bytes: fixture.pending.clone(),
        }
    );
}

#[test]
fn no_pending_stays_absent_and_next_sequence_follows_the_imported_ceiling() {
    let fixture = Fixture::new(false);
    let guard = WindowsActivityLock
        .try_acquire(&fixture.target.join("sync.lock"))
        .unwrap();
    let summary =
        import_legacy_trio(&guard, &fixture.source, "g-import", &options(12), &clock()).unwrap();
    assert_eq!(summary.pending_sha256, None);
    assert!(
        !fixture
            .target
            .join("generations/g-import/pending.json")
            .exists()
    );
    set_paused_locked(&guard, &clock(), "g-resumed", false).unwrap();
    assert!(matches!(
        decide_run_start(&guard, &clock()).unwrap(),
        RunDecision::Collect {
            next_sequence: 13,
            ..
        }
    ));
}

#[test]
fn refuses_existing_corrupt_or_interrupted_state_without_overwriting_it() {
    let fixture = Fixture::new(false);
    let guard = WindowsActivityLock
        .try_acquire(&fixture.target.join("sync.lock"))
        .unwrap();
    for (name, bytes) in [
        ("CURRENT", b"broken".as_slice()),
        ("activity.json", b"legacy"),
        ("CURRENT.g-old.tmp", b"g-old\n"),
    ] {
        let path = fixture.target.join(name);
        fs::write(&path, bytes).unwrap();
        assert_eq!(
            import_legacy_trio(&guard, &fixture.source, "g-import", &options(5), &clock())
                .unwrap_err(),
            ImportError::ExistingState
        );
        assert_eq!(fs::read(&path).unwrap(), bytes);
        fs::remove_file(path).unwrap();
    }
    fs::create_dir(fixture.target.join("generations")).unwrap();
    assert_eq!(
        import_legacy_trio(&guard, &fixture.source, "g-import", &options(5), &clock()).unwrap_err(),
        ImportError::ExistingState
    );
    fs::remove_dir(fixture.target.join("generations")).unwrap();
    import_legacy_trio(&guard, &fixture.source, "g-import", &options(5), &clock()).unwrap();
    assert_eq!(
        import_legacy_trio(&guard, &fixture.source, "g-replace", &options(99), &clock())
            .unwrap_err(),
        ImportError::ExistingState
    );
    assert_eq!(
        read_current(guard.root(), &clock())
            .unwrap()
            .validated
            .highest_reserved,
        5
    );
}

#[test]
fn rejects_lower_or_unsafe_high_water_bad_generation_and_missing_sequence_before_writes() {
    let fixture = Fixture::new(true);
    let guard = WindowsActivityLock
        .try_acquire(&fixture.target.join("sync.lock"))
        .unwrap();
    for high_water in [0, 4, MAX_SAFE_INTEGER + 1] {
        assert_eq!(
            import_legacy_trio(
                &guard,
                &fixture.source,
                "g-import",
                &options(high_water),
                &clock()
            )
            .unwrap_err(),
            ImportError::InvalidHighWater
        );
    }
    assert_eq!(
        import_legacy_trio(&guard, &fixture.source, "../escape", &options(5), &clock())
            .unwrap_err(),
        ImportError::InvalidImage(GenerationError::InvalidManifest)
    );
    fs::remove_file(fixture.source.join("sequence.json")).unwrap();
    assert_eq!(
        import_legacy_trio(&guard, &fixture.source, "g-import", &options(5), &clock()).unwrap_err(),
        ImportError::Inspect(InspectError::Read(ReadError::MissingFile))
    );
    assert!(!fixture.target.join("generations").exists());
}

#[test]
fn rejects_private_or_inconsistent_pending_instead_of_normalizing_it() {
    let fixture = Fixture::new(true);
    let guard = WindowsActivityLock
        .try_acquire(&fixture.target.join("sync.lock"))
        .unwrap();
    let pending: Value = serde_json::from_slice(&fixture.pending).unwrap();
    let mut private = pending.clone();
    private["private"] = json!("PRIVATE_IMPORT_SENTINEL");
    let mut above = pending.clone();
    above["sequence"] = json!(6);
    let mut missing_history = pending.clone();
    missing_history["data"]["sources"]["github"]["days"]
        .as_array_mut()
        .unwrap()
        .push(json!({"date":"2026-01-01", "value":10}));
    for invalid in [private, above, missing_history] {
        fs::write(
            fixture.source.join("pending.json"),
            serde_json::to_vec(&invalid).unwrap(),
        )
        .unwrap();
        assert_eq!(
            import_legacy_trio(&guard, &fixture.source, "g-import", &options(9), &clock())
                .unwrap_err(),
            ImportError::Inspect(InspectError::InvalidImage(GenerationError::InvalidPending))
        );
        assert!(!fixture.target.join("generations").exists());
    }
}

#[test]
fn zero_sequence_requires_verified_unused_identity_and_safe_maximum_stays_exhausted() {
    let fixture = Fixture::new(false);
    fs::write(
        fixture.source.join("activity.json"),
        b"{\"version\":1,\"sources\":{\"github\":null,\"codex\":null,\"claude\":null}}\n",
    )
    .unwrap();
    fs::write(fixture.source.join("sequence.json"), b"{\"sequence\":0}\n").unwrap();
    let guard = WindowsActivityLock
        .try_acquire(&fixture.target.join("sync.lock"))
        .unwrap();
    assert_eq!(
        import_legacy_trio(&guard, &fixture.source, "g-import", &options(0), &clock()).unwrap_err(),
        ImportError::UnverifiedUnusedIdentity
    );
    assert!(!fixture.target.join("generations").exists());
    import_legacy_trio(
        &guard,
        &fixture.source,
        "g-import",
        &ImportOptions {
            reconciled_high_water: 0,
            verified_unused_identity: true,
        },
        &clock(),
    )
    .unwrap();
    set_paused_locked(&guard, &clock(), "g-resumed", false).unwrap();
    assert!(matches!(
        decide_run_start(&guard, &clock()).unwrap(),
        RunDecision::Collect {
            next_sequence: 1,
            ..
        }
    ));
    let exhausted = fixture.base.join("exhausted");
    fs::create_dir(&exhausted).unwrap();
    let exhausted_guard = WindowsActivityLock
        .try_acquire(&exhausted.join("sync.lock"))
        .unwrap();
    import_legacy_trio(
        &exhausted_guard,
        &fixture.source,
        "g-import",
        &options(MAX_SAFE_INTEGER),
        &clock(),
    )
    .unwrap();
    set_paused_locked(&exhausted_guard, &clock(), "g-resumed", false).unwrap();
    assert_eq!(
        decide_run_start(&exhausted_guard, &clock()).unwrap_err(),
        RunStartError::SequenceExhausted
    );
}

#[test]
fn rejects_relative_and_overlapping_source_directories() {
    let fixture = Fixture::new(false);
    let guard = WindowsActivityLock
        .try_acquire(&fixture.target.join("sync.lock"))
        .unwrap();
    let nested = fixture.target.join("legacy");
    // Check overlap before trying to read a trio, without creating target entries.
    for source in [
        Path::new("legacy"),
        fixture.target.as_path(),
        fixture.base.as_path(),
    ] {
        assert_eq!(
            import_legacy_trio(&guard, source, "g-import", &options(5), &clock()).unwrap_err(),
            ImportError::InvalidSource
        );
    }
    fs::create_dir(&nested).unwrap();
    assert_eq!(
        import_legacy_trio(&guard, &nested, "g-import", &options(5), &clock()).unwrap_err(),
        ImportError::ExistingState
    );
}

#[test]
fn every_import_interruption_leaves_no_pointer_or_one_complete_paused_generation() {
    let phases = [
        CommitPhase::FileFlushed("activity.json"),
        CommitPhase::FileFlushed("sequence.json"),
        CommitPhase::FileFlushed("pending.json"),
        CommitPhase::FileFlushed("delivery.json"),
        CommitPhase::FileFlushed("manifest.json"),
        CommitPhase::GenerationPublished,
        CommitPhase::CurrentPrepared,
        CommitPhase::CurrentSwitched,
    ];
    for phase in phases {
        let fixture = Fixture::new(true);
        let guard = WindowsActivityLock
            .try_acquire(&fixture.target.join("sync.lock"))
            .unwrap();
        let result = import_legacy_trio_with_hook(
            &guard,
            &fixture.source,
            "g-import",
            &options(9),
            &clock(),
            |observed| {
                if observed == phase { Err(()) } else { Ok(()) }
            },
        );
        let after_switch = phase == CommitPhase::CurrentSwitched;
        assert_eq!(
            result.unwrap_err(),
            ImportError::Commit(if after_switch {
                CommitError::InterruptedAfterSwitch
            } else {
                CommitError::InterruptedBeforeSwitch
            })
        );
        drop(guard);
        // Reacquire the real process-owned lock to model the next invocation.
        let guard = WindowsActivityLock
            .try_acquire(&fixture.target.join("sync.lock"))
            .unwrap();
        if after_switch {
            let current = audit_generations(guard.root(), &clock()).unwrap().current;
            assert_eq!(current.image.pending, Some(fixture.pending.clone()));
            assert_eq!(current.validated.highest_reserved, 9);
            assert!(matches!(
                decide_run_start(&guard, &clock()).unwrap(),
                RunDecision::Paused {
                    pending_sequence: Some(1),
                    ..
                }
            ));
        } else {
            assert!(matches!(
                read_current(guard.root(), &clock()),
                Err(ReadError::MissingCurrent)
            ));
        }
        assert_eq!(
            import_legacy_trio(&guard, &fixture.source, "g-other", &options(5), &clock())
                .unwrap_err(),
            ImportError::ExistingState
        );
        assert_eq!(
            fs::read(fixture.source.join("pending.json")).unwrap(),
            fixture.pending
        );
    }
}

#[test]
fn bootstrap_pointer_switch_never_replaces_an_unexpected_current() {
    let fixture = Fixture::new(true);
    let guard = WindowsActivityLock
        .try_acquire(&fixture.target.join("sync.lock"))
        .unwrap();
    let result = import_legacy_trio_with_hook(
        &guard,
        &fixture.source,
        "g-import",
        &options(9),
        &clock(),
        |phase| {
            if phase == CommitPhase::CurrentPrepared {
                fs::write(fixture.target.join("CURRENT"), b"unexpected-current\n").unwrap();
            }
            Ok(())
        },
    );
    assert_eq!(
        result.unwrap_err(),
        ImportError::Commit(CommitError::SwitchFailed)
    );
    assert_eq!(
        fs::read(fixture.target.join("CURRENT")).unwrap(),
        b"unexpected-current\n"
    );
}
