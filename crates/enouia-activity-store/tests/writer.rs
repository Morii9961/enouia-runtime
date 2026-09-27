#![cfg(windows)]

use enouia_activity_contract::{normalize_activity, normalize_batch, public_data_bytes};
use enouia_activity_store::WindowsActivityLock;
use enouia_activity_store::generation::GenerationImage;
use enouia_activity_store::reader::read_current;
use enouia_activity_store::writer::{CommitError, CommitPhase, commit, commit_with_hook};
use enouia_common::{FakeClock, LockProvider};
use serde_json::{Value, json};
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
        "enouia-generation-writer-{}-{nonce}",
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
            .starts_with("enouia-generation-writer-")
    );
    fs::remove_dir_all(root).unwrap();
}

fn blank_image() -> GenerationImage {
    let archive = normalize_activity(&json!({
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

fn pending_image() -> GenerationImage {
    let mut raw: Value = serde_json::from_str(ORACLE).unwrap();
    raw["sequence"] = json!(1);
    let batch = normalize_batch(&raw, &clock()).unwrap();
    let mut pending = serde_json::to_vec(&batch).unwrap();
    pending.push(b'\n');
    GenerationImage {
        activity: public_data_bytes(&batch.data).unwrap(),
        sequence: b"{\"sequence\":1}\n".to_vec(),
        pending: Some(pending),
        delivery: b"{}\n".to_vec(),
    }
}

fn seed(root: &Path) {
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
}

#[test]
fn delivery_only_commit_switches_pointer_after_new_generation_is_complete() {
    let root = root();
    seed(&root);
    let guard = WindowsActivityLock
        .try_acquire(&root.join("sync.lock"))
        .unwrap();
    let mut next = blank_image();
    next.delivery = b"{\"paused\":true}\n".to_vec();
    commit(&guard, "g-0-seed", "g-0-next", &next, &clock()).unwrap();
    let observed = read_current(&root, &clock()).unwrap();
    assert_eq!(observed.id, "g-0-next");
    assert_eq!(observed.image.delivery, next.delivery);
    assert_eq!(
        fs::read(root.join("generations/g-0-seed/delivery.json")).unwrap(),
        b"{}\n"
    );
    assert_eq!(
        commit(&guard, "g-0-seed", "g-0-other", &next, &clock()).unwrap_err(),
        CommitError::StaleGeneration
    );
    drop(guard);
    clean(&root);
}

#[test]
fn failures_before_pointer_switch_keep_old_generation_selected() {
    for (index, stop) in [
        CommitPhase::FileFlushed("activity.json"),
        CommitPhase::FileFlushed("sequence.json"),
        CommitPhase::FileFlushed("delivery.json"),
        CommitPhase::FileFlushed("manifest.json"),
        CommitPhase::GenerationPublished,
        CommitPhase::CurrentPrepared,
    ]
    .into_iter()
    .enumerate()
    {
        let root = root();
        seed(&root);
        let guard = WindowsActivityLock
            .try_acquire(&root.join("sync.lock"))
            .unwrap();
        let next_id = format!("g-1-fault-{index}");
        let result = commit_with_hook(
            &guard,
            "g-0-seed",
            &next_id,
            &blank_image(),
            &clock(),
            |phase| {
                if phase == stop { Err(()) } else { Ok(()) }
            },
        );
        assert_eq!(result.unwrap_err(), CommitError::InterruptedBeforeSwitch);
        assert_eq!(read_current(&root, &clock()).unwrap().id, "g-0-seed");
        drop(guard);
        clean(&root);
    }
}

#[test]
fn interruption_after_pointer_switch_is_reconciled_by_reading_current() {
    let root = root();
    seed(&root);
    let guard = WindowsActivityLock
        .try_acquire(&root.join("sync.lock"))
        .unwrap();
    let result = commit_with_hook(
        &guard,
        "g-0-seed",
        "g-1-after",
        &blank_image(),
        &clock(),
        |phase| {
            if phase == CommitPhase::CurrentSwitched {
                Err(())
            } else {
                Ok(())
            }
        },
    );
    assert_eq!(result.unwrap_err(), CommitError::InterruptedAfterSwitch);
    assert_eq!(read_current(&root, &clock()).unwrap().id, "g-1-after");
    drop(guard);
    clean(&root);
}

#[test]
fn interrupted_pending_file_flush_keeps_previous_pointer() {
    let root = root();
    seed(&root);
    let guard = WindowsActivityLock
        .try_acquire(&root.join("sync.lock"))
        .unwrap();
    let result = commit_with_hook(
        &guard,
        "g-0-seed",
        "g-1-partial",
        &pending_image(),
        &clock(),
        |phase| {
            if phase == CommitPhase::FileFlushed("pending.json") {
                Err(())
            } else {
                Ok(())
            }
        },
    );
    assert_eq!(result.unwrap_err(), CommitError::InterruptedBeforeSwitch);
    assert_eq!(read_current(&root, &clock()).unwrap().id, "g-0-seed");
    drop(guard);
    clean(&root);
}

#[test]
fn pending_batch_reserves_one_sequence_and_cannot_be_cleared_or_replaced() {
    let root = root();
    seed(&root);
    let guard = WindowsActivityLock
        .try_acquire(&root.join("sync.lock"))
        .unwrap();
    let mut skipped = pending_image();
    skipped.sequence = b"{\"sequence\":2}\n".to_vec();
    assert_eq!(
        commit(&guard, "g-0-seed", "g-2-skipped", &skipped, &clock()).unwrap_err(),
        CommitError::InvalidTransition
    );
    let pending = pending_image();
    commit(&guard, "g-0-seed", "g-1-pending", &pending, &clock()).unwrap();
    let observed = read_current(&root, &clock()).unwrap();
    assert_eq!(observed.validated.highest_reserved, 1);
    assert_eq!(observed.image.pending, pending.pending);

    let mut clearing = pending_image();
    clearing.pending = None;
    assert_eq!(
        commit(&guard, "g-1-pending", "g-2-clear", &clearing, &clock()).unwrap_err(),
        CommitError::InvalidTransition
    );
    let mut replacing = pending_image();
    replacing.pending.as_mut().unwrap().push(b' ');
    assert_eq!(
        commit(&guard, "g-1-pending", "g-2-replace", &replacing, &clock()).unwrap_err(),
        CommitError::InvalidTransition
    );
    assert_eq!(read_current(&root, &clock()).unwrap().id, "g-1-pending");
    drop(guard);
    clean(&root);
}
