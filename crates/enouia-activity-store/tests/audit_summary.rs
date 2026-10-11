#![cfg(windows)]
//! ADR-034: the write-path audit judges unselected generations from their
//! manifest and hash-checked sequence, never their archive. Damage to an
//! older archive no longer blocks writing; full inspection still reports it.

use enouia_activity_contract::{normalize_batch, public_data_bytes, sha256_hex};
use enouia_activity_store::generation::{GenerationError, GenerationImage};
use enouia_activity_store::pause::set_paused_locked;
use enouia_activity_store::reader::{ReadError, read_current};
use enouia_activity_store::reconcile::{
    RetractError, inspect_recovery_locked, retract_unselected_locked,
};
use enouia_activity_store::recovery::{RecoveryError, Standing, audit_generations};
use enouia_activity_store::writer::{CommitError, CommitPhase, commit, commit_with_hook};
use enouia_activity_store::{ActivityLockGuard, WindowsActivityLock};
use enouia_common::{FakeClock, LockProvider};
use serde_json::{Value, json};
use std::fs::{self, OpenOptions};
use std::os::windows::fs::OpenOptionsExt;
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
        "enouia-audit-summary-{}-{nonce}",
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
            .starts_with("enouia-audit-summary-")
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

#[test]
fn an_unreadable_older_archive_does_not_stop_writing() {
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
    // No sharing at all: any read of the seed archive would fail.
    let held = OpenOptions::new()
        .read(true)
        .share_mode(0)
        .open(root.join("generations/g-0-seed/activity.json"))
        .unwrap();
    set_paused_locked(&guard, &clock(), "g-1-paused", true).unwrap();
    assert_eq!(read_current(&root, &clock()).unwrap().id, "g-1-paused");
    drop(held);
    drop(guard);
    clean(&root);
}

#[test]
fn a_damaged_older_archive_is_reported_by_inspection_only() {
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
    fs::write(
        root.join("generations/g-0-seed/activity.json"),
        b"damaged\n",
    )
    .unwrap();
    assert_eq!(
        audit_generations(&root, &clock())
            .unwrap()
            .older_generations,
        1
    );
    set_paused_locked(&guard, &clock(), "g-1-paused", true).unwrap();
    let inspection = inspect_recovery_locked(&guard, &clock()).unwrap();
    assert!(inspection.blocking.is_empty());
    assert_eq!(inspection.damaged_older, vec!["g-0-seed".to_owned()]);
    drop(guard);
    clean(&root);
}

#[test]
fn a_tampered_older_sequence_or_manifest_still_blocks() {
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
    let sequence = root.join("generations/g-0-seed/sequence.json");
    let original = fs::read(&sequence).unwrap();
    fs::write(&sequence, b"{\"sequence\":9}\n").unwrap();
    assert_eq!(
        audit_generations(&root, &clock()).err().unwrap(),
        RecoveryError::CorruptGeneration(ReadError::InvalidGeneration(
            GenerationError::HashMismatch
        ))
    );
    fs::write(&sequence, &original).unwrap();
    let manifest = root.join("generations/g-0-seed/manifest.json");
    let mut tampered: Value = serde_json::from_slice(&fs::read(&manifest).unwrap()).unwrap();
    tampered["files"]["activity.json"] = json!("BAD");
    fs::write(&manifest, serde_json::to_vec(&tampered).unwrap()).unwrap();
    assert_eq!(
        commit(
            &guard,
            "g-1-pending",
            "g-1-next",
            &pending_image(1),
            &clock()
        )
        .unwrap_err(),
        CommitError::Recovery(RecoveryError::CorruptGeneration(
            ReadError::InvalidGeneration(GenerationError::InvalidManifest)
        ))
    );
    drop(guard);
    clean(&root);
}

#[test]
fn an_orphan_with_a_damaged_archive_blocks_and_cannot_be_retracted() {
    let root = root();
    let guard = seed(&root);
    assert_eq!(
        commit_with_hook(
            &guard,
            "g-0-seed",
            "g-1-dead",
            &pending_image(1),
            &clock(),
            |phase| {
                if phase == CommitPhase::CurrentPrepared {
                    Err(())
                } else {
                    Ok(())
                }
            }
        )
        .unwrap_err(),
        CommitError::InterruptedBeforeSwitch
    );
    fs::write(
        root.join("generations/g-1-dead/activity.json"),
        b"damaged\n",
    )
    .unwrap();
    assert_eq!(
        audit_generations(&root, &clock()).err().unwrap(),
        RecoveryError::HigherReservedSequence
    );
    let inspection = inspect_recovery_locked(&guard, &clock()).unwrap();
    assert_eq!(inspection.blocking.len(), 1);
    assert_eq!(
        inspection.blocking[0].standing,
        Standing::HigherReservedSequence
    );
    assert_eq!(inspection.blocking[0].highest_reserved, None);
    let hash = sha256_hex(&fs::read(root.join("generations/g-1-dead/manifest.json")).unwrap());
    assert_eq!(
        retract_unselected_locked(&guard, &clock(), "g-1-dead", &hash).unwrap_err(),
        RetractError::NotRetractable
    );
    drop(guard);
    clean(&root);
}
