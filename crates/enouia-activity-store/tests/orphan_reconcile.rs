#![cfg(windows)]
//! Operator reconciliation of generations left published but unselected by
//! process death. Hook interruptions stand in for that death: they run no
//! cleanup, so the audit keeps blocking until one named generation is
//! explicitly retracted with its exact manifest hash.

use enouia_activity_contract::{normalize_batch, public_data_bytes, sha256_hex};
use enouia_activity_store::generation::GenerationImage;
use enouia_activity_store::reader::read_current;
use enouia_activity_store::reconcile::{
    PreparedPointer, RetractError, inspect_recovery_locked, retract_unselected_locked,
};
use enouia_activity_store::recovery::{RecoveryError, Standing, audit_generations};
use enouia_activity_store::run_start::{RunDecision, RunStartError, decide_run_start};
use enouia_activity_store::writer::{
    CommitError, CommitPhase, PublicationEvidence, commit, commit_publication_observed,
    commit_publication_observed_with_hook, commit_with_hook,
};
use enouia_activity_store::{ActivityLockGuard, WindowsActivityLock};
use enouia_common::{FakeClock, LockProvider};
use serde_json::{Value, json};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const ORACLE: &str = include_str!("../../../tests/fixtures/activity/moriium-oracle-input.json");

fn clock() -> FakeClock {
    FakeClock::new(1_790_409_601_000)
}

fn root() -> PathBuf {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let root = std::env::temp_dir().join(format!(
        "enouia-orphan-reconcile-{}-{nonce}",
        std::process::id()
    ));
    fs::create_dir(&root).unwrap();
    root
}

fn clean(root: &Path) {
    assert!(root.starts_with(std::env::temp_dir()));
    assert!(
        root.file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with("enouia-orphan-reconcile-")
    );
    fs::remove_dir_all(root).unwrap();
}

fn blank_image() -> GenerationImage {
    let archive = enouia_activity_contract::normalize_activity(&json!({
        "version": 1,
        "sources": {"github": null, "codex": null, "claude": null}
    }))
    .unwrap();
    GenerationImage {
        activity: public_data_bytes(&archive).unwrap(),
        sequence: b"{\"sequence\":0}\n".to_vec(),
        pending: None,
        delivery: b"{}\n".to_vec(),
    }
}

fn pending_image(sequence: u64) -> GenerationImage {
    let mut raw: Value = serde_json::from_str(ORACLE).unwrap();
    raw["sequence"] = json!(sequence);
    let batch = normalize_batch(&raw, &clock()).unwrap();
    let mut pending = serde_json::to_vec(&batch).unwrap();
    pending.push(b'\n');
    GenerationImage {
        activity: public_data_bytes(&batch.data).unwrap(),
        sequence: format!("{{\"sequence\":{sequence}}}\n").into_bytes(),
        pending: Some(pending),
        delivery: b"{}\n".to_vec(),
    }
}

fn seed(root: &Path) -> ActivityLockGuard {
    let guard = WindowsActivityLock
        .try_acquire(&root.join("sync.lock"))
        .unwrap();
    let path = root.join("generations/g-0-seed");
    fs::create_dir_all(&path).unwrap();
    let image = blank_image();
    fs::write(path.join("activity.json"), &image.activity).unwrap();
    fs::write(path.join("sequence.json"), &image.sequence).unwrap();
    fs::write(path.join("delivery.json"), &image.delivery).unwrap();
    fs::write(
        path.join("manifest.json"),
        image.manifest_bytes("g-0-seed", &clock()).unwrap(),
    )
    .unwrap();
    fs::write(root.join("CURRENT"), b"g-0-seed\n").unwrap();
    guard
}

