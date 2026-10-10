#![cfg(windows)]
//! In-process write failures after a generation directory is published but
//! before CURRENT selects it. The writer still holds the lock and re-reads
//! CURRENT, so it knows the directory was never selected; such a failure must
//! stay retryable rather than leave an orphan that blocks every later commit.

use enouia_activity_contract::{normalize_batch, public_data_bytes, sha256_hex};
use enouia_activity_store::generation::GenerationImage;
use enouia_activity_store::reader::read_current;
use enouia_activity_store::recovery::{RecoveryError, audit_generations};
use enouia_activity_store::run_start::{RunDecision, decide_run_start};
use enouia_activity_store::writer::{
    CommitError, CommitPhase, PublicationEvidence, commit, commit_publication_observed,
    commit_with_hook,
};
use enouia_activity_store::{ActivityLockGuard, WindowsActivityLock};
use enouia_common::{FakeClock, LockProvider};
use serde_json::{Value, json};
use std::cell::RefCell;
use std::collections::BTreeMap;
use std::fs::{self, File, OpenOptions};
use std::os::windows::fs::OpenOptionsExt;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const ORACLE: &str = include_str!("../../../tests/fixtures/activity/moriium-oracle-input.json");
const FILE_SHARE_READ: u32 = 0x0000_0001;

fn clock() -> FakeClock {
    FakeClock::new(1_790_409_601_000)
}

fn root() -> PathBuf {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let root =
        std::env::temp_dir().join(format!("enouia-late-switch-{}-{nonce}", std::process::id()));
    fs::create_dir(&root).unwrap();
    root
}

