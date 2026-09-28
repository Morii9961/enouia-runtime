#![cfg(windows)]

use enouia_activity_contract::{
    Batch, exact_activity_timestamp_ms, normalize_batch, public_data_bytes, sha256_hex,
};
use enouia_activity_delivery::observation::ObservationError;
use enouia_activity_delivery::public_fetch::{
    FetchError, FetchedResponse, PublicFetcher, PublicObservationError, observe_pending_locked,
};
use enouia_activity_store::WindowsActivityLock;
use enouia_activity_store::generation::GenerationImage;
use enouia_common::{Cancellation, FakeClock, LockProvider};
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
