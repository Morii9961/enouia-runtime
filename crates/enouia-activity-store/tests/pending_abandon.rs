#![cfg(windows)]
//! Operator abandonment of a refused pending batch (ADR-033). The sequence
//! stays consumed, the archive is kept, and only an exact, paused, confirmed
//! request may clear the batch without publication.

use enouia_activity_contract::{normalize_batch, public_data_bytes, sha256_hex};
use enouia_activity_store::generation::{GenerationError, GenerationImage};
use enouia_activity_store::pause::set_paused_locked;
use enouia_activity_store::reader::read_current;
use enouia_activity_store::recovery::audit_generations;
use enouia_activity_store::run_start::{RunDecision, decide_run_start};
use enouia_activity_store::writer::{
    AbandonEvidence, CommitError, PublicationEvidence, commit, commit_pending_abandoned,
    commit_publication_observed,
};
use enouia_activity_store::{ActivityLockGuard, WindowsActivityLock};
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
        "enouia-pending-abandon-{}-{nonce}",
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
            .starts_with("enouia-pending-abandon-")
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

fn pause(guard: &ActivityLockGuard, id: &str, paused: bool) {
    set_paused_locked(guard, &clock(), id, paused).unwrap();
}

fn evidence(sequence: u64, bytes: &[u8], reserved_through: u64) -> AbandonEvidence {
    AbandonEvidence {
        sequence,
        exact_pending_sha256: sha256_hex(bytes),
        reserved_through,
    }
}

fn delivery(root: &Path) -> Value {
    serde_json::from_slice(&read_current(root, &clock()).unwrap().image.delivery).unwrap()
}

#[test]
fn abandonment_needs_a_paused_exact_request_and_keeps_the_sequence_consumed() {
    let root = root();
    let guard = seed(&root);
    let image = pending_image(1);
    let bytes = image.pending.clone().unwrap();
    commit(&guard, "g-0-seed", "g-1-pending", &image, &clock()).unwrap();

    let refuse = |id: &str, evidence: AbandonEvidence| {
        commit_pending_abandoned(&guard, id, "g-1-abandoned", &evidence, &clock()).unwrap_err()
    };
    assert_eq!(
        refuse("g-1-pending", evidence(1, &bytes, 1)),
        CommitError::NotPaused
    );
    pause(&guard, "g-1-paused", true);
    assert_eq!(
        refuse("g-1-pending", evidence(1, &bytes, 1)),
        CommitError::StaleGeneration
    );
    assert_eq!(
        refuse("g-1-paused", evidence(1, b"other bytes", 1)),
        CommitError::InvalidEvidence
    );
    assert_eq!(
        refuse("g-1-paused", evidence(2, &bytes, 2)),
        CommitError::InvalidEvidence
    );
    assert_eq!(
        refuse("g-1-paused", evidence(1, &bytes, 0)),
        CommitError::InvalidEvidence
    );
    assert_eq!(read_current(&root, &clock()).unwrap().id, "g-1-paused");

    commit_pending_abandoned(
        &guard,
        "g-1-paused",
        "g-1-abandoned",
        &evidence(1, &bytes, 1),
        &clock(),
    )
    .unwrap();
    let current = read_current(&root, &clock()).unwrap();
    assert_eq!(current.id, "g-1-abandoned");
    assert_eq!(current.image.pending, None);
    assert_eq!(current.validated.highest_reserved, 1);
    assert_eq!(current.image.activity, image.activity);
    let record = &delivery(&root)["pendingAbandoned"];
    assert_eq!(record["sequence"], 1);
    assert_eq!(record["exactPendingSha256"], sha256_hex(&bytes).as_str());
    assert_eq!(
        record["activitySha256"],
        sha256_hex(&image.activity).as_str()
    );
    assert_eq!(record["reservedThrough"], 1);
    assert_eq!(record["abandonedAtMs"], 1_790_409_601_000_i64);
    assert_eq!(record["reason"], "operator_confirmed_refused");
    assert_eq!(delivery(&root)["paused"], true);
    assert!(delivery(&root).get("retry").is_none());

    // The older generation still holding the bytes is accepted by the audit.
    let audit = audit_generations(&root, &clock()).unwrap();
    assert_eq!(audit.older_generations, 3);
    assert!(matches!(
        decide_run_start(&guard, &clock()).unwrap(),
        RunDecision::Paused {
            pending_sequence: None,
            ..
        }
    ));
    pause(&guard, "g-1-resumed", false);
    assert!(matches!(
        decide_run_start(&guard, &clock()).unwrap(),
        RunDecision::Collect {
            next_sequence: 2,
            ..
        }
    ));
    // The abandoned sequence cannot be reserved again.
    assert_eq!(
        commit(
            &guard,
            "g-1-resumed",
            "g-1-again",
            &pending_image(1),
            &clock()
        )
        .unwrap_err(),
        CommitError::InvalidTransition
    );
    commit(
        &guard,
        "g-1-resumed",
        "g-2-pending",
        &pending_image(2),
        &clock(),
    )
    .unwrap();
    assert_eq!(
        read_current(&root, &clock())
            .unwrap()
            .validated
            .highest_reserved,
        2
    );
    drop(guard);
    clean(&root);
}

