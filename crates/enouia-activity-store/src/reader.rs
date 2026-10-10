//! Windows read side of the Activity generation store. It never selects a fallback.

use crate::generation::{
    GenerationError, GenerationImage, ValidatedGeneration, valid_generation_id,
};
use enouia_common::Clock;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read};
use std::os::windows::fs::{MetadataExt, OpenOptionsExt};
use std::path::{Path, PathBuf};

const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0000_0400;
const FILE_FLAG_OPEN_REPARSE_POINT: u32 = 0x0020_0000;
pub(crate) const MAX_CURRENT_BYTES: usize = 66;
const MAX_MANIFEST_BYTES: usize = 16 * 1024;
pub(crate) const MAX_SEQUENCE_BYTES: usize = 64;
pub(crate) const MAX_PENDING_BYTES: usize = 4 * 1024 * 1024;
const MAX_DELIVERY_BYTES: usize = 1024 * 1024;
pub(crate) const MAX_ARCHIVE_BYTES: usize = 64 * 1024 * 1024;

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ReadError {
    InvalidRoot,
    MissingCurrent,
    InvalidCurrent,
    MissingGeneration,
    MissingFile,
    ReparsePoint,
    TooLarge,
    Io,
    InvalidGeneration(GenerationError),
}

pub struct LoadedGeneration {
    pub id: String,
    pub image: GenerationImage,
    pub validated: ValidatedGeneration,
}

pub(crate) fn checked_directory(path: &Path, missing: ReadError) -> Result<(), ReadError> {
    let metadata = fs::symlink_metadata(path).map_err(|error| {
        if error.kind() == io::ErrorKind::NotFound {
            missing
        } else {
            ReadError::Io
        }
    })?;
    if metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
        return Err(ReadError::ReparsePoint);
    }
    if !metadata.is_dir() {
        return Err(ReadError::InvalidRoot);
    }
    Ok(())
}

pub(crate) fn read_file(
    path: &Path,
    limit: usize,
    missing: ReadError,
) -> Result<Vec<u8>, ReadError> {
    // Open the reparse point itself, then inspect the opened handle before read.
    let mut file: File = OpenOptions::new()
        .read(true)
        .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT)
        .open(path)
        .map_err(|error| {
            if error.kind() == io::ErrorKind::NotFound {
                missing
            } else {
                ReadError::Io
            }
        })?;
    let metadata = file.metadata().map_err(|_| ReadError::Io)?;
    if metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
        return Err(ReadError::ReparsePoint);
    }
    if !metadata.is_file() {
        return Err(ReadError::Io);
    }
    if metadata.len() > limit as u64 {
        return Err(ReadError::TooLarge);
    }
    let mut bytes = Vec::new();
    file.by_ref()
        .take(limit as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| ReadError::Io)?;
    if bytes.len() > limit {
        return Err(ReadError::TooLarge);
    }
    Ok(bytes)
}

pub(crate) fn read_optional(path: &Path, limit: usize) -> Result<Option<Vec<u8>>, ReadError> {
    match read_file(path, limit, ReadError::MissingFile) {
        Ok(bytes) => Ok(Some(bytes)),
        Err(ReadError::MissingFile) => Ok(None),
        Err(error) => Err(error),
    }
}

/// Read CURRENT exactly once. A broken pointer or generation blocks the read;
/// the caller must not substitute an older directory based on filename order.
pub fn read_current<C: Clock>(root: &Path, clock: &C) -> Result<LoadedGeneration, ReadError> {
    if !root.is_absolute() {
        return Err(ReadError::InvalidRoot);
    }
    checked_directory(root, ReadError::InvalidRoot)?;
    let root: PathBuf = fs::canonicalize(root).map_err(|_| ReadError::Io)?;
    let current = read_file(
        &root.join("CURRENT"),
        MAX_CURRENT_BYTES,
        ReadError::MissingCurrent,
    )?;
    let id = current
        .strip_suffix(b"\n")
        .and_then(|bytes| std::str::from_utf8(bytes).ok())
        .filter(|id| valid_generation_id(id))
        .ok_or(ReadError::InvalidCurrent)?
        .to_owned();
    read_named_generation(&root, &id, clock)
}

pub(crate) fn read_named_generation<C: Clock>(
    root: &Path,
    id: &str,
    clock: &C,
) -> Result<LoadedGeneration, ReadError> {
    if !valid_generation_id(id) {
        return Err(ReadError::InvalidCurrent);
    }
    let generations = root.join("generations");
    checked_directory(&generations, ReadError::MissingGeneration)?;
    let generation = generations.join(id);
    checked_directory(&generation, ReadError::MissingGeneration)?;

    let manifest = read_file(
        &generation.join("manifest.json"),
        MAX_MANIFEST_BYTES,
        ReadError::MissingFile,
    )?;
    let image = GenerationImage {
        activity: read_file(
            &generation.join("activity.json"),
            MAX_ARCHIVE_BYTES,
            ReadError::MissingFile,
        )?,
        sequence: read_file(
            &generation.join("sequence.json"),
            MAX_SEQUENCE_BYTES,
            ReadError::MissingFile,
        )?,
        pending: read_optional(&generation.join("pending.json"), MAX_PENDING_BYTES)?,
        delivery: read_file(
            &generation.join("delivery.json"),
            MAX_DELIVERY_BYTES,
            ReadError::MissingFile,
        )?,
    };
    let validated = image
        .validate(&manifest, id, clock)
        .map_err(ReadError::InvalidGeneration)?;
    Ok(LoadedGeneration {
        id: id.to_owned(),
        image,
        validated,
    })
}