fn clean(root: &Path) {
    assert!(root.starts_with(std::env::temp_dir()));
    assert!(
        root.file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with("enouia-late-switch-")
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

/// A reader that shares read access but not delete makes MoveFileExW refuse
/// to replace CURRENT, as an indexer or scanner briefly holding it would.
fn hold_current(root: &Path) -> File {
    OpenOptions::new()
        .read(true)
        .share_mode(FILE_SHARE_READ)
        .open(root.join("CURRENT"))
        .unwrap()
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
fn refused_switch_of_new_batch_keeps_the_sequence_retryable() {
    let root = root();
    let guard = seed(&root);
    let pending = pending_image();
    let held = hold_current(&root);
    assert_eq!(
        commit(&guard, "g-0-seed", "g-1-refused", &pending, &clock()).unwrap_err(),
        CommitError::SwitchFailed
    );
    drop(held);
    assert!(matches!(
        decide_run_start(&guard, &clock()).unwrap(),
        RunDecision::Collect {
            next_sequence: 1,
            ..
        }
    ));
    assert_eq!(fs::read(root.join("CURRENT")).unwrap(), b"g-0-seed\n");
    assert!(!root.join("generations/g-1-refused").exists());
    let retracted = root.join("generations/.staging-g-1-refused");
    assert_eq!(
        fs::read(retracted.join("pending.json")).unwrap(),
        pending.pending.clone().unwrap()
    );

    let audit = audit_generations(&root, &clock()).unwrap();
    assert_eq!(audit.current.id, "g-0-seed");
    assert_eq!(audit.older_generations, 0);
    assert_eq!(audit.staging_directories, 1);
    commit(&guard, "g-0-seed", "g-1-retried", &pending, &clock()).unwrap();
    let selected = read_current(&root, &clock()).unwrap();
    assert_eq!(selected.id, "g-1-retried");
    assert_eq!(selected.validated.highest_reserved, 1);
    assert_eq!(selected.image.pending, pending.pending);
    drop(guard);
    clean(&root);
}

#[test]
fn refused_pointer_preparation_of_new_batch_keeps_the_sequence_retryable() {
    let root = root();
    let guard = seed(&root);
    let pending = pending_image();
    // An entry already occupying the temporary pointer name refuses its creation.
    fs::create_dir(root.join("CURRENT.g-1-blocked.tmp")).unwrap();
    assert_eq!(
        commit(&guard, "g-0-seed", "g-1-blocked", &pending, &clock()).unwrap_err(),
        CommitError::Io
    );
    assert!(matches!(
        decide_run_start(&guard, &clock()).unwrap(),
        RunDecision::Collect {
            next_sequence: 1,
            ..
        }
    ));
    assert_eq!(fs::read(root.join("CURRENT")).unwrap(), b"g-0-seed\n");
    assert!(!root.join("generations/g-1-blocked").exists());
    assert!(root.join("generations/.staging-g-1-blocked").is_dir());
    commit(&guard, "g-0-seed", "g-1-after", &pending, &clock()).unwrap();
    assert_eq!(read_current(&root, &clock()).unwrap().id, "g-1-after");
    drop(guard);
    clean(&root);
}

#[test]
fn refused_switch_of_receipt_keeps_the_acknowledgment_retryable() {
    let root = root();
    let guard = seed(&root);
    let pending = pending_image();
    commit(&guard, "g-0-seed", "g-1-pending", &pending, &clock()).unwrap();
    let selected = read_current(&root, &clock()).unwrap();
    let evidence = evidence(&selected.image);
    let held = hold_current(&root);
    assert_eq!(
        commit_publication_observed(
            &guard,
            "g-1-pending",
            "g-1-ack-refused",
            &evidence,
            &clock()
        )
        .unwrap_err(),
        CommitError::SwitchFailed
    );
    drop(held);
    assert!(matches!(
        decide_run_start(&guard, &clock()).unwrap(),
        RunDecision::RetryPending { sequence: 1, .. }
    ));
    assert!(!root.join("generations/g-1-ack-refused").exists());
    commit_publication_observed(&guard, "g-1-pending", "g-1-ack", &evidence, &clock()).unwrap();
    let acknowledged = read_current(&root, &clock()).unwrap();
    assert_eq!(acknowledged.id, "g-1-ack");
    assert_eq!(acknowledged.image.pending, None);
    drop(guard);
    clean(&root);
}

#[test]
fn retraction_changes_only_the_failed_generation_name() {
    let root = root();
    let guard = seed(&root);
    let before = tree(&root);
    let held = hold_current(&root);
    commit(&guard, "g-0-seed", "g-1-named", &pending_image(), &clock()).unwrap_err();
    drop(held);
    let after = tree(&root);
    for (path, hash) in &before {
        assert_eq!(after.get(path), Some(hash), "{path} changed");
    }
    let added: Vec<&String> = after
        .keys()
        .filter(|path| !before.contains_key(*path))
        .collect();
    assert!(added.iter().all(|path| {
        path.starts_with("generations/.staging-g-1-named/") || *path == "CURRENT.g-1-named.tmp"
    }));
    assert_eq!(
        fs::read(root.join("CURRENT.g-1-named.tmp")).unwrap(),
        b"g-1-named\n"
    );
    drop(guard);
    clean(&root);
}

#[test]
fn simulated_interruption_after_publication_still_leaves_the_conservative_orphan() {
    // Hook errors stand in for process death, which cannot run cleanup. The
    // hard-kill rehearsal's blocking expectation therefore stays unchanged.
    for stop in [
        CommitPhase::GenerationPublished,
        CommitPhase::CurrentPrepared,
    ] {
        let root = root();
        let guard = seed(&root);
        let next_id = format!("g-1-hook-{}", stop == CommitPhase::CurrentPrepared);
        assert_eq!(
            commit_with_hook(
                &guard,
                "g-0-seed",
                &next_id,
                &pending_image(),
                &clock(),
                |phase| { if phase == stop { Err(()) } else { Ok(()) } }
            )
            .unwrap_err(),
            CommitError::InterruptedBeforeSwitch
        );
        assert!(root.join("generations").join(&next_id).is_dir());
        assert!(audit_generations(&root, &clock()).is_err());
        drop(guard);
        clean(&root);
    }
}

#[test]
fn refused_retraction_keeps_the_conservative_orphan() {
    // A handle inside the new directory makes its rename back fail as well.
    // The writer must then leave the published orphan for reconciliation.
    let root = root();
    let guard = seed(&root);
    let holds = RefCell::new(Vec::new());
    let error = commit_with_hook(
        &guard,
        "g-0-seed",
        "g-1-pinned",
        &pending_image(),
        &clock(),
        |phase| {
            if phase == CommitPhase::CurrentPrepared {
                holds.borrow_mut().push(hold_current(&root));
                holds
                    .borrow_mut()
                    .push(File::open(root.join("generations/g-1-pinned/activity.json")).unwrap());
            }
            Ok(())
        },
    )
    .unwrap_err();
    assert_eq!(error, CommitError::SwitchFailed);
    drop(holds);
    assert_eq!(fs::read(root.join("CURRENT")).unwrap(), b"g-0-seed\n");
    assert!(root.join("generations/g-1-pinned").is_dir());
    assert!(!root.join("generations/.staging-g-1-pinned").exists());
    assert_eq!(
        audit_generations(&root, &clock()).err().unwrap(),
        RecoveryError::HigherReservedSequence
    );
    drop(guard);
    clean(&root);
}
