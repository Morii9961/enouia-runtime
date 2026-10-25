//! Windows local-file grants. Handles pin directory components against replacement.
use crate::{Error, Result};
use std::fs::{self, File, OpenOptions};
use std::os::windows::ffi::OsStrExt;
use std::os::windows::fs::{MetadataExt, OpenOptionsExt};
use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle};
use std::path::{Component, Path, PathBuf, Prefix};
use std::ptr::null_mut;
use windows_sys::Win32::Foundation::LocalFree;
use windows_sys::Win32::Security::Authorization::{
    ConvertSidToStringSidW, ConvertStringSecurityDescriptorToSecurityDescriptorW,
};
use windows_sys::Win32::Security::Cryptography::{
    BCRYPT_USE_SYSTEM_PREFERRED_RNG, BCryptGenRandom,
};
use windows_sys::Win32::Security::*;
use windows_sys::Win32::Storage::FileSystem::*;
use windows_sys::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};

pub struct Directory {
    pub path: PathBuf,
    _handles: Vec<File>,
}
fn io(_: std::io::Error) -> Error {
    Error::UnsafePath
}
fn wide(path: &Path) -> Vec<u16> {
    path.as_os_str().encode_wide().chain(Some(0)).collect()
}
fn local_path(path: &Path) -> Result<()> {
    if !path.is_absolute() || path.as_os_str().encode_wide().any(|v| v == 0) {
        return Err(Error::UnsafePath);
    }
    let mut components = path.components();
    if !matches!(components.next(),Some(Component::Prefix(p)) if matches!(p.kind(),Prefix::Disk(_)|Prefix::VerbatimDisk(_)))
    {
        return Err(Error::UnsafePath);
    }
    for c in components {
        match c {
            Component::RootDir => {}
            Component::Normal(s) if !s.to_string_lossy().contains(':') => {}
            _ => return Err(Error::UnsafePath),
        }
    }
    Ok(())
}
fn checked(file: &File, directory: bool) -> Result<()> {
    let m = file.metadata().map_err(io)?;
    if m.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
        || m.is_dir() != directory
        || (!directory && !m.is_file())
    {
        return Err(Error::UnsafePath);
    }
    // A hard link can alias a file outside a granted source root.
    let mut information = std::mem::MaybeUninit::<BY_HANDLE_FILE_INFORMATION>::zeroed();
    unsafe {
        if GetFileType(file.as_raw_handle()) != FILE_TYPE_DISK
            || GetFileInformationByHandle(file.as_raw_handle(), information.as_mut_ptr()) == 0
        {
            return Err(Error::UnsafePath);
        }
        if !directory && information.assume_init().nNumberOfLinks != 1 {
            return Err(Error::UnsafePath);
        }
    }
    Ok(())
}
pub fn directory(path: &Path) -> Result<Directory> {
    local_path(path)?;
    let mut built = PathBuf::new();
    let mut handles = Vec::new();
    for component in path.components() {
        built.push(component.as_os_str());
        if matches!(component, Component::Prefix(_)) {
            continue;
        }
        let file = OpenOptions::new()
            .read(true)
            .share_mode(FILE_SHARE_READ)
            .custom_flags(FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT)
            .open(&built)
            .map_err(io)?;
        checked(&file, true)?;
        handles.push(file);
    }
    Ok(Directory {
        path: fs::canonicalize(path).map_err(io)?,
        _handles: handles,
    })
}
pub fn read_file(path: &Path) -> Result<File> {
    local_path(path)?;
    let file = OpenOptions::new()
        .read(true)
        .share_mode(FILE_SHARE_READ)
        .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT)
        .open(path)
        .map_err(io)?;
    checked(&file, false)?;
    Ok(file)
}
pub fn write_new(path: &Path, bytes: &[u8]) -> Result<()> {
    local_path(path)?;
    use std::io::Write;
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .share_mode(0)
        .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT)
        .open(path)
        .map_err(|_| Error::StorageFailed)?;
    checked(&file, false)?;
    file.write_all(bytes)
        .and_then(|_| file.sync_all())
        .map_err(|_| Error::StorageFailed)
}
pub fn writer_lock(root: &Directory) -> Result<File> {
    let file = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .share_mode(0)
        .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT)
        .open(root.path.join("writer.lock"))
        .map_err(|e| {
            if e.raw_os_error() == Some(32) {
                Error::Busy
            } else {
                Error::UnsafePath
            }
        })?;
    checked(&file, false)?;
    Ok(file)
}
pub fn disjoint(a: &Path, b: &Path) -> Result<()> {
    let a = PathBuf::from(a.to_string_lossy().to_lowercase());
    let b = PathBuf::from(b.to_string_lossy().to_lowercase());
    if a.starts_with(&b) || b.starts_with(&a) {
        Err(Error::UnsafePath)
    } else {
        Ok(())
    }
}
pub fn data_location(path: &Path) -> Result<()> {
    local_path(path)?;
    if path.components().any(|p| {
        let s = p.as_os_str().to_string_lossy().to_ascii_lowercase();
        s == "onedrive"
            || s.starts_with("onedrive - ")
            || s == "dropbox"
            || s == "googledrive"
            || s == "icloud"
    }) {
        return Err(Error::UnsafePath);
    }
    for p in path.ancestors() {
        if p.join(".git").exists() {
            return Err(Error::UnsafePath);
        }
    }
    if let Ok(exe) = std::env::current_exe()
        && let Some(p) = exe.parent()
    {
        let p = fs::canonicalize(p).map_err(io)?;
        disjoint(path, &p)?;
    }
    Ok(())
}
pub fn random<const N: usize>() -> Result<[u8; N]> {
    let mut bytes = [0; N];
    let length = u32::try_from(N).map_err(|_| Error::StorageFailed)?;
    if unsafe {
        BCryptGenRandom(
            null_mut(),
            bytes.as_mut_ptr(),
            length,
            BCRYPT_USE_SYSTEM_PREFERRED_RNG,
        )
    } < 0
    {
        return Err(Error::StorageFailed);
    }
    Ok(bytes)
}
pub fn uuid() -> Result<String> {
    let mut b = random::<16>()?;
    b[6] = (b[6] & 15) | 64;
    b[8] = (b[8] & 63) | 128;
    let h: String = b.iter().map(|b| format!("{b:02x}")).collect();
    Ok(format!(
        "{}-{}-{}-{}-{}",
        &h[..8],
        &h[8..12],
        &h[12..16],
        &h[16..20],
        &h[20..]
    ))
}

