use enouia_common::{ComponentId, ErrorCode, LockProvider, StructuredError};
use std::fs::{self, File, OpenOptions};
use std::os::windows::fs::OpenOptionsExt;
use std::path::Path;

const SHARING_VIOLATION: i32 = 32;

/// A lock guard owns the exclusive Windows file handle. Dropping the guard or
/// terminating its process releases the OS lock; the file may remain on disk.
pub struct ActivityLockGuard {
    _handle: File,
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
        // A pre-existing symlink is not a managed lock file. The generation
        // store will apply its broader reparse-point policy before writes.
        match fs::symlink_metadata(&canonical_lock) {
            Ok(metadata) if metadata.file_type().is_symlink() => {
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
            .open(canonical_lock)
            .map_err(|io_error| {
                if io_error.raw_os_error() == Some(SHARING_VIOLATION) {
                    error(ErrorCode::Busy)
                } else {
                    error(ErrorCode::StorageFailed)
                }
            })?;
        Ok(ActivityLockGuard { _handle: handle })
    }
}
