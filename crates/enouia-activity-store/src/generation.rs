//! Pure validation of one immutable generation before the platform reader uses it.

use enouia_activity_contract::{
    ActivityData, Batch, MAX_SAFE_INTEGER, Snapshot, activity_timestamp_ms, normalize_activity,
    public_data_bytes, sha256_hex, validate_imported_pending,
};
use enouia_common::Clock;
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

        if !serde_json::from_slice::<Value>(&self.delivery).is_ok_and(|value| value.is_object()) {
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