fn user_sid<T>(action: impl FnOnce(PSID) -> Result<T>) -> Result<T> {
    unsafe {
        let mut handle = null_mut();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut handle) == 0 {
            return Err(Error::UnsafePath);
        }
        let handle = OwnedHandle::from_raw_handle(handle);
        let mut length = 0;
        GetTokenInformation(
            handle.as_raw_handle(),
            TokenUser,
            null_mut(),
            0,
            &mut length,
        );
        if length == 0 || length > 4096 {
            return Err(Error::UnsafePath);
        }
        let mut buffer = vec![0_usize; (length as usize).div_ceil(std::mem::size_of::<usize>())];
        if GetTokenInformation(
            handle.as_raw_handle(),
            TokenUser,
            buffer.as_mut_ptr().cast(),
            length,
            &mut length,
        ) == 0
        {
            return Err(Error::UnsafePath);
        }
        action((*(buffer.as_ptr().cast::<TOKEN_USER>())).User.Sid)
    }
}
/// Apply an inheritable, protected current-user + SYSTEM DACL to a NEW ledger root only.
pub fn make_private(path: &Path) -> Result<()> {
    user_sid(|sid| unsafe {
        let mut text = null_mut();
        if ConvertSidToStringSidW(sid, &mut text) == 0 {
            return Err(Error::UnsafePath);
        }
        let mut length = 0;
        while *text.add(length) != 0 {
            length += 1;
            if length > 256 {
                LocalFree(text.cast());
                return Err(Error::UnsafePath);
            }
        }
        let sid = String::from_utf16(std::slice::from_raw_parts(text, length))
            .map_err(|_| Error::UnsafePath);
        LocalFree(text.cast());
        let sid = sid?;
        let sddl: Vec<u16> = format!("D:P(A;OICI;FA;;;SY)(A;OICI;FA;;;{sid})")
            .encode_utf16()
            .chain(Some(0))
            .collect();
        let mut descriptor = null_mut();
        if ConvertStringSecurityDescriptorToSecurityDescriptorW(
            sddl.as_ptr(),
            1,
            &mut descriptor,
            null_mut(),
        ) == 0
        {
            return Err(Error::UnsafePath);
        }
        let result = SetFileSecurityW(
            wide(path).as_ptr(),
            DACL_SECURITY_INFORMATION | PROTECTED_DACL_SECURITY_INFORMATION,
            descriptor,
        );
        LocalFree(descriptor);
        if result == 0 {
            return Err(Error::UnsafePath);
        }
        Ok(())
    })?;
    check_private(path)
}
/// Reopening never silently grants access or repairs a changed descriptor.
pub fn check_private(path: &Path) -> Result<()> {
    check_acl(path, true)
}
pub fn check_file_private(path: &Path) -> Result<()> {
    check_acl(path, false)
}
fn check_acl(path: &Path, protected: bool) -> Result<()> {
    user_sid(|sid| unsafe {
        let mut length = 0;
        GetFileSecurityW(
            wide(path).as_ptr(),
            DACL_SECURITY_INFORMATION,
            null_mut(),
            0,
            &mut length,
        );
        if length == 0 || length > 64 * 1024 {
            return Err(Error::UnsafePath);
        }
        let mut buffer = vec![0_usize; (length as usize).div_ceil(std::mem::size_of::<usize>())];
        let descriptor = buffer.as_mut_ptr().cast();
        if GetFileSecurityW(
            wide(path).as_ptr(),
            DACL_SECURITY_INFORMATION,
            descriptor,
            length,
            &mut length,
        ) == 0
        {
            return Err(Error::UnsafePath);
        }
        let mut control = 0;
        let mut revision = 0;
        if GetSecurityDescriptorControl(descriptor, &mut control, &mut revision) == 0
            || (protected && control & SE_DACL_PROTECTED == 0)
        {
            return Err(Error::UnsafePath);
        }
        let mut present = 0;
        let mut defaulted = 0;
        let mut acl = null_mut();
        if GetSecurityDescriptorDacl(descriptor, &mut present, &mut acl, &mut defaulted) == 0
            || present == 0
            || acl.is_null()
        {
            return Err(Error::UnsafePath);
        }
        let mut system = [0_u32; 17];
        let mut system_length = 68;
        if CreateWellKnownSid(
            WinLocalSystemSid,
            null_mut(),
            system.as_mut_ptr().cast(),
            &mut system_length,
        ) == 0
        {
            return Err(Error::UnsafePath);
        }
        let mut owner = false;
        for i in 0..u32::from((*acl).AceCount) {
            let mut ace = null_mut();
            if GetAce(acl, i, &mut ace) == 0 {
                return Err(Error::UnsafePath);
            }
            let entry = &*(ace.cast::<ACCESS_ALLOWED_ACE>());
            if entry.Header.AceType != 0 {
                return Err(Error::UnsafePath);
            }
            let target = std::ptr::addr_of!(entry.SidStart).cast_mut().cast();
            if EqualSid(target, sid) != 0 {
                owner |= entry.Mask & FILE_ALL_ACCESS == FILE_ALL_ACCESS
                    && u32::from(entry.Header.AceFlags) & INHERIT_ONLY_ACE == 0;
            } else if EqualSid(target, system.as_mut_ptr().cast()) == 0 {
                return Err(Error::UnsafePath);
            }
        }
        if !owner {
            return Err(Error::UnsafePath);
        }
        Ok(())
    })
}
