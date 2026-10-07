//! Pure validation of one immutable generation before the platform reader uses it.

use enouia_activity_contract::{
    ActivityData, Batch, MAX_SAFE_INTEGER, Snapshot, activity_timestamp_ms,
    exact_activity_timestamp_ms, normalize_activity, public_data_bytes, sha256_hex,
    validate_imported_pending,
};
use enouia_common::{Clock, ErrorCode};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashSet;

const MAX_PENDING_BYTES: usize = 4 * 1024 * 1024;

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum GenerationError {
    InvalidManifest,
    HashMismatch,
    InvalidArchive,
    InvalidSequence,
    InvalidPending,
    InvalidDelivery,
}

/// The exact bytes are kept separately, especially the immutable pending batch.
pub struct GenerationImage {
    pub activity: Vec<u8>,
    pub sequence: Vec<u8>,
    pub pending: Option<Vec<u8>>,
    pub delivery: Vec<u8>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ValidatedGeneration {
    pub archive: ActivityData,
    pub highest_reserved: u64,
    pub pending: Option<Batch>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Manifest {
    schema_version: u8,
    generation_id: String,
    files: FileHashes,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct FileHashes {
    #[serde(rename = "activity.json")]
    activity: String,
    #[serde(rename = "sequence.json")]
    sequence: String,
    #[serde(rename = "pending.json")]
    pending: Option<String>,
    #[serde(rename = "delivery.json")]
    delivery: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PublicationReceipt {
    origin: String,
    sequence: u64,
    exact_pending_sha256: String,
    manifest_sha256: String,
    activity_sha256: String,
    generated_at_ms: i64,
    published_at_ms: i64,
    received_at_ms: i64,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RetryState {
    pub pending_sequence: u64,
    pub exact_pending_sha256: String,
    pub failure_count: u32,
    pub last_error_code: ErrorCode,
    pub next_eligible_at_ms: i64,
    pub last_transport_at_ms: Option<i64>,
}

/// Source outcomes of the last batch whose publication was observed. Display
/// state only: delivery decisions never read it, and older readers ignore it.
#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LastOutcomes {
    pub sequence: u64,
    pub observed_at_ms: i64,
    pub sources: StoredOutcomes,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct StoredOutcomes {
    pub github: StoredOutcome,
    pub codex: StoredOutcome,
    pub claude: StoredOutcome,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StoredOutcome {
    pub attempted_at: String,
    pub succeeded_at: Option<String>,
    pub result: String,
}

/// Observed publication receipt, without the origin.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PublicationRecord {
    pub sequence: u64,
    pub activity_sha256: String,
    pub generated_at_ms: i64,
    pub published_at_ms: i64,
}

fn valid_outcome(outcome: &StoredOutcome) -> bool {
    exact_activity_timestamp_ms(&outcome.attempted_at).is_some()
        && outcome
            .succeeded_at
            .as_deref()
            .is_none_or(|at| exact_activity_timestamp_ms(at).is_some())
        && match outcome.result.as_str() {
            "success" => outcome.succeeded_at.as_deref() == Some(outcome.attempted_at.as_str()),
            "failed" => true,
            _ => false,
        }
}

fn valid_last_outcomes(value: &Value, high_water: u64) -> bool {
    serde_json::from_value::<LastOutcomes>(value.clone()).is_ok_and(|last| {
        last.sequence > 0
            && last.sequence <= high_water
            && last.observed_at_ms >= 0
            && [
                &last.sources.github,
                &last.sources.codex,
                &last.sources.claude,
            ]
            .into_iter()
            .all(valid_outcome)
    })
}

pub(crate) fn last_outcomes_from_delivery(bytes: &[u8]) -> Option<LastOutcomes> {
    let value: Value = serde_json::from_slice(bytes).ok()?;
    serde_json::from_value(value.get("lastOutcomes")?.clone()).ok()
}

pub(crate) fn publication_from_delivery(bytes: &[u8]) -> Option<PublicationRecord> {
    let value: Value = serde_json::from_slice(bytes).ok()?;
    let receipt: PublicationReceipt =
        serde_json::from_value(value.get("publicationObserved")?.clone()).ok()?;
    Some(PublicationRecord {
        sequence: receipt.sequence,
        activity_sha256: receipt.activity_sha256,
        generated_at_ms: receipt.generated_at_ms,
        published_at_ms: receipt.published_at_ms,
    })
}

pub(crate) fn retry_from_delivery(bytes: &[u8]) -> Option<RetryState> {
    let value: Value = serde_json::from_slice(bytes).ok()?;
    serde_json::from_value(value.get("retry")?.clone()).ok()
}

fn valid_retry_state(value: &Value, pending: &Option<Batch>, bytes: Option<&[u8]>) -> bool {
    let (Some(pending), Some(bytes)) = (pending, bytes) else {
        return false;
    };
    let Ok(retry) = serde_json::from_value::<RetryState>(value.clone()) else {
        return false;
    };
    retry.pending_sequence == pending.sequence
        && retry.exact_pending_sha256 == sha256_hex(bytes)
        && retry.failure_count > 0
        && retry.next_eligible_at_ms >= 0
        && retry
            .last_transport_at_ms
            .is_none_or(|at| at >= 0 && at <= retry.next_eligible_at_ms)
}

fn valid_hash(hash: &str) -> bool {
    hash.len() == 64
        && hash
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn valid_publication_receipt(value: &Value, high_water: u64) -> bool {
    let Ok(receipt) = serde_json::from_value::<PublicationReceipt>(value.clone()) else {
        return false;
    };
    !receipt.origin.is_empty()
        && receipt.origin.len() <= 256
        && receipt.sequence > 0
        && receipt.sequence <= high_water
        && valid_hash(&receipt.exact_pending_sha256)
        && valid_hash(&receipt.manifest_sha256)
        && valid_hash(&receipt.activity_sha256)
        && receipt.generated_at_ms >= 0
        && receipt.published_at_ms >= 0
        && receipt.received_at_ms >= 0
        && receipt.published_at_ms <= receipt.generated_at_ms.saturating_add(300_000)
        && receipt.received_at_ms <= receipt.generated_at_ms.saturating_add(300_000)
}

pub(crate) fn paused_from_delivery(bytes: &[u8]) -> Option<bool> {
    let value: Value = serde_json::from_slice(bytes).ok()?;
    let object = value.as_object()?;
    match object.get("paused") {
        None => Some(false),
        Some(value) => value.as_bool(),
    }
}

pub(crate) fn valid_generation_id(id: &str) -> bool {
    id.len() > 2
        && id.len() <= 64
        && id.starts_with("g-")
        && id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
}

fn contains_pending_history(archive: &Option<Snapshot>, pending: &Option<Snapshot>) -> bool {
    let Some(pending) = pending else {
        return true;
    };
    let Some(archive) = archive else {
        return false;
    };
    let archive_time = activity_timestamp_ms(&archive.updated_at);
    let pending_time = activity_timestamp_ms(&pending.updated_at);
    if archive_time < pending_time || (archive_time == pending_time && archive != pending) {
        return false;
    }
    let dates: HashSet<&str> = archive.days.iter().map(|day| day.date.as_str()).collect();
    pending
        .days
        .iter()
        .all(|day| dates.contains(day.date.as_str()))
}

impl GenerationImage {
    fn validate_content<C: Clock>(
        &self,
        clock: &C,
    ) -> Result<ValidatedGeneration, GenerationError> {
        let raw: Value =
            serde_json::from_slice(&self.activity).map_err(|_| GenerationError::InvalidArchive)?;
        let archive = normalize_activity(&raw).map_err(|_| GenerationError::InvalidArchive)?;
        if public_data_bytes(&archive).map_err(|_| GenerationError::InvalidArchive)?
            != self.activity
        {
            return Err(GenerationError::InvalidArchive);
        }

        let sequence: Value =
            serde_json::from_slice(&self.sequence).map_err(|_| GenerationError::InvalidSequence)?;
        let sequence = sequence
            .as_object()
            .filter(|object| object.len() == 1)
            .and_then(|object| object.get("sequence"))
            .and_then(Value::as_u64)
            .filter(|value| *value <= MAX_SAFE_INTEGER)
            .ok_or(GenerationError::InvalidSequence)?;
        if self.sequence != format!("{{\"sequence\":{sequence}}}\n").as_bytes() {
            return Err(GenerationError::InvalidSequence);
        }
        if sequence == 0
            && (archive.sources.github.is_some()
                || archive.sources.codex.is_some()
                || archive.sources.claude.is_some())
        {
            return Err(GenerationError::InvalidSequence);
        }

        let pending = self
            .pending
            .as_ref()
            .map(|bytes| {
                if bytes.len() > MAX_PENDING_BYTES {
                    return Err(GenerationError::InvalidPending);
                }
                let raw: Value =
                    serde_json::from_slice(bytes).map_err(|_| GenerationError::InvalidPending)?;
                let batch = validate_imported_pending(&raw, clock)
                    .map_err(|_| GenerationError::InvalidPending)?;
                if batch.sequence > sequence
                    || !contains_pending_history(
                        &archive.sources.github,
                        &batch.data.sources.github,
                    )
                    || !contains_pending_history(&archive.sources.codex, &batch.data.sources.codex)
                    || !contains_pending_history(
                        &archive.sources.claude,
                        &batch.data.sources.claude,
                    )
                {
                    return Err(GenerationError::InvalidPending);
                }
                Ok(batch)
            })
            .transpose()?;

        if !serde_json::from_slice::<Value>(&self.delivery).is_ok_and(|value| {
            value.is_object()
                && paused_from_delivery(&self.delivery).is_some()
                && value
                    .get("publicationObserved")
                    .is_none_or(|receipt| valid_publication_receipt(receipt, sequence))
                && value
                    .get("retry")
                    .is_none_or(|retry| valid_retry_state(retry, &pending, self.pending.as_deref()))
                && value
                    .get("lastOutcomes")
                    .is_none_or(|last| valid_last_outcomes(last, sequence))
        }) {
            return Err(GenerationError::InvalidDelivery);
        }
        Ok(ValidatedGeneration {
            archive,
            highest_reserved: sequence,
            pending,
        })
    }

    /// Construct the local manifest only from internally consistent content.
    pub fn manifest_bytes<C: Clock>(
        &self,
        generation_id: &str,
        clock: &C,
    ) -> Result<Vec<u8>, GenerationError> {
        if !valid_generation_id(generation_id) {
            return Err(GenerationError::InvalidManifest);
        }
        self.validate_content(clock)?;
        let manifest = Manifest {
            schema_version: 1,
            generation_id: generation_id.to_owned(),
            files: FileHashes {
                activity: sha256_hex(&self.activity),
                sequence: sha256_hex(&self.sequence),
                pending: self.pending.as_ref().map(|bytes| sha256_hex(bytes)),
                delivery: sha256_hex(&self.delivery),
            },
        };
        let mut bytes =
            serde_json::to_vec(&manifest).map_err(|_| GenerationError::InvalidManifest)?;
        bytes.push(b'\n');
        Ok(bytes)
    }

    /// Check hashes before interpreting content. A reader must pin one CURRENT
    /// generation and supply exactly its files; no older fallback is selected.
    pub fn validate<C: Clock>(
        &self,
        manifest_bytes: &[u8],
        expected_generation_id: &str,
        clock: &C,
    ) -> Result<ValidatedGeneration, GenerationError> {
        let manifest: Manifest =
            serde_json::from_slice(manifest_bytes).map_err(|_| GenerationError::InvalidManifest)?;
        if manifest.schema_version != 1
            || !valid_generation_id(expected_generation_id)
            || manifest.generation_id != expected_generation_id
        {
            return Err(GenerationError::InvalidManifest);
        }
        if manifest.files.activity != sha256_hex(&self.activity)
            || manifest.files.sequence != sha256_hex(&self.sequence)
            || manifest.files.pending != self.pending.as_ref().map(|bytes| sha256_hex(bytes))
            || manifest.files.delivery != sha256_hex(&self.delivery)
        {
            return Err(GenerationError::HashMismatch);
        }
        self.validate_content(clock)
    }
}
