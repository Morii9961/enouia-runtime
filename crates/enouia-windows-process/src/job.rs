use enouia_common::{ComponentId, ErrorCode, StructuredError};
use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle};
use std::os::windows::process::CommandExt;
use std::process::{Child, Command};
use windows_sys::Win32::Foundation::{
    CloseHandle, ERROR_NO_MORE_FILES, GetLastError, HANDLE, INVALID_HANDLE_VALUE,
};
use windows_sys::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, TH32CS_SNAPTHREAD, THREADENTRY32, Thread32First, Thread32Next,
};
use windows_sys::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JobObjectExtendedLimitInformation,
    SetInformationJobObject,
};
use windows_sys::Win32::System::Threading::{
    CREATE_NO_WINDOW, CREATE_SUSPENDED, GetProcessIdOfThread, OpenThread, ResumeThread,
    THREAD_QUERY_LIMITED_INFORMATION, THREAD_SUSPEND_RESUME,
};

pub(crate) fn error(code: ErrorCode, component: ComponentId) -> StructuredError {
    StructuredError {
        code,
        component,
        retryable: true,
    }
}

pub(crate) struct KillOnCloseJob(HANDLE);

impl KillOnCloseJob {
    pub(crate) fn create(component: ComponentId) -> Result<Self, StructuredError> {
        // SAFETY: null attributes/name create a private, non-inheritable job.
        let handle = unsafe { CreateJobObjectW(std::ptr::null(), std::ptr::null()) };
        if handle.is_null() {
            return Err(error(ErrorCode::SourceInvalid, component));
        }
        let job = Self(handle);
        let mut limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
        limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        // SAFETY: the pointer and byte count describe the initialized structure.
        let ok = unsafe {
            SetInformationJobObject(
                job.0,
                JobObjectExtendedLimitInformation,
                &raw const limits as *const _,
                std::mem::size_of_val(&limits) as u32,
            )
        };
        if ok == 0 {
            return Err(error(ErrorCode::SourceInvalid, component));
        }
        Ok(job)
    }

    /// The initial thread stays suspended until this exact private Job owns the
    /// child. Keeping Command preserves native argv/env and .cmd handling.
    pub(crate) fn spawn(
        &self,
        command: &mut Command,
        component: ComponentId,
    ) -> Result<Child, StructuredError> {
        let mut child = command
            .creation_flags(CREATE_NO_WINDOW | CREATE_SUSPENDED)
            .spawn()
            .map_err(|_| error(ErrorCode::Unconfigured, component))?;
        if let Err(failure) = self
            .assign(&child, component)
            .and_then(|()| resume_owned_primary(&child, component))
        {
            // No user code has been resumed on failure. Kill/wait only this
            // Child handle; never use process names or a PID termination scan.
            let _ = child.kill();
            let _ = child.wait();
            return Err(failure);
        }
        Ok(child)
    }
    pub(crate) fn assign(
        &self,
        child: &Child,
        component: ComponentId,
    ) -> Result<(), StructuredError> {
        // SAFETY: Child owns the live process handle and this job is still open.
        let ok = unsafe { AssignProcessToJobObject(self.0, child.as_raw_handle() as HANDLE) };
        if ok == 0 {
            Err(error(ErrorCode::SourceInvalid, component))
        } else {
            Ok(())
        }
    }
}

impl Drop for KillOnCloseJob {
    fn drop(&mut self) {
        // SAFETY: this wrapper owns the handle exactly once. Closing it kills
        // all associated processes, including normally inherited children.
        unsafe { CloseHandle(self.0) };
    }
}

fn resume_owned_primary(child: &Child, component: ComponentId) -> Result<(), StructuredError> {
    let failure = || error(ErrorCode::SourceInvalid, component);
    // Snapshot thread metadata only. Handles are opened only for this owned
    // suspended child's unique initial thread. Child retains its process
    // handle throughout, preventing reuse of its process ID.
    let raw = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0) };
    if raw == INVALID_HANDLE_VALUE {
        return Err(failure());
    }
    let snapshot = unsafe { OwnedHandle::from_raw_handle(raw) };
    let mut entry = THREADENTRY32 {
        dwSize: std::mem::size_of::<THREADENTRY32>() as u32,
        ..Default::default()
    };
    if unsafe { Thread32First(snapshot.as_raw_handle(), &mut entry) } == 0 {
        return Err(failure());
    }
    let mut initial = None;
    loop {
        // ToolHelp may return a shorter structure; read only present fields.
        if (entry.dwSize as usize)
            < std::mem::offset_of!(THREADENTRY32, th32OwnerProcessID) + std::mem::size_of::<u32>()
        {
            return Err(failure());
        }
        if entry.th32OwnerProcessID == child.id() && initial.replace(entry.th32ThreadID).is_some() {
            return Err(failure());
        }
        entry.dwSize = std::mem::size_of::<THREADENTRY32>() as u32;
        if unsafe { Thread32Next(snapshot.as_raw_handle(), &mut entry) } == 0 {
            if unsafe { GetLastError() } != ERROR_NO_MORE_FILES {
                return Err(failure());
            }
            break;
        }
    }
    let id = initial.ok_or_else(failure)?;
    let raw = unsafe {
        OpenThread(
            THREAD_SUSPEND_RESUME | THREAD_QUERY_LIMITED_INFORMATION,
            0,
            id,
        )
    };
    if raw.is_null() {
        return Err(failure());
    }
    let thread = unsafe { OwnedHandle::from_raw_handle(raw) };
    // Recheck identity after opening to refuse a stale or foreign snapshot.
    // Exactly one suspended thread must exist; injected/missing/extra threads
    // fail closed, without touching a thread belonging to another process.
    if unsafe { GetProcessIdOfThread(thread.as_raw_handle()) } != child.id()
        || unsafe { ResumeThread(thread.as_raw_handle()) } != 1
    {
        return Err(failure());
    }
    Ok(())
}

#[cfg(test)]
#[path = "job_tests.rs"]
mod tests;
