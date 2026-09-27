use enouia_common::{ComponentId, ErrorCode, StructuredError};
use std::os::windows::io::AsRawHandle;
use std::process::Child;
use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
use windows_sys::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JobObjectExtendedLimitInformation,
    SetInformationJobObject,
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
