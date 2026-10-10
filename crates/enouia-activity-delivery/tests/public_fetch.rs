#![cfg(windows)]

use enouia_activity_contract::{
    Batch, exact_activity_timestamp_ms, normalize_batch, public_data_bytes, sha256_hex,
};
use enouia_activity_delivery::acknowledgment::{
    AcknowledgmentError, observe_and_acknowledge_locked,
};
use enouia_activity_delivery::observation::ObservationError;
use enouia_activity_delivery::public_fetch::{
    FetchError, FetchedResponse, PublicFetcher, PublicObservationError, observe_pending_locked,
};
use enouia_activity_store::WindowsActivityLock;
use enouia_activity_store::generation::GenerationImage;
use enouia_activity_store::pause::set_paused_locked;
use enouia_activity_store::reader::read_current;
use enouia_activity_store::recovery::RecoveryError;
use enouia_activity_store::retry::record_retry_failure_locked;
use enouia_activity_store::run_start::{RunDecision, RunStartError, decide_run_start};
use enouia_activity_store::writer::{
    CommitError, CommitPhase, PublicationEvidence, commit, commit_publication_observed,
    commit_publication_observed_with_hook,
};
use enouia_common::{Cancellation, Clock, ErrorCode, FakeClock, LockProvider};
use serde_json::{Value, json};
use std::cell::RefCell;
use std::collections::VecDeque;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const ORACLE: &str = include_str!("../../../tests/fixtures/activity/moriium-oracle-input.json");
const ORIGIN: &str = "https://public.example";

fn clock() -> FakeClock {
    FakeClock::new(exact_activity_timestamp_ms("2026-09-26T08:10:00.000Z").unwrap())
}