/// Every file under the root except the live lock, keyed by relative path.
fn tree(root: &Path) -> BTreeMap<String, String> {
    fn walk(base: &Path, dir: &Path, out: &mut BTreeMap<String, String>) {
        for entry in fs::read_dir(dir).unwrap() {
            let path = entry.unwrap().path();
            let relative = path
                .strip_prefix(base)
                .unwrap()
                .to_string_lossy()
                .replace('\\', "/");
            if path.is_dir() {
                walk(base, &path, out);
            } else if relative != "sync.lock" {
                out.insert(relative, sha256_hex(&fs::read(&path).unwrap()));
            }
        }
    }
    let mut out = BTreeMap::new();
    walk(root, root, &mut out);
    out
}

/// Publish `next_id` with a new batch and stop at `stop` as process death would.
fn orphan(
    guard: &ActivityLockGuard,
    expected: &str,
    next_id: &str,
    sequence: u64,
    stop: CommitPhase,
) {
    assert_eq!(
        commit_with_hook(
            guard,
            expected,
            next_id,
            &pending_image(sequence),
            &clock(),
            |phase| if phase == stop { Err(()) } else { Ok(()) }
        )
        .unwrap_err(),
        CommitError::InterruptedBeforeSwitch
    );
}

fn manifest_hash(root: &Path, id: &str) -> String {
    sha256_hex(&fs::read(root.join("generations").join(id).join("manifest.json")).unwrap())
}

fn evidence(current: &GenerationImage) -> PublicationEvidence {
    let pending = current.pending.as_ref().unwrap();
    PublicationEvidence {
        origin: "http://127.0.0.1".to_owned(),
        sequence: 1,
        exact_pending_sha256: sha256_hex(pending),
        manifest_sha256: "a".repeat(64),
        activity_sha256: sha256_hex(&current.activity),
        generated_at_ms: 1_790_409_601_000,
        published_at_ms: 1_790_409_601_000,
        received_at_ms: 1_790_409_601_000,
    }
}

#[test]
fn inspection_lists_the_blocking_orphan_and_changes_nothing() {
    let root = root();
    let guard = seed(&root);
    orphan(
        &guard,
        "g-0-seed",
        "g-1-dead",
        1,
        CommitPhase::CurrentPrepared,
    );
    let before = tree(&root);

    let inspection = inspect_recovery_locked(&guard, &clock()).unwrap();
    assert_eq!(inspection.current.id, "g-0-seed");
    assert_eq!(inspection.current.highest_reserved, 0);
    assert_eq!(
        inspection.current.manifest_sha256,
        manifest_hash(&root, "g-0-seed")
    );
    assert_eq!(inspection.older_generations, 0);
    assert_eq!(inspection.blocking.len(), 1);
    let blocking = &inspection.blocking[0];
    assert_eq!(blocking.id, "g-1-dead");
    assert_eq!(blocking.standing, Standing::HigherReservedSequence);
    assert_eq!(
        blocking.manifest_sha256.as_deref(),
        Some(manifest_hash(&root, "g-1-dead").as_str())
    );
    assert_eq!(blocking.highest_reserved, Some(1));
    assert_eq!(blocking.pending_sequence, Some(1));
    assert_eq!(
        blocking.pending_sha256.as_deref(),
        Some(sha256_hex(pending_image(1).pending.as_ref().unwrap()).as_str())
    );
    assert_eq!(blocking.prepared_pointer, PreparedPointer::Exact);
    assert_eq!(tree(&root), before);
    drop(guard);
    clean(&root);
}