#[test]
fn reserve_through_moves_the_next_sequence_above_a_remote_high_water() {
    let root = root();
    let guard = seed(&root);
    let image = pending_image(1);
    let bytes = image.pending.clone().unwrap();
    commit(&guard, "g-0-seed", "g-1-pending", &image, &clock()).unwrap();
    pause(&guard, "g-1-paused", true);
    commit_pending_abandoned(
        &guard,
        "g-1-paused",
        "g-7-abandoned",
        &evidence(1, &bytes, 7),
        &clock(),
    )
    .unwrap();
    let current = read_current(&root, &clock()).unwrap();
    assert_eq!(current.validated.highest_reserved, 7);
    assert_eq!(delivery(&root)["pendingAbandoned"]["reservedThrough"], 7);
    pause(&guard, "g-7-resumed", false);
    assert!(matches!(
        decide_run_start(&guard, &clock()).unwrap(),
        RunDecision::Collect {
            next_sequence: 8,
            ..
        }
    ));
    commit(
        &guard,
        "g-7-resumed",
        "g-8-pending",
        &pending_image(8),
        &clock(),
    )
    .unwrap();
    drop(guard);
    clean(&root);
}

#[test]
fn later_commits_must_keep_the_record_and_publication_receipt() {
    let root = root();
    let guard = seed(&root);
    let image = pending_image(1);
    let bytes = image.pending.clone().unwrap();
    commit(&guard, "g-0-seed", "g-1-pending", &image, &clock()).unwrap();
    let observed = PublicationEvidence {
        origin: "http://127.0.0.1".to_owned(),
        sequence: 1,
        exact_pending_sha256: sha256_hex(&bytes),
        manifest_sha256: "a".repeat(64),
        activity_sha256: sha256_hex(&image.activity),
        generated_at_ms: 1_790_409_601_000,
        published_at_ms: 1_790_409_601_000,
        received_at_ms: 1_790_409_601_000,
    };
    commit_publication_observed(&guard, "g-1-pending", "g-1-ack", &observed, &clock()).unwrap();
    let second = pending_image(2);
    let second_bytes = second.pending.clone().unwrap();
    let mut second_with_receipt = second;
    second_with_receipt.delivery = serde_json::to_vec(&delivery(&root)).unwrap();
    second_with_receipt.delivery.push(b'\n');
    commit(
        &guard,
        "g-1-ack",
        "g-2-pending",
        &second_with_receipt,
        &clock(),
    )
    .unwrap();
    pause(&guard, "g-2-paused", true);
    commit_pending_abandoned(
        &guard,
        "g-2-paused",
        "g-2-abandoned",
        &evidence(2, &second_bytes, 2),
        &clock(),
    )
    .unwrap();
    let kept = delivery(&root);
    assert_eq!(kept["publicationObserved"]["sequence"], 1);
    assert_eq!(kept["pendingAbandoned"]["sequence"], 2);

    // A same-sequence commit that drops the record is refused.
    let current = read_current(&root, &clock()).unwrap();
    let mut dropped = kept.clone();
    dropped.as_object_mut().unwrap().remove("pendingAbandoned");
    let mut bytes = serde_json::to_vec(&dropped).unwrap();
    bytes.push(b'\n');
    let image = GenerationImage {
        activity: current.image.activity.clone(),
        sequence: current.image.sequence.clone(),
        pending: None,
        delivery: bytes,
    };
    assert_eq!(
        commit(&guard, "g-2-abandoned", "g-2-dropped", &image, &clock()).unwrap_err(),
        CommitError::InvalidTransition
    );
    // Pausing and resuming keep it.
    pause(&guard, "g-2-resumed", false);
    assert_eq!(
        delivery(&root)["pendingAbandoned"],
        kept["pendingAbandoned"]
    );
    drop(guard);
    clean(&root);
}

#[test]
fn generation_validation_bounds_the_record() {
    let record = json!({
        "sequence": 2,
        "exactPendingSha256": "a".repeat(64),
        "activitySha256": "b".repeat(64),
        "reservedThrough": 2,
        "abandonedAtMs": 1,
        "reason": "operator_confirmed_refused"
    });
    let with = |change: &dyn Fn(&mut Value), pending: bool| {
        let mut value = record.clone();
        change(&mut value);
        let mut image = pending_image(3);
        if !pending {
            image.pending = None;
        }
        image.delivery = serde_json::to_vec(&json!({"pendingAbandoned": value})).unwrap();
        image.manifest_bytes("g-3-check", &clock())
    };
    assert!(with(&|_| {}, true).is_ok());
    assert!(with(&|_| {}, false).is_ok());
    for change in [
        &(|v: &mut Value| v["reason"] = json!("other")) as &dyn Fn(&mut Value),
        &|v| v["sequence"] = json!(0),
        &|v| v["sequence"] = json!(4),
        &|v| v["reservedThrough"] = json!(4),
        &|v| v["reservedThrough"] = json!(1),
        &|v| v["exactPendingSha256"] = json!("BAD"),
        &|v| v["abandonedAtMs"] = json!(-1),
        &|v| v["extra"] = json!(true),
    ] {
        assert_eq!(
            with(change, false).unwrap_err(),
            GenerationError::InvalidDelivery
        );
    }
    // A pending batch must come after everything the abandonment reserved.
    assert_eq!(
        with(&|v| v["reservedThrough"] = json!(3), true).unwrap_err(),
        GenerationError::InvalidDelivery
    );
}