fn root() -> PathBuf {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let root = std::env::temp_dir().join(format!(
        "enouia-public-fetch-{}-{nonce}",
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
            .starts_with("enouia-public-fetch-")
    );
    fs::remove_dir_all(root).unwrap();
}

fn seed(root: &Path) -> (Batch, Vec<u8>) {
    let raw: Value = serde_json::from_str(ORACLE).unwrap();
    let batch = normalize_batch(&raw, &clock()).unwrap();
    let mut pending = serde_json::to_vec(&batch).unwrap();
    pending.push(b'\n');
    let image = GenerationImage {
        activity: public_data_bytes(&batch.data).unwrap(),
        sequence: b"{\"sequence\":42}\n".to_vec(),
        pending: Some(pending.clone()),
        delivery: b"{}\n".to_vec(),
    };
    let path = root.join("generations/g-42-seed");
    fs::create_dir_all(&path).unwrap();
    fs::write(path.join("activity.json"), &image.activity).unwrap();
    fs::write(path.join("sequence.json"), &image.sequence).unwrap();
    fs::write(path.join("pending.json"), &pending).unwrap();
    fs::write(path.join("delivery.json"), &image.delivery).unwrap();
    fs::write(
        path.join("manifest.json"),
        image.manifest_bytes("g-42-seed", &clock()).unwrap(),
    )
    .unwrap();
    fs::write(root.join("CURRENT"), b"g-42-seed\n").unwrap();
    (batch, pending)
}

fn manifest(batch: &Batch, hash: &str) -> Vec<u8> {
    let mut bytes = serde_json::to_vec(&json!({
        "version": 1,
        "generatedAt": "2026-09-26T08:05:00.000Z",
        "validUntil": "2026-09-26T08:20:00.000Z",
        "activity": {
            "hash": hash,
            "url": format!("/status-data/activity/{hash}.json"),
            "publishedAt": "2026-09-26T08:04:00.000Z",
            "receivedAt": "2026-09-26T08:03:00.000Z",
            "sources": batch.sources,
        }
    }))
    .unwrap();
    bytes.push(b'\n');
    bytes
}

struct NeverCancelled;

impl Cancellation for NeverCancelled {
    fn is_cancelled(&self) -> bool {
        false
    }
}

struct FakeFetcher {
    responses: RefCell<VecDeque<Result<FetchedResponse, FetchError>>>,
    calls: RefCell<Vec<String>>,
}

impl FakeFetcher {
    fn new(responses: Vec<Result<FetchedResponse, FetchError>>) -> Self {
        Self {
            responses: RefCell::new(responses.into()),
            calls: RefCell::new(Vec::new()),
        }
    }
}

impl PublicFetcher for FakeFetcher {
    fn fetch(
        &self,
        url: &str,
        max_bytes: usize,
        timeout: Duration,
        _: &dyn Cancellation,
    ) -> Result<FetchedResponse, FetchError> {
        let index = self.calls.borrow().len();
        assert_eq!(timeout, Duration::from_secs(15));
        assert_eq!(
            max_bytes,
            if index == 0 {
                1024 * 1024
            } else {
                4 * 1024 * 1024
            }
        );
        self.calls.borrow_mut().push(url.to_owned());
        self.responses.borrow_mut().pop_front().unwrap()
    }
}

fn response(url: &str, body: Vec<u8>) -> FetchedResponse {
    FetchedResponse {
        status: 200,
        final_url: url.to_owned(),
        redirected: false,
        body,
    }
}

fn valid_fetcher(batch: &Batch) -> FakeFetcher {
    let activity = public_data_bytes(&batch.data).unwrap();
    let hash = sha256_hex(&activity);
    FakeFetcher::new(vec![
        Ok(response(
            &format!("{ORIGIN}/status-data/current.json"),
            manifest(batch, &hash),
        )),
        Ok(response(
            &format!("{ORIGIN}/status-data/activity/{hash}.json"),
            activity,
        )),
    ])
}

#[test]
fn observes_only_exact_same_origin_public_bytes_and_leaves_pending() {
    let root = root();
    let (batch, pending) = seed(&root);
    let guard = WindowsActivityLock
        .try_acquire(&root.join("sync.lock"))
        .unwrap();
    let fetcher = valid_fetcher(&batch);
    let evidence =
        observe_pending_locked(&guard, &clock(), ORIGIN, &fetcher, &NeverCancelled).unwrap();
    let hash = sha256_hex(&public_data_bytes(&batch.data).unwrap());
    assert_eq!(evidence.sequence, 42);
    assert_eq!(evidence.exact_pending_sha256, sha256_hex(&pending));
    assert_eq!(evidence.content.activity_sha256, hash);
    assert_eq!(fetcher.calls.borrow().len(), 2);
    assert_eq!(
        fs::read(root.join("generations/g-42-seed/pending.json")).unwrap(),
        pending
    );
    drop(guard);
    clean(&root);
}

#[test]
fn invalid_origin_or_redirect_cannot_observe_publication() {
    let root = root();
    let (batch, _) = seed(&root);
    let guard = WindowsActivityLock
        .try_acquire(&root.join("sync.lock"))
        .unwrap();
    for origin in [
        "http://public.example",
        "https://public.example/path",
        "https://user@public.example",
        "https://public.example?next=evil",
        "https://a.-b.example",
    ] {
        let fetcher = valid_fetcher(&batch);
        assert_eq!(
            observe_pending_locked(&guard, &clock(), origin, &fetcher, &NeverCancelled)
                .unwrap_err(),
            PublicObservationError::InvalidOrigin
        );
        assert!(fetcher.calls.borrow().is_empty());
    }
    let mut redirected = response(
        &format!("{ORIGIN}/status-data/current.json"),
        manifest(
            &batch,
            &sha256_hex(&public_data_bytes(&batch.data).unwrap()),
        ),
    );
    redirected.redirected = true;
    let fetcher = FakeFetcher::new(vec![Ok(redirected)]);
    assert_eq!(
        observe_pending_locked(&guard, &clock(), ORIGIN, &fetcher, &NeverCancelled).unwrap_err(),
        PublicObservationError::Redirected
    );
    assert_eq!(fetcher.calls.borrow().len(), 1);
    drop(guard);
    clean(&root);
}

#[test]
fn pause_prevents_public_fetch_and_keeps_pending() {
    let root = root();
    let (batch, pending) = seed(&root);
    let guard = WindowsActivityLock
        .try_acquire(&root.join("sync.lock"))
        .unwrap();
    set_paused_locked(&guard, &clock(), "g-42-paused", true).unwrap();
    let fetcher = valid_fetcher(&batch);
    assert_eq!(
        observe_pending_locked(&guard, &clock(), ORIGIN, &fetcher, &NeverCancelled).unwrap_err(),
        PublicObservationError::Paused
    );
    assert!(fetcher.calls.borrow().is_empty());
    assert_eq!(
        read_current(&root, &clock()).unwrap().image.pending,
        Some(pending)
    );
    drop(guard);
    clean(&root);
}

#[test]
fn wrong_final_url_status_and_oversize_are_rejected() {
    let root = root();
    let (batch, _) = seed(&root);
    let guard = WindowsActivityLock
        .try_acquire(&root.join("sync.lock"))
        .unwrap();
    let mut wrong = response("https://elsewhere.example/status-data/current.json", vec![]);
    let fetcher = FakeFetcher::new(vec![Ok(wrong)]);
    assert_eq!(
        observe_pending_locked(&guard, &clock(), ORIGIN, &fetcher, &NeverCancelled).unwrap_err(),
        PublicObservationError::WrongUrl
    );
    wrong = response(&format!("{ORIGIN}/status-data/current.json"), vec![]);
    wrong.status = 404;
    let fetcher = FakeFetcher::new(vec![Ok(wrong)]);
    assert_eq!(
        observe_pending_locked(&guard, &clock(), ORIGIN, &fetcher, &NeverCancelled).unwrap_err(),
        PublicObservationError::UnexpectedStatus(404)
    );
    let fetcher = FakeFetcher::new(vec![Ok(response(
        &format!("{ORIGIN}/status-data/current.json"),
        vec![b'x'; 1024 * 1024 + 1],
    ))]);
    assert_eq!(
        observe_pending_locked(&guard, &clock(), ORIGIN, &fetcher, &NeverCancelled).unwrap_err(),
        PublicObservationError::ResponseTooLarge
    );
    let fetcher = FakeFetcher::new(vec![Err(FetchError::Timeout)]);
    assert_eq!(
        observe_pending_locked(&guard, &clock(), ORIGIN, &fetcher, &NeverCancelled).unwrap_err(),
        PublicObservationError::Fetch(FetchError::Timeout)
    );
    let activity = public_data_bytes(&batch.data).unwrap();
    let hash = sha256_hex(&activity);
    let fetcher = FakeFetcher::new(vec![
        Ok(response(
            &format!("{ORIGIN}/status-data/current.json"),
            manifest(&batch, &hash),
        )),
        Ok(response(
            &format!("{ORIGIN}/status-data/activity/{hash}.json"),
            vec![b'x'; 4 * 1024 * 1024 + 1],
        )),
    ]);
    assert_eq!(
        observe_pending_locked(&guard, &clock(), ORIGIN, &fetcher, &NeverCancelled).unwrap_err(),
        PublicObservationError::ResponseTooLarge
    );
    drop(guard);
    clean(&root);
}

#[test]
fn content_mismatch_after_valid_fetch_provenance_still_blocks() {
    let root = root();
    let (batch, _) = seed(&root);
    let guard = WindowsActivityLock
        .try_acquire(&root.join("sync.lock"))
        .unwrap();
    let activity = public_data_bytes(&batch.data).unwrap();
    let hash = sha256_hex(&activity);
    let mut stale = serde_json::from_slice::<Value>(&manifest(&batch, &hash)).unwrap();
    stale["validUntil"] = json!("2026-09-26T08:09:00.000Z");
    let fetcher = FakeFetcher::new(vec![
        Ok(response(
            &format!("{ORIGIN}/status-data/current.json"),
            serde_json::to_vec(&stale).unwrap(),
        )),
        Ok(response(
            &format!("{ORIGIN}/status-data/activity/{hash}.json"),
            activity,
        )),
    ]);
    assert_eq!(
        observe_pending_locked(&guard, &clock(), ORIGIN, &fetcher, &NeverCancelled).unwrap_err(),
        PublicObservationError::Content(ObservationError::StaleManifest)
    );
    drop(guard);
    clean(&root);
}

#[test]
fn matching_publication_is_recorded_with_pending_clear_in_one_generation() {
    let root = root();
    let (batch, pending) = seed(&root);
    let guard = WindowsActivityLock
        .try_acquire(&root.join("sync.lock"))
        .unwrap();
    let wrong_evidence = PublicationEvidence {
        origin: ORIGIN.to_owned(),
        sequence: 42,
        exact_pending_sha256: "0".repeat(64),
        manifest_sha256: "a".repeat(64),
        activity_sha256: sha256_hex(&public_data_bytes(&batch.data).unwrap()),
        generated_at_ms: clock().now_unix_ms(),
        published_at_ms: clock().now_unix_ms(),
        received_at_ms: clock().now_unix_ms(),
    };
    assert_eq!(
        commit_publication_observed(
            &guard,
            "g-42-seed",
            "g-42-forged",
            &wrong_evidence,
            &clock(),
        ),
        Err(CommitError::InvalidEvidence)
    );
    observe_and_acknowledge_locked(
        &guard,
        &clock(),
        ORIGIN,
        &valid_fetcher(&batch),
        "g-42-observed",
        &NeverCancelled,
    )
    .unwrap();
    let selected = read_current(&root, &clock()).unwrap();
    assert_eq!(selected.id, "g-42-observed");
    assert!(selected.image.pending.is_none());
    assert_eq!(selected.validated.highest_reserved, 42);
    assert_eq!(selected.validated.archive, batch.data);
    let delivery: Value = serde_json::from_slice(&selected.image.delivery).unwrap();
    assert_eq!(delivery["publicationObserved"]["sequence"], 42);
    assert_eq!(delivery["publicationObserved"]["origin"], ORIGIN);
    let erased_receipt = GenerationImage {
        activity: selected.image.activity.clone(),
        sequence: selected.image.sequence.clone(),
        pending: None,
        delivery: b"{}\n".to_vec(),
    };
    assert_eq!(
        commit(
            &guard,
            "g-42-observed",
            "g-42-erased",
            &erased_receipt,
            &clock(),
        ),
        Err(CommitError::InvalidTransition)
    );
    assert_eq!(
        delivery["publicationObserved"]["exactPendingSha256"],
        sha256_hex(&pending)
    );
    assert_eq!(
        fs::read(root.join("generations/g-42-seed/pending.json")).unwrap(),
        pending
    );
    assert!(matches!(
        decide_run_start(&guard, &clock()).unwrap(),
        RunDecision::Collect {
            next_sequence: 43,
            ..
        }
    ));
    drop(guard);
    clean(&root);
}

#[test]
fn stale_publication_does_not_clear_pending() {
    let root = root();
    let (batch, pending) = seed(&root);
    let guard = WindowsActivityLock
        .try_acquire(&root.join("sync.lock"))
        .unwrap();
    let activity = public_data_bytes(&batch.data).unwrap();
    let hash = sha256_hex(&activity);
    let mut stale = serde_json::from_slice::<Value>(&manifest(&batch, &hash)).unwrap();
    stale["validUntil"] = json!("2026-09-26T08:09:00.000Z");
    let fetcher = FakeFetcher::new(vec![
        Ok(response(
            &format!("{ORIGIN}/status-data/current.json"),
            serde_json::to_vec(&stale).unwrap(),
        )),
        Ok(response(
            &format!("{ORIGIN}/status-data/activity/{hash}.json"),
            activity,
        )),
    ]);
    assert_eq!(
        observe_and_acknowledge_locked(
            &guard,
            &clock(),
            ORIGIN,
            &fetcher,
            "g-42-observed",
            &NeverCancelled,
        )
        .unwrap_err(),
        AcknowledgmentError::Observation(PublicObservationError::Content(
            ObservationError::StaleManifest
        ))
    );
    let selected = read_current(&root, &clock()).unwrap();
    assert_eq!(selected.id, "g-42-seed");
    assert_eq!(selected.image.pending.unwrap(), pending);
    drop(guard);
    clean(&root);
}

#[test]
fn publication_acknowledgment_clears_stale_retry_state() {
    let root = root();
    let (batch, pending) = seed(&root);
    let guard = WindowsActivityLock
        .try_acquire(&root.join("sync.lock"))
        .unwrap();
    record_retry_failure_locked(
        &guard,
        &clock(),
        "g-42-retry",
        ErrorCode::DeliveryUnverified,
        clock().now_unix_ms() + 60_000,
        true,
    )
    .unwrap();
    observe_and_acknowledge_locked(
        &guard,
        &clock(),
        ORIGIN,
        &valid_fetcher(&batch),
        "g-42-observed",
        &NeverCancelled,
    )
    .unwrap();
    let selected = read_current(&root, &clock()).unwrap();
    let delivery: Value = serde_json::from_slice(&selected.image.delivery).unwrap();
    assert!(delivery.get("retry").is_none());
    assert!(selected.image.pending.is_none());
    assert_eq!(
        fs::read(root.join("generations/g-42-retry/pending.json")).unwrap(),
        pending
    );
    drop(guard);
    clean(&root);
}

#[test]
fn acknowledgment_interruption_selects_only_complete_old_or_new_generation() {
    for (phase, expected_error, expected_id) in [
        (
            CommitPhase::FileFlushed("manifest.json"),
            CommitError::InterruptedBeforeSwitch,
            "g-42-seed",
        ),
        (
            CommitPhase::CurrentPrepared,
            CommitError::InterruptedBeforeSwitch,
            "g-42-seed",
        ),
        (
            CommitPhase::CurrentSwitched,
            CommitError::InterruptedAfterSwitch,
            "g-42-observed",
        ),
    ] {
        let root = root();
        let (batch, pending) = seed(&root);
        let guard = WindowsActivityLock
            .try_acquire(&root.join("sync.lock"))
            .unwrap();
        let observed = observe_pending_locked(
            &guard,
            &clock(),
            ORIGIN,
            &valid_fetcher(&batch),
            &NeverCancelled,
        )
        .unwrap();
        let evidence = PublicationEvidence {
            origin: ORIGIN.to_owned(),
            sequence: observed.sequence,
            exact_pending_sha256: observed.exact_pending_sha256,
            manifest_sha256: observed.content.manifest_sha256,
            activity_sha256: observed.content.activity_sha256,
            generated_at_ms: observed.content.generated_at_ms,
            published_at_ms: observed.content.published_at_ms,
            received_at_ms: observed.content.received_at_ms,
        };
        assert_eq!(
            commit_publication_observed_with_hook(
                &guard,
                "g-42-seed",
                "g-42-observed",
                &evidence,
                &clock(),
                |at| if at == phase { Err(()) } else { Ok(()) },
            ),
            Err(expected_error)
        );
        let selected = read_current(&root, &clock()).unwrap();
        assert_eq!(selected.id, expected_id);
        assert_eq!(selected.validated.highest_reserved, 42);
        assert_eq!(selected.validated.archive, batch.data);
        if phase != CommitPhase::CurrentSwitched {
            assert_eq!(selected.image.pending.unwrap(), pending);
            if phase == CommitPhase::CurrentPrepared {
                assert!(matches!(
                    decide_run_start(&guard, &clock()),
                    Err(RunStartError::Recovery(
                        RecoveryError::ConflictingGeneration
                    ))
                ));
            } else {
                assert!(matches!(
                    decide_run_start(&guard, &clock()).unwrap(),
                    RunDecision::RetryPending { sequence: 42, .. }
                ));
            }
        } else {
            assert!(selected.image.pending.is_none());
            assert!(matches!(
                decide_run_start(&guard, &clock()).unwrap(),
                RunDecision::Collect {
                    next_sequence: 43,
                    ..
                }
            ));
        }
        drop(guard);
        clean(&root);
    }
}

#[test]
fn acknowledgment_keeps_last_outcomes_for_lock_free_status_readers() {
    use enouia_activity_store::overview::read_activity_status;
    let root = root();
    let (batch, _) = seed(&root);
    let before = read_activity_status(&root, &clock()).unwrap();
    assert_eq!(before.pending.as_ref().unwrap().batch, batch);
    assert!(before.publication.is_none() && before.last_outcomes.is_none());
    let guard = WindowsActivityLock
        .try_acquire(&root.join("sync.lock"))
        .unwrap();
    observe_and_acknowledge_locked(
        &guard,
        &clock(),
        ORIGIN,
        &valid_fetcher(&batch),
        "g-42-observed",
        &NeverCancelled,
    )
    .unwrap();
    // A status read needs no lock, even while a writer holds it.
    let status = read_activity_status(&root, &clock()).unwrap();
    assert!(status.pending.is_none());
    let receipt = status.publication.unwrap();
    assert_eq!(receipt.sequence, 42);
    assert_eq!(
        receipt.activity_sha256,
        sha256_hex(&public_data_bytes(&batch.data).unwrap())
    );
    let last = status.last_outcomes.unwrap();
    assert_eq!(last.sequence, 42);
    assert_eq!(last.observed_at_ms, clock().now_unix_ms());
    assert_eq!(
        serde_json::to_value(&last.sources).unwrap(),
        serde_json::to_value(&batch.sources).unwrap()
    );
    set_paused_locked(&guard, &clock(), "g-42-paused", true).unwrap();
    assert_eq!(
        read_activity_status(&root, &clock()).unwrap().last_outcomes,
        Some(last)
    );
    let selected = read_current(&root, &clock()).unwrap();
    let mut delivery: Value = serde_json::from_slice(&selected.image.delivery).unwrap();
    delivery.as_object_mut().unwrap().remove("lastOutcomes");
    let erased = GenerationImage {
        activity: selected.image.activity.clone(),
        sequence: selected.image.sequence.clone(),
        pending: None,
        delivery: format!("{delivery}\n").into_bytes(),
    };
    assert_eq!(
        commit(&guard, "g-42-paused", "g-42-erased", &erased, &clock()),
        Err(CommitError::InvalidTransition)
    );
    let mut forged: Value = serde_json::from_slice(&selected.image.delivery).unwrap();
    forged["lastOutcomes"]["sequence"] = json!(43);
    let forged = GenerationImage {
        delivery: format!("{forged}\n").into_bytes(),
        ..erased
    };
    assert!(forged.manifest_bytes("g-42-forged", &clock()).is_err());
    drop(guard);
    clean(&root);
}