#[test]
fn retraction_restores_writing_and_keeps_every_byte() {
    for (stop, pointer) in [
        (CommitPhase::CurrentPrepared, PreparedPointer::Exact),
        (CommitPhase::GenerationPublished, PreparedPointer::Absent),
    ] {
        let root = root();
        let guard = seed(&root);
        orphan(&guard, "g-0-seed", "g-1-dead", 1, stop);
        assert!(matches!(
            decide_run_start(&guard, &clock()),
            Err(RunStartError::Recovery(
                RecoveryError::HigherReservedSequence
            ))
        ));
        let before = tree(&root);
        let hash = manifest_hash(&root, "g-1-dead");

        let retracted = retract_unselected_locked(&guard, &clock(), "g-1-dead", &hash).unwrap();
        assert!(retracted.writable);
        assert_eq!(retracted.remaining_blocking, 0);
        let record = &retracted.record;
        assert_eq!(record["action"], "retract_unselected_generation");
        assert_eq!(record["operatorConfirmed"], "never_selected");
        assert_eq!(record["retractedAtMs"], 1_790_409_601_000_i64);
        assert_eq!(record["generation"]["id"], "g-1-dead");
        assert_eq!(record["generation"]["standing"], "higher_reserved_sequence");
        assert_eq!(record["generation"]["manifestSha256"], hash.as_str());
        assert_eq!(record["generation"]["highestReserved"], 1);
        assert_eq!(record["generation"]["preparedPointer"], pointer.as_str());
        assert_eq!(
            record["generation"]["retainedAs"],
            "generations/.staging-g-1-dead"
        );
        assert_eq!(record["current"]["id"], "g-0-seed");
        assert_eq!(record["current"]["highestReserved"], 0);
        let stored: Value = serde_json::from_slice(
            &fs::read(root.join("reconciliations/retract-g-1-dead.json")).unwrap(),
        )
        .unwrap();
        assert_eq!(&stored, record);

        // Only the directory name changed and one record was added.
        let after = tree(&root);
        for (path, hash) in &before {
            let moved = path.replace("generations/g-1-dead/", "generations/.staging-g-1-dead/");
            assert_eq!(after.get(&moved), Some(hash), "{path} changed");
        }
        assert_eq!(after.len(), before.len() + 1);
        assert_eq!(fs::read(root.join("CURRENT")).unwrap(), b"g-0-seed\n");

        assert_eq!(
            audit_generations(&root, &clock())
                .unwrap()
                .staging_directories,
            1
        );
        assert!(matches!(
            decide_run_start(&guard, &clock()).unwrap(),
            RunDecision::Collect {
                next_sequence: 1,
                ..
            }
        ));
        commit(&guard, "g-0-seed", "g-1-retry", &pending_image(1), &clock()).unwrap();
        let selected = read_current(&root, &clock()).unwrap();
        assert_eq!(selected.id, "g-1-retry");
        assert_eq!(selected.validated.highest_reserved, 1);
        drop(guard);
        clean(&root);
    }
}

#[test]
fn retraction_of_an_unrecorded_receipt_allows_the_acknowledgment_again() {
    let root = root();
    let guard = seed(&root);
    commit(
        &guard,
        "g-0-seed",
        "g-1-pending",
        &pending_image(1),
        &clock(),
    )
    .unwrap();
    let selected = read_current(&root, &clock()).unwrap();
    let evidence = evidence(&selected.image);
    assert_eq!(
        commit_publication_observed_with_hook(
            &guard,
            "g-1-pending",
            "g-1-ack-dead",
            &evidence,
            &clock(),
            |phase| if phase == CommitPhase::CurrentPrepared {
                Err(())
            } else {
                Ok(())
            }
        )
        .unwrap_err(),
        CommitError::InterruptedBeforeSwitch
    );
    let inspection = inspect_recovery_locked(&guard, &clock()).unwrap();
    assert_eq!(inspection.older_generations, 1);
    assert_eq!(inspection.blocking.len(), 1);
    assert_eq!(
        inspection.blocking[0].standing,
        Standing::ConflictingGeneration
    );
    assert_eq!(inspection.blocking[0].pending_sequence, None);

    let hash = manifest_hash(&root, "g-1-ack-dead");
    let retracted = retract_unselected_locked(&guard, &clock(), "g-1-ack-dead", &hash).unwrap();
    assert!(retracted.writable);
    assert_eq!(
        retracted.record["generation"]["standing"],
        "conflicting_generation"
    );
    assert!(matches!(
        decide_run_start(&guard, &clock()).unwrap(),
        RunDecision::RetryPending { sequence: 1, .. }
    ));
    commit_publication_observed(&guard, "g-1-pending", "g-1-ack", &evidence, &clock()).unwrap();
    assert_eq!(read_current(&root, &clock()).unwrap().image.pending, None);
    drop(guard);
    clean(&root);
}

