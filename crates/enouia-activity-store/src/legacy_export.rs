//! Offline legacy trio export from one validated, locked Activity generation.

use crate::ActivityLockGuard;
use crate::recovery::{RecoveryError, audit_generations};
use enouia_activity_contract::sha256_hex;
use enouia_common::Clock;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::os::windows::ffi::OsStrExt;
use std::os::windows::fs::MetadataExt;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};
use windows_sys::Win32::Storage::FileSystem::{MOVEFILE_WRITE_THROUGH, MoveFileExW};

const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0000_0400;

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ExportError {
    InvalidDestination,
    DestinationExists,
    Recovery(RecoveryError),
    Io,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ExportSummary {
    pub generation_id: String,
    pub highest_reserved: u64,
    pub activity_sha256: String,
    pub sequence_sha256: String,
    pub pending_sha256: Option<String>,
}

fn write_synced(path: &Path, bytes: &[u8]) -> Result<(), ExportError> {
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|_| ExportError::Io)?;
    file.write_all(bytes).map_err(|_| ExportError::Io)?;
    file.sync_all().map_err(|_| ExportError::Io)
}

fn publish(staging: &Path, destination: &Path) -> Result<(), ExportError> {
    let from: Vec<u16> = staging
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let to: Vec<u16> = destination
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    // Staging and destination share a parent. Replacement and copying are forbidden.
    if unsafe { MoveFileExW(from.as_ptr(), to.as_ptr(), MOVEFILE_WRITE_THROUGH) } == 0 {
        Err(ExportError::Io)
    } else {
        Ok(())
    }
}

/// Export the exact legacy archive/sequence/pending trio to a new directory.
/// The destination must be outside the store and must not already exist.
pub fn export_legacy_trio<C: Clock>(
    guard: &ActivityLockGuard,
    destination: &Path,
    clock: &C,
) -> Result<ExportSummary, ExportError> {
    if !destination.is_absolute() || destination.file_name().is_none() {
        return Err(ExportError::InvalidDestination);
    }
    let parent = destination
        .parent()
        .ok_or(ExportError::InvalidDestination)?;
    let metadata = fs::symlink_metadata(parent).map_err(|_| ExportError::InvalidDestination)?;
    if !metadata.is_dir() || metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
        return Err(ExportError::InvalidDestination);
    }
    let parent = fs::canonicalize(parent).map_err(|_| ExportError::InvalidDestination)?;
    if parent.starts_with(guard.root()) {
        return Err(ExportError::InvalidDestination);
    }
    let destination = parent.join(destination.file_name().unwrap());
    match fs::symlink_metadata(&destination) {
        Ok(_) => return Err(ExportError::DestinationExists),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(_) => return Err(ExportError::Io),
    }

    let current = audit_generations(guard.root(), clock)
        .map_err(ExportError::Recovery)?
        .current;
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| ExportError::Io)?
        .as_nanos();
    let staging = parent.join(format!(".enouia-export-{}-{nonce}.tmp", std::process::id()));
    fs::create_dir(&staging).map_err(|_| ExportError::Io)?;
    write_synced(&staging.join("activity.json"), &current.image.activity)?;
    write_synced(&staging.join("sequence.json"), &current.image.sequence)?;
    if let Some(pending) = &current.image.pending {
        write_synced(&staging.join("pending.json"), pending)?;
    }
    publish(&staging, &destination)?;

    Ok(ExportSummary {
        generation_id: current.id,
        highest_reserved: current.validated.highest_reserved,
        activity_sha256: sha256_hex(&current.image.activity),
        sequence_sha256: sha256_hex(&current.image.sequence),
        pending_sha256: current
            .image
            .pending
            .as_ref()
            .map(|bytes| sha256_hex(bytes)),
    })
}
