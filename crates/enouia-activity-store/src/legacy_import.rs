//! Offline bootstrap from a reviewed, quiescent legacy trio into an unused root.

use crate::ActivityLockGuard;
use crate::generation::{GenerationError, GenerationImage};
use crate::legacy_inspect::{InspectError, inspect_legacy_trio};
use crate::reader::{ReadError, checked_directory, read_current};
use crate::writer::{CommitError, CommitPhase, write_generation};
use enouia_activity_contract::{MAX_SAFE_INTEGER, sha256_hex};
use enouia_common::Clock;
use std::fs;
use std::path::Path;

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ImportError {
    InvalidSource,
    ExistingState,
    InvalidHighWater,
    UnverifiedUnusedIdentity,
    UnpublishableSuccessTime,
    Inspect(InspectError),
    InvalidImage(GenerationError),
    Commit(CommitError),
    Read(ReadError),
    Io,
}

/// Operator-selected ceiling covering known local, receiver, and publisher
/// sequences. This API cannot verify remote inventory or authorize delivery.
pub struct ImportOptions {
    pub reconciled_high_water: u64,
    pub verified_unused_identity: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ImportSummary {
    pub generation_id: String,
    pub legacy_high_water: u64,
    pub highest_reserved: u64,
    pub raw_archive_sha256: String,
    pub raw_sequence_sha256: String,
    pub activity_sha256: String,
    pub pending_sha256: Option<String>,
}

fn require_unused_root(guard: &ActivityLockGuard) -> Result<(), ImportError> {
    checked_directory(guard.root(), ReadError::InvalidRoot).map_err(ImportError::Read)?;
    for entry in fs::read_dir(guard.root()).map_err(|_| ImportError::Io)? {
        let entry = entry.map_err(|_| ImportError::Io)?;
        if entry.file_name() != "sync.lock" {
            return Err(ImportError::ExistingState);
        }
    }
    Ok(())
}

/// Import only into a root containing its live lock and no other entries.
/// Existing state, corrupt CURRENT, and interrupted bootstrap remnants all
/// require explicit reconciliation; none is silently treated as a first run.
/// A retained success time the public manifest cannot carry also requires an
/// explicitly reconciled seed; import never restamps it. The imported
/// generation is paused. This operation never collects or sends.
pub fn import_legacy_trio<C: Clock>(
    guard: &ActivityLockGuard,
    source: &Path,
    generation_id: &str,
    options: &ImportOptions,
    clock: &C,
) -> Result<ImportSummary, ImportError> {
    import_legacy_trio_with_hook(guard, source, generation_id, options, clock, |_| Ok(()))
}

/// Fault hook at the shared generation commit boundaries. After a switch error,
/// callers must reread CURRENT rather than assume that nothing was imported.
pub fn import_legacy_trio_with_hook<C: Clock, F: FnMut(CommitPhase) -> Result<(), ()>>(
    guard: &ActivityLockGuard,
    source: &Path,
    generation_id: &str,
    options: &ImportOptions,
    clock: &C,
    mut hook: F,
) -> Result<ImportSummary, ImportError> {
    require_unused_root(guard)?;
    if !source.is_absolute() {
        return Err(ImportError::InvalidSource);
    }
    checked_directory(source, ReadError::InvalidRoot).map_err(ImportError::Read)?;
    let source = fs::canonicalize(source).map_err(|_| ImportError::InvalidSource)?;
    if source.starts_with(guard.root()) || guard.root().starts_with(&source) {
        return Err(ImportError::InvalidSource);
    }
    let inspected = inspect_legacy_trio(&source, clock).map_err(ImportError::Inspect)?;
    if !inspected.unpublishable_success_times.is_empty() {
        return Err(ImportError::UnpublishableSuccessTime);
    }
    let high_water = options.reconciled_high_water;
    if high_water < inspected.highest_reserved || high_water > MAX_SAFE_INTEGER {
        return Err(ImportError::InvalidHighWater);
    }
    if high_water == 0 && !options.verified_unused_identity {
        return Err(ImportError::UnverifiedUnusedIdentity);
    }
    let image = GenerationImage {
        activity: inspected.canonical_archive_bytes,
        sequence: format!("{{\"sequence\":{high_water}}}\n").into_bytes(),
        pending: inspected.exact_pending_bytes,
        delivery: b"{\"paused\":true}\n".to_vec(),
    };
    let manifest = image
        .manifest_bytes(generation_id, clock)
        .map_err(ImportError::InvalidImage)?;
    let summary = ImportSummary {
        generation_id: generation_id.to_owned(),
        legacy_high_water: inspected.highest_reserved,
        highest_reserved: high_water,
        raw_archive_sha256: inspected.raw_archive_sha256,
        raw_sequence_sha256: inspected.raw_sequence_sha256,
        activity_sha256: sha256_hex(&image.activity),
        pending_sha256: image.pending.as_ref().map(|bytes| sha256_hex(bytes)),
    };

    fs::create_dir(guard.root().join("generations")).map_err(|_| ImportError::Io)?;
    write_generation(guard, generation_id, &image, &manifest, false, &mut hook)
        .map_err(ImportError::Commit)?;
    let current = read_current(guard.root(), clock).map_err(ImportError::Read)?;
    if current.id != generation_id {
        return Err(ImportError::Commit(CommitError::SwitchFailed));
    }
    Ok(summary)
}
