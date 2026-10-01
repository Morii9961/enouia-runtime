//! Read-only validation of a copied legacy Activity trio before reconciliation.

use crate::generation::{GenerationError, GenerationImage};
use crate::reader::{
    MAX_ARCHIVE_BYTES, MAX_PENDING_BYTES, MAX_SEQUENCE_BYTES, ReadError, checked_directory,
    read_file, read_optional,
};
use enouia_activity_contract::{
    ActivityData, Batch, MAX_SAFE_INTEGER, Snapshot, activity_timestamp_ms, normalize_activity,
    public_data_bytes, sha256_hex,
};
use enouia_common::Clock;
use serde::Serialize;
use serde_json::Value;
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum InspectError {
    InvalidDirectory(ReadError),
    Read(ReadError),
    InvalidArchive,
    ArchiveExtraFields,
    InvalidSequence,
    InvalidImage(GenerationError),
    Io,
}

pub struct LegacyInspection {
    pub archive: ActivityData,
    pub canonical_archive_bytes: Vec<u8>,
    pub highest_reserved: u64,
    pub pending: Option<Batch>,
    pub exact_pending_bytes: Option<Vec<u8>>,
    pub raw_archive_sha256: String,
    pub raw_sequence_sha256: String,
    pub pending_sha256: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ValueChange {
    pub date: String,
    pub current: u64,
    pub candidate: u64,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceComparison {
    pub current_sha256: Option<String>,
    pub candidate_sha256: Option<String>,
    pub current_only_dates: Vec<String>,
    pub candidate_only_dates: Vec<String>,
    pub changed_values: Vec<ValueChange>,
    pub success_time_regressed: bool,
    pub requires_reconciliation: bool,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveComparison {
    pub github: SourceComparison,
    pub codex: SourceComparison,
    pub claude: SourceComparison,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CompareError {
    InvalidSnapshot,
    Serialize,
}

fn source_hash(snapshot: &Option<Snapshot>) -> Result<Option<String>, CompareError> {
    snapshot
        .as_ref()
        .map(|snapshot| {
            serde_json::to_vec(snapshot)
                .map(|bytes| sha256_hex(&bytes))
                .map_err(|_| CompareError::Serialize)
        })
        .transpose()
}

fn compare_source(
    current: &Option<Snapshot>,
    candidate: &Option<Snapshot>,
) -> Result<SourceComparison, CompareError> {
    let current_days: BTreeMap<&str, u64> = current
        .as_ref()
        .into_iter()
        .flat_map(|snapshot| snapshot.days.iter())
        .map(|day| (day.date.as_str(), day.value))
        .collect();
    let candidate_days: BTreeMap<&str, u64> = candidate
        .as_ref()
        .into_iter()
        .flat_map(|snapshot| snapshot.days.iter())
        .map(|day| (day.date.as_str(), day.value))
        .collect();
    let current_only_dates = current_days
        .keys()
        .filter(|date| !candidate_days.contains_key(**date))
        .map(|date| (*date).to_owned())
        .collect::<Vec<_>>();
    let candidate_only_dates = candidate_days
        .keys()
        .filter(|date| !current_days.contains_key(**date))
        .map(|date| (*date).to_owned())
        .collect::<Vec<_>>();
    let changed_values = current_days
        .iter()
        .filter_map(|(date, value)| {
            candidate_days.get(date).and_then(|new_value| {
                (value != new_value).then(|| ValueChange {
                    date: (*date).to_owned(),
                    current: *value,
                    candidate: *new_value,
                })
            })
        })
        .collect::<Vec<_>>();
    let success_time_regressed = match (current, candidate) {
        (Some(current), Some(candidate)) => {
            let current_time =
                activity_timestamp_ms(&current.updated_at).ok_or(CompareError::InvalidSnapshot)?;
            let candidate_time = activity_timestamp_ms(&candidate.updated_at)
                .ok_or(CompareError::InvalidSnapshot)?;
            candidate_time < current_time
        }
        _ => false,
    };
    let requires_reconciliation = !current_only_dates.is_empty()
        || !changed_values.is_empty()
        || success_time_regressed
        || (current.is_some() && candidate.is_none());
    Ok(SourceComparison {
        current_sha256: source_hash(current)?,
        candidate_sha256: source_hash(candidate)?,
        current_only_dates,
        candidate_only_dates,
        changed_values,
        success_time_regressed,
        requires_reconciliation,
    })
}

/// Compare two validated archives without merging or choosing an authority.
pub fn compare_archives(
    current: &ActivityData,
    candidate: &ActivityData,
) -> Result<ArchiveComparison, CompareError> {
    Ok(ArchiveComparison {
        github: compare_source(&current.sources.github, &candidate.sources.github)?,
        codex: compare_source(&current.sources.codex, &candidate.sources.codex)?,
        claude: compare_source(&current.sources.claude, &candidate.sources.claude)?,
    })
}

fn exact_keys(value: &Value, keys: &[&str]) -> bool {
    value.as_object().is_some_and(|object| {
        object.len() == keys.len() && keys.iter().all(|key| object.contains_key(*key))
    })
}

fn allowed_archive_shape(raw: &Value) -> bool {
    if !exact_keys(raw, &["version", "sources"]) {
        return false;
    }
    let sources = &raw["sources"];
    if !exact_keys(sources, &["github", "codex", "claude"]) {
        return false;
    }
    ["github", "codex", "claude"].iter().all(|source| {
        let snapshot = &sources[*source];
        if snapshot.is_null() {
            return true;
        }
        exact_keys(snapshot, &["updatedAt", "timezone", "metric", "days"])
            && snapshot["days"]
                .as_array()
                .is_some_and(|days| days.iter().all(|day| exact_keys(day, &["date", "value"])))
    })
}

/// Inspect only a copied, quiescent trio. The original byte hashes remain
/// distinct from the normalized public archive hash used by a future import.
pub fn inspect_legacy_trio<C: Clock>(
    directory: &Path,
    clock: &C,
) -> Result<LegacyInspection, InspectError> {
    if !directory.is_absolute() {
        return Err(InspectError::InvalidDirectory(ReadError::InvalidRoot));
    }
    checked_directory(directory, ReadError::InvalidRoot).map_err(InspectError::InvalidDirectory)?;
    let directory = fs::canonicalize(directory).map_err(|_| InspectError::Io)?;
    let raw_archive = read_file(
        &directory.join("activity.json"),
        MAX_ARCHIVE_BYTES,
        ReadError::MissingFile,
    )
    .map_err(InspectError::Read)?;
    let raw_sequence = read_file(
        &directory.join("sequence.json"),
        MAX_SEQUENCE_BYTES,
        ReadError::MissingFile,
    )
    .map_err(InspectError::Read)?;
    let exact_pending_bytes = read_optional(&directory.join("pending.json"), MAX_PENDING_BYTES)
        .map_err(InspectError::Read)?;

    let raw: Value =
        serde_json::from_slice(&raw_archive).map_err(|_| InspectError::InvalidArchive)?;
    let archive = normalize_activity(&raw).map_err(|_| InspectError::InvalidArchive)?;
    if !allowed_archive_shape(&raw) {
        return Err(InspectError::ArchiveExtraFields);
    }
    let canonical_archive_bytes =
        public_data_bytes(&archive).map_err(|_| InspectError::InvalidArchive)?;

    let sequence: Value =
        serde_json::from_slice(&raw_sequence).map_err(|_| InspectError::InvalidSequence)?;
    let highest_reserved = sequence
        .as_object()
        .filter(|object| object.len() == 1)
        .and_then(|object| object.get("sequence"))
        .and_then(Value::as_u64)
        .filter(|value| *value <= MAX_SAFE_INTEGER)
        .ok_or(InspectError::InvalidSequence)?;
    let image = GenerationImage {
        activity: canonical_archive_bytes.clone(),
        sequence: format!("{{\"sequence\":{highest_reserved}}}\n").into_bytes(),
        pending: exact_pending_bytes.clone(),
        delivery: b"{}\n".to_vec(),
    };
    let manifest = image
        .manifest_bytes("g-legacy-inspect", clock)
        .map_err(InspectError::InvalidImage)?;
    let validated = image
        .validate(&manifest, "g-legacy-inspect", clock)
        .map_err(InspectError::InvalidImage)?;
    Ok(LegacyInspection {
        archive,
        canonical_archive_bytes,
        highest_reserved,
        pending: validated.pending,
        raw_archive_sha256: sha256_hex(&raw_archive),
        raw_sequence_sha256: sha256_hex(&raw_sequence),
        pending_sha256: exact_pending_bytes.as_ref().map(|bytes| sha256_hex(bytes)),
        exact_pending_bytes,
    })
}
