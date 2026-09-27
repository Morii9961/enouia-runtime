use crate::job::{KillOnCloseJob, error};
use enouia_common::{
    Cancellation, ComponentId, ErrorCode, ProcessOutput, ProcessRequest, ProcessRunner,
    StructuredError,
};
use std::io::{Read, Write};
use std::os::windows::process::CommandExt;
use std::process::{Command, Stdio};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::mpsc::{self, Receiver};
use std::thread;
use std::time::{Duration, Instant};
use windows_sys::Win32::System::Threading::CREATE_NO_WINDOW;

const MAX_CAPTURE_BYTES: usize = 64 * 1024 * 1024;
const POLL_INTERVAL: Duration = Duration::from_millis(25);

/// Runs one hidden Windows child in a kill-on-close job and captures bounded
/// private output. The caller chooses the component reported on errors.
pub struct WindowsProcessRunner {
    component: ComponentId,
}

impl WindowsProcessRunner {
    pub const fn new(component: ComponentId) -> Self {
        Self { component }
    }
}

fn capture(
    mut pipe: impl Read + Send + 'static,
    total: Arc<AtomicUsize>,
    overflow: Arc<AtomicBool>,
    limit: usize,
) -> Receiver<Result<Vec<u8>, ()>> {
    let (sender, receiver) = mpsc::sync_channel(1);
    thread::spawn(move || {
        let mut output = Vec::new();
        let mut buffer = [0_u8; 4096];
        let result = loop {
            match pipe.read(&mut buffer) {
                Ok(0) => break Ok(output),
                Ok(count) => {
                    let previous = total.fetch_add(count, Ordering::Relaxed);
                    if count > limit || previous > limit - count {
                        overflow.store(true, Ordering::Relaxed);
                        break Err(());
                    }
                    output.extend_from_slice(&buffer[..count]);
                }
                Err(error) if error.kind() == std::io::ErrorKind::Interrupted => continue,
                Err(_) => break Err(()),
            }
        };
        let _ = sender.send(result);
    });
    receiver
}

fn receive<T>(receiver: Receiver<T>, deadline: Instant) -> Result<T, ()> {
    receiver
        .recv_timeout(deadline.saturating_duration_since(Instant::now()))
        .map_err(|_| ())
}

impl ProcessRunner for WindowsProcessRunner {
    fn run(
        &self,
        request: &ProcessRequest,
        cancellation: &dyn Cancellation,
    ) -> Result<ProcessOutput, StructuredError> {
        let invalid = || error(ErrorCode::SourceInvalid, self.component);
        if !request.executable.is_absolute()
            || request.timeout.is_zero()
            || request.max_output_bytes == 0
            || request.max_output_bytes > MAX_CAPTURE_BYTES
        {
            return Err(error(ErrorCode::Unconfigured, self.component));
        }
        if cancellation.is_cancelled() {
            return Err(invalid());
        }
        let workdir = request
            .executable
            .parent()
            .filter(|parent| parent.is_dir())
            .ok_or_else(|| error(ErrorCode::Unconfigured, self.component))?;
        let deadline = Instant::now() + request.timeout;
        let job = KillOnCloseJob::create(self.component)?;
        let mut command = Command::new(&request.executable);
        command
            .args(&request.arguments)
            .envs(request.environment.iter().map(|(key, value)| (key, value)))
            .current_dir(workdir)
            .stdin(if request.stdin.is_some() {
                Stdio::piped()
            } else {
                Stdio::null()
            })
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .creation_flags(CREATE_NO_WINDOW);
        let mut child = command
            .spawn()
            .map_err(|_| error(ErrorCode::Unconfigured, self.component))?;
        if let Err(failure) = job.assign(&child, self.component) {
            let _ = child.kill();
            let _ = child.wait();
            return Err(failure);
        }
        let stdout = child.stdout.take().ok_or_else(invalid)?;
        let stderr = child.stderr.take().ok_or_else(invalid)?;
        let total = Arc::new(AtomicUsize::new(0));
        let overflow = Arc::new(AtomicBool::new(false));
        let out = capture(
            stdout,
            Arc::clone(&total),
            Arc::clone(&overflow),
            request.max_output_bytes,
        );
        let err = capture(
            stderr,
            Arc::clone(&total),
            Arc::clone(&overflow),
            request.max_output_bytes,
        );
        let written = request.stdin.as_ref().map(|bytes| {
            let mut stdin = child.stdin.take().expect("piped stdin was configured");
            let bytes = bytes.clone();
            let (sender, receiver) = mpsc::sync_channel(1);
            thread::spawn(move || {
                let _ = sender.send(stdin.write_all(&bytes).is_ok());
            });
            receiver
        });
        let exit_code = loop {
            if cancellation.is_cancelled()
                || overflow.load(Ordering::Relaxed)
                || Instant::now() >= deadline
            {
                return Err(invalid());
            }
            match child.try_wait() {
                Ok(Some(status)) => break status.code(),
                Ok(None) => thread::sleep(POLL_INTERVAL),
                Err(_) => return Err(invalid()),
            }
        };
        // Child descendants may still hold inherited pipes. Closing the job
        // releases them before waiting for the two reader threads to finish.
        drop(job);
        let stdout = receive(out, deadline)
            .and_then(|output| output)
            .map_err(|_| invalid())?;
        let stderr = receive(err, deadline)
            .and_then(|output| output)
            .map_err(|_| invalid())?;
        if let Some(written) = written
            && !receive(written, deadline).map_err(|_| invalid())?
        {
            return Err(invalid());
        }
        if cancellation.is_cancelled() || overflow.load(Ordering::Relaxed) {
            return Err(invalid());
        }
        Ok(ProcessOutput {
            exit_code,
            stdout,
            stderr,
        })
    }
}
