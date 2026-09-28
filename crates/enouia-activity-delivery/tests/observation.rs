use enouia_activity_contract::{
    Batch, exact_activity_timestamp_ms, normalize_batch, public_data_bytes, sha256_hex,
};
use enouia_activity_delivery::observation::{ObservationError, match_public_content};
use enouia_common::FakeClock;
use serde_json::{Value, json};

const ORACLE: &str = include_str!("../../../tests/fixtures/activity/moriium-oracle-input.json");
const NOW: &str = "2026-09-26T08:10:00.000Z";

fn candidate() -> Batch {
    let raw: Value = serde_json::from_str(ORACLE).unwrap();
    normalize_batch(&raw, &FakeClock::new(1_790_409_601_000)).unwrap()
}

fn manifest(batch: &Batch, activity_hash: &str) -> Value {
    json!({
        "version": 1,
        "generatedAt": "2026-09-26T08:05:00.000Z",
        "validUntil": "2026-09-26T08:20:00.000Z",
        "activity": {
            "hash": activity_hash,
            "url": format!("/status-data/activity/{activity_hash}.json"),
            "publishedAt": "2026-09-26T08:04:00.000Z",
            "receivedAt": "2026-09-26T08:03:00.000Z",
            "sources": batch.sources,
        }
    })
}

fn bytes(value: &Value) -> Vec<u8> {
    let mut bytes = serde_json::to_vec(value).unwrap();
    bytes.push(b'\n');
    bytes
}

fn now_ms() -> i64 {
    exact_activity_timestamp_ms(NOW).unwrap()
}

#[test]
fn exact_public_data_and_all_source_outcomes_match() {
    let batch = candidate();
    let activity_bytes = public_data_bytes(&batch.data).unwrap();
    let hash = sha256_hex(&activity_bytes);
    let manifest_bytes = bytes(&manifest(&batch, &hash));
    let evidence =
        match_public_content(&batch, &manifest_bytes, &activity_bytes, now_ms()).unwrap();
    assert_eq!(evidence.activity_sha256, hash);
    assert_eq!(evidence.manifest_sha256, sha256_hex(&manifest_bytes));
    assert_eq!(
        evidence.published_at_ms,
        exact_activity_timestamp_ms("2026-09-26T08:04:00.000Z").unwrap()
    );
}

#[test]
fn stale_or_future_manifest_cannot_confirm_content() {
    let batch = candidate();
    let activity_bytes = public_data_bytes(&batch.data).unwrap();
    let mut manifest = manifest(&batch, &sha256_hex(&activity_bytes));
    manifest["validUntil"] = json!("2026-09-26T08:09:59.000Z");
    assert_eq!(
        match_public_content(&batch, &bytes(&manifest), &activity_bytes, now_ms()).unwrap_err(),
        ObservationError::StaleManifest
    );
    manifest["generatedAt"] = json!("2026-09-26T08:30:00.000Z");
    manifest["validUntil"] = json!("2026-09-26T08:40:00.000Z");
    assert_eq!(
        match_public_content(&batch, &bytes(&manifest), &activity_bytes, now_ms()).unwrap_err(),
        ObservationError::StaleManifest
    );
}

#[test]
fn matching_data_hash_without_matching_attempt_outcomes_is_insufficient() {
    let batch = candidate();
    let activity_bytes = public_data_bytes(&batch.data).unwrap();
    let mut manifest = manifest(&batch, &sha256_hex(&activity_bytes));
    manifest["activity"]["sources"]["codex"]["attemptedAt"] = json!("2026-09-26T07:00:00.000Z");
    assert_eq!(
        match_public_content(&batch, &bytes(&manifest), &activity_bytes, now_ms()).unwrap_err(),
        ObservationError::OutcomeMismatch
    );
}

#[test]
fn wrong_public_hash_or_path_never_matches() {
    let batch = candidate();
    let activity_bytes = public_data_bytes(&batch.data).unwrap();
    let hash = sha256_hex(&activity_bytes);
    let mut manifest = manifest(&batch, &hash);
    let mut changed_activity = activity_bytes.clone();
    changed_activity.push(b' ');
    assert_eq!(
        match_public_content(&batch, &bytes(&manifest), &changed_activity, now_ms()).unwrap_err(),
        ObservationError::HashMismatch
    );
    manifest["activity"]["url"] = json!("https://elsewhere.invalid/activity.json");
    assert_eq!(
        match_public_content(&batch, &bytes(&manifest), &activity_bytes, now_ms()).unwrap_err(),
        ObservationError::InvalidManifest
    );
    manifest["activity"] = Value::Null;
    assert_eq!(
        match_public_content(&batch, &bytes(&manifest), &activity_bytes, now_ms()).unwrap_err(),
        ObservationError::MissingActivity
    );
}