#[test]
fn refusals_leave_the_root_unchanged() {
    let root = root();
    let guard = seed(&root);
    commit(
        &guard,
        "g-0-seed",
        "g-1-pending",
        &pending_image(1),
        &clock(),
    )
    .unwrap();
    let selected = read_current(&root, &clock()).unwrap();
    commit_publication_observed(
        &guard,
        "g-1-pending",
        "g-1-live",
        &evidence(&selected.image),
        &clock(),
    )
    .unwrap();
    orphan(
        &guard,
        "g-1-live",
        "g-2-dead",
        2,
        CommitPhase::CurrentPrepared,
    );
    // The writer now refuses further commits, so the second, corrupt orphan
    // is a copy whose bytes no longer match its manifest.
    let corrupt_path = root.join("generations/g-2-corrupt");
    fs::create_dir(&corrupt_path).unwrap();
    for entry in fs::read_dir(root.join("generations/g-2-dead")).unwrap() {
        let entry = entry.unwrap();
        fs::copy(entry.path(), corrupt_path.join(entry.file_name())).unwrap();
    }
    fs::write(corrupt_path.join("sequence.json"), b"{\"sequence\":9}\n").unwrap();
    let dead = manifest_hash(&root, "g-2-dead");
    let before = tree(&root);

    let inspection = inspect_recovery_locked(&guard, &clock()).unwrap();
    assert_eq!(inspection.current.id, "g-1-live");
    assert_eq!(inspection.older_generations, 2);
    let corrupt = inspection
        .blocking
        .iter()
        .find(|generation| generation.id == "g-2-corrupt")
        .unwrap();
    assert!(matches!(corrupt.standing, Standing::Corrupt(_)));
    assert_eq!(corrupt.highest_reserved, None);

    let refuse = |id: &str, hash: &str| retract_unselected_locked(&guard, &clock(), id, hash);
    // CURRENT, an older generation, an absent one and a corrupt one.
    for id in [
        "g-1-live",
        "g-0-seed",
        "g-1-pending",
        "g-9-absent",
        "g-2-corrupt",
    ] {
        let hash = if root.join("generations").join(id).is_dir() {
            manifest_hash(&root, id)
        } else {
            "0".repeat(64)
        };
        assert_eq!(
            refuse(id, &hash).unwrap_err(),
            RetractError::NotRetractable,
            "{id}"
        );
    }
    assert_eq!(
        refuse("g-2-dead", &"0".repeat(64)).unwrap_err(),
        RetractError::ManifestMismatch
    );
    assert_eq!(
        refuse("g-2-dead", &dead.to_uppercase()).unwrap_err(),
        RetractError::InvalidGenerationId
    );
    assert_eq!(
        refuse("../g-2-dead", &dead).unwrap_err(),
        RetractError::InvalidGenerationId
    );
    assert_eq!(tree(&root), before);

    fs::create_dir(root.join("generations/.staging-g-2-dead")).unwrap();
    assert_eq!(
        refuse("g-2-dead", &dead).unwrap_err(),
        RetractError::StagingOccupied
    );
    fs::remove_dir(root.join("generations/.staging-g-2-dead")).unwrap();
    assert_eq!(tree(&root), before);

    // Retracting one of two blockers leaves the root blocked by the other.
    let retracted = retract_unselected_locked(&guard, &clock(), "g-2-dead", &dead).unwrap();
    assert!(!retracted.writable);
    assert_eq!(retracted.remaining_blocking, 1);
    assert!(matches!(
        audit_generations(&root, &clock()),
        Err(RecoveryError::CorruptGeneration(_))
    ));
    drop(guard);
    clean(&root);
}
