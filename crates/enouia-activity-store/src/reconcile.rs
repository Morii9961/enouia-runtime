//! Explicit operator reconciliation of published generations that block writing.
//!
//! Process death between publishing `generations/<id>` and replacing CURRENT
//! leaves a directory the audit cannot tell apart from a rolled-back pointer,
//! so every later commit stops. Inspection lists the evidence; retraction acts
//! only on one named generation whose manifest hash the operator supplies and
//! whose never-selected state the operator confirms. It renames the directory
//! back to its staging name and records the decision. Nothing is deleted.
//!
//! Abandonment (ADR-033) ends one refused pending batch at its sequence after
//! the operator's confirmation, and keeps a copy of its exact bytes.

use crate::ActivityLockGuard;
use crate::generation::valid_generation_id;
use crate::reader::{
    LoadedGeneration, MAX_CURRENT_BYTES, MAX_MANIFEST_BYTES, ReadError, checked_directory,
    read_file, read_named_generation,
};
use crate::recovery::{PublishedGeneration, RecoveryError, Standing, inventory_generations};
use crate::writer::{AbandonEvidence, CommitError, commit_pending_abandoned, move_without_replace};
use enouia_activity_contract::sha256_hex;
use enouia_common::Clock;
use serde_json::{Value, json};
use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::Path;

/// Whether `CURRENT.<id>.tmp` holds exactly the pointer the writer prepared.
/// A completed switch consumes that file, so an exact one shows that this
/// prepared pointer never replaced CURRENT. It is evidence, not proof: an
/// external restore of CURRENT is still possible.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PreparedPointer {
    Exact,
    Absent,
    Other,
}

impl PreparedPointer {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Exact => "exact",
            Self::Absent => "absent",
            Self::Other => "other",
        }
    }
}

pub struct GenerationEvidence {
    pub id: String,
    pub standing: Standing,
    /// Hash of the raw manifest bytes; `None` when the manifest is unreadable.
    pub manifest_sha256: Option<String>,
    pub highest_reserved: Option<u64>,
    pub pending_sequence: Option<u64>,
    pub pending_sha256: Option<String>,
    pub prepared_pointer: PreparedPointer,
}

pub struct CurrentEvidence {
    pub id: String,
    pub manifest_sha256: String,
    pub highest_reserved: u64,
    pub pending_sequence: Option<u64>,
}

