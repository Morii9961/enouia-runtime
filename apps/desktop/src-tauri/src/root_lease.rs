//! Runtime host admission, separate from Memory's per-commit writer lock.
//! Nothing is written inside a Vault. Kernel handle lifetime owns the lease.
use std::path::Path;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RootId {
    volume: u64,
    file: [u8; 16],
}

#[cfg(windows)]
use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle};

pub struct Directory {
    pub id: RootId,
    #[cfg(windows)]
    handle: OwnedHandle,
}

pub struct RootLease {
    pub id: RootId,
    #[cfg(windows)]
    _directory: OwnedHandle,
    #[cfg(windows)]
    _presence: OwnedHandle,
}

impl Directory {
    #[cfg(windows)]
    pub fn inspect(root: &Path) -> Result<Self, &'static str> {
        use std::os::windows::ffi::OsStrExt;
        use windows_sys::Win32::Foundation::INVALID_HANDLE_VALUE;
        use windows_sys::Win32::Storage::FileSystem::{
            CreateFileW, FILE_FLAG_BACKUP_SEMANTICS, FILE_ID_INFO, FILE_READ_ATTRIBUTES,
            FILE_SHARE_READ, FILE_SHARE_WRITE, FileIdInfo, GetFileInformationByHandleEx,
            OPEN_EXISTING,
        };
        let path = root
            .as_os_str()
            .encode_wide()
            .chain(Some(0))
            .collect::<Vec<_>>();
        if path[..path.len() - 1].contains(&0) {
            return Err("root_admission_failed");
        }
        // SAFETY: NUL-terminated native choice; open existing directory only.
        // No delete sharing: keep the claimed directory from being replaced.
        let raw = unsafe {
            CreateFileW(
                path.as_ptr(),
                FILE_READ_ATTRIBUTES,
                FILE_SHARE_READ | FILE_SHARE_WRITE,
                std::ptr::null(),
                OPEN_EXISTING,
                FILE_FLAG_BACKUP_SEMANTICS,
                std::ptr::null_mut(),
            )
        };
        if raw == INVALID_HANDLE_VALUE {
            return Err("root_admission_failed");
        }
        // SAFETY: valid newly owned handle; OwnedHandle closes it on every path.
        let handle = unsafe { OwnedHandle::from_raw_handle(raw) };
        let mut info: FILE_ID_INFO = unsafe { std::mem::zeroed() };
        // SAFETY: correctly sized FILE_ID_INFO buffer, live directory handle.
        if unsafe {
            GetFileInformationByHandleEx(
                handle.as_raw_handle(),
                FileIdInfo,
                (&mut info as *mut FILE_ID_INFO).cast(),
                std::mem::size_of::<FILE_ID_INFO>() as u32,
            )
        } == 0
        {
            return Err("root_admission_failed");
        }
        Ok(Self {
            id: RootId {
                volume: info.VolumeSerialNumber,
                file: info.FileId.Identifier,
            },
            handle,
        })
    }

    #[cfg(not(windows))]
    pub fn inspect(_: &Path) -> Result<Self, &'static str> {
        Err("root_admission_failed")
    }
}

impl RootLease {
    #[cfg(windows)]
    pub fn acquire(directory: Directory) -> Result<Self, &'static str> {
        use windows_sys::Win32::Foundation::{ERROR_ALREADY_EXISTS, GetLastError};
        use windows_sys::Win32::System::Threading::CreateMutexW;
        let file = directory
            .id
            .file
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>();
        let name = format!(
            "Global\\Enouia.Runtime.MemoryRoot.v1.{:016x}.{file}",
            directory.id.volume
        );
        let name = name.encode_utf16().chain(Some(0)).collect::<Vec<_>>();
        // SAFETY: atomic create/open of a named kernel object. No thread owns
        // the mutex: its existence is the presence sentinel, so any worker
        // may drop the handle. Never wait on it or call ReleaseMutex.
        let raw = unsafe { CreateMutexW(std::ptr::null(), 0, name.as_ptr()) };
        let error = unsafe { GetLastError() };
        if raw.is_null() {
            return Err("root_admission_failed");
        }
        let presence = unsafe { OwnedHandle::from_raw_handle(raw) };
        if error == ERROR_ALREADY_EXISTS {
            return Err("root_in_use");
        }
        Ok(Self {
            id: directory.id,
            _directory: directory.handle,
            _presence: presence,
        })
    }

    #[cfg(not(windows))]
    pub fn acquire(_: Directory) -> Result<Self, &'static str> {
        Err("root_admission_failed")
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};
    static N: AtomicU64 = AtomicU64::new(0);
    struct Temporary(std::path::PathBuf);
    impl Temporary {
        fn new() -> Self {
            let root = std::env::temp_dir().join(format!(
                "runtime-root-lease-{}-{}-{}",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos(),
                N.fetch_add(1, Ordering::SeqCst)
            ));
            std::fs::create_dir(&root).unwrap();
            Self(root)
        }
    }
    impl Drop for Temporary {
        fn drop(&mut self) {
            std::fs::remove_dir(&self.0).unwrap();
        }
    }

    #[test]
    fn aliases_compete_but_another_directory_can_open_and_drop_releases() {
        let a = Temporary::new();
        let b = Temporary::new();
        let first = RootLease::acquire(Directory::inspect(&a.0).unwrap()).unwrap();
        let alias = Directory::inspect(&a.0.join(".")).unwrap();
        assert_eq!(first.id, alias.id);
        assert!(matches!(RootLease::acquire(alias), Err("root_in_use")));
        let other = RootLease::acquire(Directory::inspect(&b.0).unwrap()).unwrap();
        assert_ne!(first.id, other.id);
        // Handle lifetime, not Windows mutex thread ownership.
        std::thread::spawn(move || drop(first)).join().unwrap();
        let reopened = RootLease::acquire(Directory::inspect(&a.0).unwrap()).unwrap();
        drop(reopened);
        drop(other);
    }
}
