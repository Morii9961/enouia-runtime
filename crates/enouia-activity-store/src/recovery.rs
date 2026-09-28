//! Read-only audit before any new generation is reserved under the writer lock.

use crate::generation::valid_generation_id;
use crate::reader::{LoadedGeneration, ReadError, read_current, read_named_generation};
use enouia_activity_contract::{public_data_bytes, sha256_hex};
use enouia_common::Clock;
use serde_json::Value;
use std::fs;
use std::os::windows::fs::MetadataExt;
use std::path::Path;

const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0000_0400;

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RecoveryError {
    Current(ReadError),
    InvalidEntry,
    CorruptGeneration(ReadError),
    HigherReservedSequence,
    ConflictingGeneration,
    Io,
}

pub struct RecoveryAudit {
    pub current: LoadedGeneration,
    pub older_generations: usize,
    pub staging_directories: usize,
}

fn recorded_pending_clear(current: &LoadedGeneration, older: &LoadedGeneration) -> bool {
    let (Some(pending_bytes), Some(pending)) = (&older.image.pending, &older.validated.pending)
    else {
        return false;
    };
    if current.image.pending.is_some() {
        return false;
    }
    let Ok(delivery) = serde_json::from_slice::<Value>(&current.image.delivery) else {
        return false;
    };
    let receipt = &delivery["publicationObserved"];
    receipt["origin"]
        .as_str()
        .is_some_and(|origin| !origin.is_empty())
        && receipt["sequence"].as_u64() == Some(pending.sequence)
        && receipt["exactPendingSha256"].as_str() == Some(sha256_hex(pending_bytes).as_str())
        && public_data_bytes(&pending.data).is_ok_and(|bytes| {
            receipt["activitySha256"].as_str() == Some(sha256_hex(&bytes).as_str())
        })
        && receipt["manifestSha256"].as_str().is_some_and(|hash| {
            hash.len() == 64 && hash.bytes().all(|byte| byte.is_ascii_hexdigit())
        })
        && receipt["generatedAtMs"].as_i64().is_some()
        && receipt["publishedAtMs"].as_i64().is_some()
        && receipt["receivedAtMs"].as_i64().is_some()
}

/// Never chooses a fallback or deletes remnants. A published directory with
/// newer or conflicting state requires manual reconciliation before writing.
pub fn audit_generations<C: Clock>(root: &Path, clock: &C) -> Result<RecoveryAudit, RecoveryError> {
    let current = read_current(root, clock).map_err(RecoveryError::Current)?;
    let mut older_generations = 0;
    let mut staging_directories = 0;
    let entries = fs::read_dir(root.join("generations")).map_err(|_| RecoveryError::Io)?;
    for entry in entries {
        let entry = entry.map_err(|_| RecoveryError::Io)?;
        let name = entry
            .file_name()
            .into_string()
            .map_err(|_| RecoveryError::InvalidEntry)?;
        let metadata = fs::symlink_metadata(entry.path()).map_err(|_| RecoveryError::Io)?;
        if metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 || !metadata.is_dir() {
            return Err(RecoveryError::InvalidEntry);
        }
        if let Some(id) = name.strip_prefix(".staging-") {
            if !valid_generation_id(id) {
                return Err(RecoveryError::InvalidEntry);
            }
            staging_directories += 1;
            continue;
        }
        if !valid_generation_id(&name) {
            return Err(RecoveryError::InvalidEntry);
        }
        if name == current.id {
            continue;
        }
        let other =
            read_named_generation(root, &name, clock).map_err(RecoveryError::CorruptGeneration)?;
        if other.validated.highest_reserved > current.validated.highest_reserved {
            return Err(RecoveryError::HigherReservedSequence);
        }
        if other.validated.highest_reserved == current.validated.highest_reserved
            && (other.validated.archive != current.validated.archive
                || (other.image.pending != current.image.pending
                    && !recorded_pending_clear(&current, &other)))
        {
            return Err(RecoveryError::ConflictingGeneration);
        }
        older_generations += 1;
    }
    Ok(RecoveryAudit {
        current,
        older_generations,
        staging_directories,
    })
}
