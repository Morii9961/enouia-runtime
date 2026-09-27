use enouia_common::{ComponentId, ErrorCode, LockProvider, StructuredError};
use std::fs::{self, File, OpenOptions};
use std::os::windows::fs::{MetadataExt, OpenOptionsExt};
use std::path::Path;

const SHARING_VIOLATION: i32 = 32;
const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0000_0400;
const FILE_FLAG_OPEN_REPARSE_POINT: u32 = 0x0020_0000;

/// A lock guard owns the exclusive Windows file handle. Dropping the guard or
/// terminating its process releases the OS lock; the file may remain on disk.
pub struct ActivityLockGuard {
    _handle: File,
    root: std::path::PathBuf,
}

impl ActivityLockGuard {
    pub fn root(&self) -> &Path {
        &self.root
    }
}

#[derive(Default)]
pub struct WindowsActivityLock;

fn error(code: ErrorCode) -> StructuredError {
    StructuredError {
        code,
        component: ComponentId::ActivityArchive,
        retryable: matches!(code, ErrorCode::Busy | ErrorCode::StorageFailed),
    }
}

impl LockProvider for WindowsActivityLock {
    type Guard = ActivityLockGuard;

    fn try_acquire(&self, path: &Path) -> Result<Self::Guard, StructuredError> {
        if !path.is_absolute() || path.file_name().is_none_or(|name| name != "sync.lock") {
            return Err(error(ErrorCode::Unconfigured));
        }
        let parent = path
            .parent()
            .ok_or_else(|| error(ErrorCode::Unconfigured))?;
        let parent = fs::canonicalize(parent).map_err(|_| error(ErrorCode::StorageFailed))?;
        if !parent.is_dir() {
            return Err(error(ErrorCode::StorageFailed));
        }
        let canonical_lock = parent.join("sync.lock");
        // A pre-existing reparse point is not a managed lock file. The
        // generation store applies its broader root policy before writes.
        match fs::symlink_metadata(&canonical_lock) {
            Ok(metadata) if metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 => {
                return Err(error(ErrorCode::StorageFailed));
            }
            Ok(_) => {}
            Err(io_error) if io_error.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => return Err(error(ErrorCode::StorageFailed)),
        }
        let handle = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .share_mode(0)
            .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT)
            .open(canonical_lock)
            .map_err(|io_error| {
                if io_error.raw_os_error() == Some(SHARING_VIOLATION) {
                    error(ErrorCode::Busy)
                } else {
                    error(ErrorCode::StorageFailed)
                }
            })?;
        if handle
            .metadata()
            .map_err(|_| error(ErrorCode::StorageFailed))?
            .file_attributes()
            & FILE_ATTRIBUTE_REPARSE_POINT
            != 0
        {
            return Err(error(ErrorCode::StorageFailed));
        }
        Ok(ActivityLockGuard {
            _handle: handle,
            root: parent,
        })
    }
}
