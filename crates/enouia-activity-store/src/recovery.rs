//! Read-only audit before any new generation is reserved under the writer lock.

use crate::generation::valid_generation_id;
use crate::reader::{LoadedGeneration, ReadError, read_current, read_named_generation};
use enouia_common::Clock;
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
                || other.image.pending != current.image.pending)
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
