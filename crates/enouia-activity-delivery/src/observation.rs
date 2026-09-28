//! Pure content checks for one fetched public manifest and Activity JSON.

use enouia_activity_contract::{
    Batch, exact_activity_timestamp_ms, public_data_bytes, sha256_hex, validate_publishable_batch,
};
use serde_json::Value;

const MAX_MANIFEST_BYTES: usize = 1024 * 1024;
const MAX_ACTIVITY_BYTES: usize = 4 * 1024 * 1024;
const PROBE_TTL_MS: i64 = 15 * 60 * 1000;
const FUTURE_SKEW_MS: i64 = 5 * 60 * 1000;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ObservationError {
    InvalidExpected,
    InvalidManifest,
    StaleManifest,
    InvalidActivity,
    HashMismatch,
    OutcomeMismatch,
    MissingActivity,
}

/// Content evidence only. The HTTP layer must separately prove the configured
/// origin, exact requested paths, no cross-origin redirects, and bounded reads.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MatchingPublicContent {
    pub manifest_sha256: String,
    pub activity_sha256: String,
    pub generated_at_ms: i64,
    pub published_at_ms: i64,
    pub received_at_ms: i64,
}

fn timestamp(value: &Value) -> Option<i64> {
    value.as_str().and_then(exact_activity_timestamp_ms)
}

fn valid_hash(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

/// Compare public bytes and source outcome metadata with one frozen batch.
/// Matching content alone is not yet a safe pending-clear acknowledgment.
pub fn match_public_content(
    expected: &Batch,
    manifest_bytes: &[u8],
    activity_bytes: &[u8],
    now_ms: i64,
) -> Result<MatchingPublicContent, ObservationError> {
    validate_publishable_batch(expected).map_err(|_| ObservationError::InvalidExpected)?;
    if manifest_bytes.len() > MAX_MANIFEST_BYTES {
        return Err(ObservationError::InvalidManifest);
    }
    if activity_bytes.len() > MAX_ACTIVITY_BYTES {
        return Err(ObservationError::InvalidActivity);
    }
    let expected_activity =
        public_data_bytes(&expected.data).map_err(|_| ObservationError::InvalidExpected)?;
    let manifest: Value =
        serde_json::from_slice(manifest_bytes).map_err(|_| ObservationError::InvalidManifest)?;
    if manifest.get("version").and_then(Value::as_u64) != Some(1) {
        return Err(ObservationError::InvalidManifest);
    }
    let generated_at_ms =
        timestamp(&manifest["generatedAt"]).ok_or(ObservationError::InvalidManifest)?;
    let valid_until_ms =
        timestamp(&manifest["validUntil"]).ok_or(ObservationError::InvalidManifest)?;
    if generated_at_ms > now_ms.saturating_add(FUTURE_SKEW_MS)
        || valid_until_ms < now_ms
        || valid_until_ms < generated_at_ms
        || valid_until_ms > generated_at_ms.saturating_add(PROBE_TTL_MS)
    {
        return Err(ObservationError::StaleManifest);
    }
    let activity = manifest
        .get("activity")
        .filter(|value| !value.is_null())
        .ok_or(ObservationError::MissingActivity)?;
    let hash = activity["hash"]
        .as_str()
        .filter(|hash| valid_hash(hash))
        .ok_or(ObservationError::InvalidManifest)?;
    if activity["url"].as_str() != Some(format!("/status-data/activity/{hash}.json").as_str()) {
        return Err(ObservationError::InvalidManifest);
    }
    let published_at_ms =
        timestamp(&activity["publishedAt"]).ok_or(ObservationError::InvalidManifest)?;
    let received_at_ms =
        timestamp(&activity["receivedAt"]).ok_or(ObservationError::InvalidManifest)?;
    if published_at_ms > generated_at_ms.saturating_add(FUTURE_SKEW_MS)
        || received_at_ms > generated_at_ms.saturating_add(FUTURE_SKEW_MS)
    {
        return Err(ObservationError::InvalidManifest);
    }
    if activity_bytes != expected_activity {
        return Err(ObservationError::HashMismatch);
    }
    let activity_sha256 = sha256_hex(activity_bytes);
    if hash != activity_sha256 {
        return Err(ObservationError::HashMismatch);
    }
    let expected_sources =
        serde_json::to_value(&expected.sources).map_err(|_| ObservationError::InvalidExpected)?;
    if activity["sources"] != expected_sources {
        return Err(ObservationError::OutcomeMismatch);
    }
    Ok(MatchingPublicContent {
        manifest_sha256: sha256_hex(manifest_bytes),
        activity_sha256,
        generated_at_ms,
        published_at_ms,
        received_at_ms,
    })
}
