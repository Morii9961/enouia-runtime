use enouia_common::{Cancellation, ComponentId, ErrorCode, JsonLineSession, StructuredError};
use std::ffi::OsString;
use std::io::{Read, Write};
use std::os::windows::io::AsRawHandle;
use std::os::windows::process::CommandExt;
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, SyncSender, TrySendError};
use std::thread;
use std::time::{Duration, Instant};
use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
use windows_sys::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JobObjectExtendedLimitInformation,
    SetInformationJobObject,
};
use windows_sys::Win32::System::Threading::CREATE_NO_WINDOW;

fn error(code: ErrorCode) -> StructuredError {
    StructuredError {
        code,
        component: ComponentId::ActivityCollectorCodex,
        retryable: true,
    }
}

struct KillOnCloseJob(HANDLE);

impl KillOnCloseJob {
    fn create() -> Result<Self, StructuredError> {
        // SAFETY: null attributes/name create a private, non-inheritable job.
        let handle = unsafe { CreateJobObjectW(std::ptr::null(), std::ptr::null()) };
        if handle.is_null() {
            return Err(error(ErrorCode::SourceInvalid));
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
            return Err(error(ErrorCode::SourceInvalid));
        }
        Ok(job)
    }

    fn assign(&self, child: &Child) -> Result<(), StructuredError> {
        // SAFETY: Child owns the live process handle and this job is still open.
        let ok = unsafe { AssignProcessToJobObject(self.0, child.as_raw_handle() as HANDLE) };
        if ok == 0 {
            Err(error(ErrorCode::SourceInvalid))
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

/// Owns one local app-server process. `Drop` closes its kill-on-close job.
/// The caller must keep this value alive for the entire protocol exchange.
pub struct WindowsJsonLineSession {
    writes: SyncSender<(Vec<u8>, SyncSender<bool>)>,
    lines: Receiver<Vec<u8>>,
    overflow: Arc<AtomicBool>,
    deadline: Instant,
    _child: Child,
    _job: KillOnCloseJob,
}

impl WindowsJsonLineSession {
    pub fn spawn(
        executable: &Path,
        arguments: &[OsString],
        lifetime: Duration,
        max_output_bytes: usize,
    ) -> Result<Self, StructuredError> {
        if !executable.is_absolute() || lifetime.is_zero() || max_output_bytes == 0 {
            return Err(error(ErrorCode::Unconfigured));
        }
        let job = KillOnCloseJob::create()?;
        let mut command = Command::new(executable);
        command
            .args(arguments)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .creation_flags(CREATE_NO_WINDOW);
        let mut child = command
            .spawn()
            .map_err(|_| error(ErrorCode::Unconfigured))?;
        if let Err(failure) = job.assign(&child) {
            let _ = child.kill();
            let _ = child.wait();
            return Err(failure);
        }
        let mut stdin = child
            .stdin
            .take()
            .ok_or_else(|| error(ErrorCode::SourceInvalid))?;
        let mut stdout = child
            .stdout
            .take()
            .ok_or_else(|| error(ErrorCode::SourceInvalid))?;
        let mut stderr = child
            .stderr
            .take()
            .ok_or_else(|| error(ErrorCode::SourceInvalid))?;
        let output_bytes = Arc::new(AtomicUsize::new(0));
        let overflow = Arc::new(AtomicBool::new(false));
        let (writes, pending_writes) = mpsc::sync_channel::<(Vec<u8>, SyncSender<bool>)>(1);
        thread::spawn(move || {
            while let Ok((line, receipt)) = pending_writes.recv() {
                let success = stdin.write_all(&line).is_ok();
                let _ = receipt.send(success);
                if !success {
                    break;
                }
            }
        });
        let (sender, lines) = mpsc::sync_channel(8);
        {
            let output_bytes = Arc::clone(&output_bytes);
            let overflow = Arc::clone(&overflow);
            thread::spawn(move || {
                let mut buffer = [0_u8; 4096];
                let mut line = Vec::new();
                while let Ok(count) = stdout.read(&mut buffer) {
                    if count == 0 {
                        break;
                    }
                    if output_bytes.fetch_add(count, Ordering::Relaxed)
                        > max_output_bytes - count.min(max_output_bytes)
                        || count > max_output_bytes
                    {
                        overflow.store(true, Ordering::Relaxed);
                        break;
                    }
                    for &byte in &buffer[..count] {
                        if byte == b'\n' {
                            if sender.send(std::mem::take(&mut line)).is_err() {
                                return;
                            }
                        } else {
                            line.push(byte);
                        }
                    }
                }
                if !line.is_empty() {
                    overflow.store(true, Ordering::Relaxed);
                }
            });
        }
        {
            let output_bytes = Arc::clone(&output_bytes);
            let overflow = Arc::clone(&overflow);
            thread::spawn(move || {
                let mut buffer = [0_u8; 4096];
                while let Ok(count) = stderr.read(&mut buffer) {
                    if count == 0 {
                        break;
                    }
                    if output_bytes.fetch_add(count, Ordering::Relaxed)
                        > max_output_bytes - count.min(max_output_bytes)
                        || count > max_output_bytes
                    {
                        overflow.store(true, Ordering::Relaxed);
                        break;
                    }
                }
            });
        }
        Ok(Self {
            writes,
            lines,
            overflow,
            deadline: Instant::now() + lifetime,
            _child: child,
            _job: job,
        })
    }
}

impl JsonLineSession for WindowsJsonLineSession {
    fn write_line(
        &mut self,
        line: &[u8],
        cancellation: &dyn Cancellation,
    ) -> Result<(), StructuredError> {
        if cancellation.is_cancelled() || Instant::now() >= self.deadline {
            return Err(error(ErrorCode::SourceInvalid));
        }
        if !line.ends_with(b"\n") || line.len() > 4096 {
            return Err(error(ErrorCode::SourceInvalid));
        }
        let (receipt, written) = mpsc::sync_channel(1);
        let mut pending = (line.to_vec(), receipt);
        loop {
            if cancellation.is_cancelled() || Instant::now() >= self.deadline {
                return Err(error(ErrorCode::SourceInvalid));
            }
            match self.writes.try_send(pending) {
                Ok(()) => break,
                Err(TrySendError::Full(unsent)) => {
                    pending = unsent;
                    thread::sleep(Duration::from_millis(25));
                }
                Err(TrySendError::Disconnected(_)) => {
                    return Err(error(ErrorCode::SourceInvalid));
                }
            }
        }
        loop {
            if cancellation.is_cancelled() {
                return Err(error(ErrorCode::SourceInvalid));
            }
            let remaining = self.deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                return Err(error(ErrorCode::SourceInvalid));
            }
            match written.recv_timeout(remaining.min(Duration::from_millis(25))) {
                Ok(true) => return Ok(()),
                Ok(false) | Err(RecvTimeoutError::Disconnected) => {
                    return Err(error(ErrorCode::SourceInvalid));
                }
                Err(RecvTimeoutError::Timeout) => {}
            }
        }
    }

    fn read_line(
        &mut self,
        timeout: Duration,
        max_bytes: usize,
        cancellation: &dyn Cancellation,
    ) -> Result<Vec<u8>, StructuredError> {
        let deadline = Instant::now() + timeout;
        loop {
            if cancellation.is_cancelled() || self.overflow.load(Ordering::Relaxed) {
                return Err(error(ErrorCode::SourceInvalid));
            }
            let now = Instant::now();
            let remaining = deadline
                .saturating_duration_since(now)
                .min(self.deadline.saturating_duration_since(now));
            if remaining.is_zero() {
                return Err(error(ErrorCode::SourceInvalid));
            }
            match self
                .lines
                .recv_timeout(remaining.min(Duration::from_millis(25)))
            {
                Ok(mut line) => {
                    if line.len() > max_bytes || self.overflow.load(Ordering::Relaxed) {
                        return Err(error(ErrorCode::SourceInvalid));
                    }
                    if line.last() == Some(&b'\r') {
                        line.pop();
                    }
                    return Ok(line);
                }
                Err(RecvTimeoutError::Timeout) => {}
                Err(RecvTimeoutError::Disconnected) => {
                    return Err(error(ErrorCode::SourceInvalid));
                }
            }
        }
    }
}