pub struct RecoveryInspection {
    pub current: CurrentEvidence,
    pub older_generations: usize,
    pub staging_directories: usize,
    /// Published generations that stop the next commit, in directory order.
    pub blocking: Vec<GenerationEvidence>,
    /// Older generations whose full validation fails. Since ADR-034 they no
    /// longer block writing, so inspection is where they surface.
    pub damaged_older: Vec<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RetractError {
    Recovery(RecoveryError),
    InvalidGenerationId,
    /// Absent, CURRENT itself, an older generation or a corrupt one.
    NotRetractable,
    ManifestMismatch,
    StagingOccupied,
    Io,
    /// The directory was retracted but its record could not be written.
    RecordFailed(Box<RetractedGeneration>),
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RetractedGeneration {
    pub record: Value,
    /// Whether the post-retraction audit allows the next commit.
    pub writable: bool,
    pub remaining_blocking: usize,
}

fn manifest_sha256(root: &Path, id: &str) -> Option<String> {
    read_file(
        &root.join("generations").join(id).join("manifest.json"),
        MAX_MANIFEST_BYTES,
        ReadError::MissingFile,
    )
    .ok()
    .map(|bytes| sha256_hex(&bytes))
}

fn prepared_pointer(root: &Path, id: &str) -> PreparedPointer {
    match read_file(
        &root.join(format!("CURRENT.{id}.tmp")),
        MAX_CURRENT_BYTES,
        ReadError::MissingFile,
    ) {
        Ok(bytes) if bytes.strip_suffix(b"\n") == Some(id.as_bytes()) => PreparedPointer::Exact,
        Err(ReadError::MissingFile) => PreparedPointer::Absent,
        _ => PreparedPointer::Other,
    }
}

fn evidence<C: Clock>(
    root: &Path,
    generation: &PublishedGeneration,
    clock: &C,
) -> GenerationEvidence {
    // The write-path audit reads only summaries; evidence needs full validation.
    let read;
    let loaded: Option<&LoadedGeneration> = match &generation.loaded {
        Some(loaded) => Some(loaded),
        None => {
            read = read_named_generation(root, &generation.id, clock).ok();
            read.as_ref()
        }
    };
    GenerationEvidence {
        id: generation.id.clone(),
        standing: generation.standing.clone(),
        manifest_sha256: manifest_sha256(root, &generation.id),
        highest_reserved: loaded.map(|l| l.validated.highest_reserved),
        pending_sequence: loaded.and_then(|l| l.validated.pending.as_ref().map(|b| b.sequence)),
        pending_sha256: loaded.and_then(|l| l.image.pending.as_deref().map(sha256_hex)),
        prepared_pointer: prepared_pointer(root, &generation.id),
    }
}

/// Lists what blocks writing. The lock keeps a live writer from adding or
/// switching generations while the evidence is read. Nothing is changed.
pub fn inspect_recovery_locked<C: Clock>(
    guard: &ActivityLockGuard,
    clock: &C,
) -> Result<RecoveryInspection, RecoveryError> {
    let root = guard.root();
    let inventory = inventory_generations(root, clock)?;
    let current = &inventory.current;
    let current = CurrentEvidence {
        id: current.id.clone(),
        manifest_sha256: manifest_sha256(root, &current.id).ok_or(RecoveryError::Io)?,
        highest_reserved: current.validated.highest_reserved,
        pending_sequence: current.validated.pending.as_ref().map(|b| b.sequence),
    };
    let mut older_generations = 0;
    let mut blocking = Vec::new();
    let mut damaged_older = Vec::new();
    for generation in &inventory.published {
        if generation.standing == Standing::Older {
            older_generations += 1;
            if generation.loaded.is_none()
                && read_named_generation(root, &generation.id, clock).is_err()
            {
                damaged_older.push(generation.id.clone());
            }
        } else {
            blocking.push(evidence(root, generation, clock));
        }
    }
    Ok(RecoveryInspection {
        current,
        older_generations,
        staging_directories: inventory.staging_directories,
        blocking,
        damaged_older,
    })
}

pub fn standing_name(standing: &Standing) -> &'static str {
    match standing {
        Standing::Older => "older",
        Standing::HigherReservedSequence => "higher_reserved_sequence",
        Standing::ConflictingGeneration => "conflicting_generation",
        Standing::Corrupt(_) => "corrupt",
    }
}

pub fn valid_manifest_sha256(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

/// Retract one blocking generation the operator has confirmed was never
/// selected and never delivered. Only a validated generation with a higher
/// reserved sequence or a same-sequence conflict qualifies; corrupt ones stay
/// for manual handling. The directory moves to `generations/.staging-<id>`,
/// where the audit ignores it, and `reconciliations/retract-<id>.json`
/// records the evidence. The next commit then reserves from CURRENT again.
pub fn retract_unselected_locked<C: Clock>(
    guard: &ActivityLockGuard,
    clock: &C,
    id: &str,
    expected_manifest_sha256: &str,
) -> Result<RetractedGeneration, RetractError> {
    if !valid_generation_id(id) || !valid_manifest_sha256(expected_manifest_sha256) {
        return Err(RetractError::InvalidGenerationId);
    }
    let root = guard.root();
    let inspection = inspect_recovery_locked(guard, clock).map_err(RetractError::Recovery)?;
    let target = inspection
        .blocking
        .iter()
        .find(|generation| generation.id == id)
        .filter(|generation| {
            matches!(
                generation.standing,
                Standing::HigherReservedSequence | Standing::ConflictingGeneration
            ) && generation.highest_reserved.is_some()
        })
        .ok_or(RetractError::NotRetractable)?;
    if target.manifest_sha256.as_deref() != Some(expected_manifest_sha256) {
        return Err(RetractError::ManifestMismatch);
    }
    let generations = root.join("generations");
    let staging = generations.join(format!(".staging-{id}"));
    match fs::symlink_metadata(&staging) {
        Err(error) if error.kind() == io::ErrorKind::NotFound => {}
        _ => return Err(RetractError::StagingOccupied),
    }
    let record = json!({
        "schemaVersion": 1,
        "action": "retract_unselected_generation",
        "operatorConfirmed": "never_selected",
        "retractedAtMs": clock.now_unix_ms(),
        "generation": {
            "id": target.id,
            "standing": standing_name(&target.standing),
            "manifestSha256": target.manifest_sha256,
            "highestReserved": target.highest_reserved,
            "pendingSequence": target.pending_sequence,
            "pendingSha256": target.pending_sha256,
            "preparedPointer": target.prepared_pointer.as_str(),
            "retainedAs": format!("generations/.staging-{id}"),
        },
        "current": {
            "id": inspection.current.id,
            "manifestSha256": inspection.current.manifest_sha256,
            "highestReserved": inspection.current.highest_reserved,
            "pendingSequence": inspection.current.pending_sequence,
        },
    });
    if !move_without_replace(&generations.join(id), &staging) {
        return Err(RetractError::Io);
    }
    let (writable, remaining_blocking) = match inspect_recovery_locked(guard, clock) {
        Ok(after) => (after.blocking.is_empty(), after.blocking.len()),
        Err(_) => (false, 0),
    };
    let retracted = RetractedGeneration {
        record,
        writable,
        remaining_blocking,
    };
    write_record(root, id, &retracted.record)
        .map_err(|_| RetractError::RecordFailed(Box::new(retracted.clone())))?;
    Ok(retracted)
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum AbandonError {
    Commit(CommitError),
    /// The generation was committed but its record or byte copy failed.
    RecordFailed(Box<Value>),
}

/// Abandon one refused pending batch (ADR-033) and record it. The commit
/// comes first; `reconciliations/abandon-<N>.json` and a copy of the exact
/// pending bytes follow. Both use new names and replace nothing.
pub fn abandon_pending_locked<C: Clock>(
    guard: &ActivityLockGuard,
    clock: &C,
    next_id: &str,
    evidence: &AbandonEvidence,
) -> Result<Value, AbandonError> {
    let root = guard.root();
    let before = crate::recovery::audit_generations(root, clock)
        .map_err(|error| AbandonError::Commit(CommitError::Recovery(error)))?
        .current;
    commit_pending_abandoned(guard, &before.id, next_id, evidence, clock)
        .map_err(AbandonError::Commit)?;
    let after = crate::reader::read_current(root, clock)
        .map_err(|error| AbandonError::Commit(CommitError::PostSwitchValidation(error)))?;
    let record = json!({
        "schemaVersion": 1,
        "action": "abandon_refused_pending",
        "operatorConfirmed": "refused_or_remote_ahead",
        "pendingAbandoned": serde_json::from_slice::<Value>(&after.image.delivery)
            .ok()
            .and_then(|delivery| delivery.get("pendingAbandoned").cloned()),
        "fromGeneration": before.id,
        "toGeneration": after.id,
        "previousHighestReserved": before.validated.highest_reserved,
        "highestReserved": after.validated.highest_reserved,
        "nextSequence": after.validated.highest_reserved + 1,
        "pendingCopy": format!("reconciliations/abandon-{}-pending.json", evidence.sequence),
    });
    let pending = before.image.pending.unwrap_or_default();
    let written = write_named(
        root,
        &format!("abandon-{}-pending.json", evidence.sequence),
        &pending,
    )
    .and_then(|()| {
        let mut bytes = serde_json::to_vec_pretty(&record).map_err(|_| ())?;
        bytes.push(b'\n');
        write_named(root, &format!("abandon-{}.json", evidence.sequence), &bytes)
    });
    match written {
        Ok(()) => Ok(record),
        Err(()) => Err(AbandonError::RecordFailed(Box::new(record))),
    }
}

fn write_record(root: &Path, id: &str, record: &Value) -> Result<(), ()> {
    let mut bytes = serde_json::to_vec_pretty(record).map_err(|_| ())?;
    bytes.push(b'\n');
    write_named(root, &format!("retract-{id}.json"), &bytes)
}

/// Create one new file under `reconciliations/`; an existing name is refused.
fn write_named(root: &Path, name: &str, bytes: &[u8]) -> Result<(), ()> {
    let directory = root.join("reconciliations");
    match fs::create_dir(&directory) {
        Ok(()) => {}
        Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {}
        Err(_) => return Err(()),
    }
    checked_directory(&directory, ReadError::Io).map_err(|_| ())?;
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(directory.join(name))
        .map_err(|_| ())?;
    file.write_all(bytes)
        .and_then(|_| file.sync_all())
        .map_err(|_| ())
}
