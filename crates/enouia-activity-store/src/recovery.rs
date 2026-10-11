//! Read-only audit before any new generation is reserved under the writer lock.

use crate::generation::{ABANDON_REASON, valid_generation_id};
use crate::reader::{
    LoadedGeneration, ReadError, read_current, read_generation_summary, read_named_generation,
};
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

/// How one published, unselected generation relates to CURRENT.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Standing {
    Older,
    HigherReservedSequence,
    ConflictingGeneration,
    Corrupt(ReadError),
}

pub struct PublishedGeneration {
    pub id: String,
    pub standing: Standing,
    /// Present only when the generation had to be read and validated in
    /// full: a same-reservation generation whose pending bytes differ.
    pub loaded: Option<LoadedGeneration>,
}

pub struct GenerationInventory {
    pub current: LoadedGeneration,
    /// Every published directory except CURRENT's, in directory order.
    pub published: Vec<PublishedGeneration>,
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
    // An operator abandonment (ADR-033) records the exact bytes it ended.
    let abandoned = &delivery["pendingAbandoned"];
    if abandoned["sequence"].as_u64() == Some(pending.sequence)
        && abandoned["exactPendingSha256"].as_str() == Some(sha256_hex(pending_bytes).as_str())
        && abandoned["reason"].as_str() == Some(ABANDON_REASON)
        && public_data_bytes(&pending.data).is_ok_and(|bytes| {
            abandoned["activitySha256"].as_str() == Some(sha256_hex(&bytes).as_str())
        })
    {
        return true;
    }
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

/// Read-only classification of every published directory. Unknown, reparse
/// or non-directory entries still fail the whole inventory.
///
/// An unselected generation is judged from its manifest and its hash-checked
/// `sequence.json` (ADR-034), so the cost no longer grows with archive size.
/// Its archive is read only when its reservation equals CURRENT's and its
/// pending bytes differ. `inspect_recovery_locked` still validates every
/// generation in full.
pub fn inventory_generations<C: Clock>(
    root: &Path,
    clock: &C,
) -> Result<GenerationInventory, RecoveryError> {
    let current = read_current(root, clock).map_err(RecoveryError::Current)?;
    let current_activity = sha256_hex(&current.image.activity);
    let current_pending = current.image.pending.as_deref().map(sha256_hex);
    let mut published = Vec::new();
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
        let (standing, loaded) = match read_generation_summary(root, &name) {
            Err(error) => (Standing::Corrupt(error), None),
            Ok(summary) => {
                let reserved = current.validated.highest_reserved;
                if summary.highest_reserved > reserved {
                    (Standing::HigherReservedSequence, None)
                } else if summary.highest_reserved < reserved {
                    (Standing::Older, None)
                } else if summary.activity_sha256 != current_activity {
                    // Valid archives are canonical bytes, so a different
                    // hash is a different archive.
                    (Standing::ConflictingGeneration, None)
                } else if summary.pending_sha256 == current_pending {
                    (Standing::Older, None)
                } else {
                    match read_named_generation(root, &name, clock) {
                        Err(error) => (Standing::Corrupt(error), None),
                        Ok(other) => (standing(&current, &other), Some(other)),
                    }
                }
            }
        };
        published.push(PublishedGeneration {
            id: name,
            standing,
            loaded,
        });
    }
    Ok(GenerationInventory {
        current,
        published,
        staging_directories,
    })
}

fn standing(current: &LoadedGeneration, other: &LoadedGeneration) -> Standing {
    if other.validated.highest_reserved > current.validated.highest_reserved {
        return Standing::HigherReservedSequence;
    }
    if other.validated.highest_reserved == current.validated.highest_reserved
        && (other.validated.archive != current.validated.archive
            || (other.image.pending != current.image.pending
                && !recorded_pending_clear(current, other)))
    {
        return Standing::ConflictingGeneration;
    }
    Standing::Older
}

/// Never chooses a fallback or deletes remnants. A published directory with
/// newer or conflicting state requires manual reconciliation before writing.
pub fn audit_generations<C: Clock>(root: &Path, clock: &C) -> Result<RecoveryAudit, RecoveryError> {
    let inventory = inventory_generations(root, clock)?;
    for generation in &inventory.published {
        match &generation.standing {
            Standing::Older => {}
            Standing::HigherReservedSequence => return Err(RecoveryError::HigherReservedSequence),
            Standing::ConflictingGeneration => return Err(RecoveryError::ConflictingGeneration),
            Standing::Corrupt(error) => {
                return Err(RecoveryError::CorruptGeneration(error.clone()));
            }
        }
    }
    Ok(RecoveryAudit {
        older_generations: inventory.published.len(),
        current: inventory.current,
        staging_directories: inventory.staging_directories,
    })
}
