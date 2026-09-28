//! SSH exit zero is transport evidence only; it is never a publication receipt.

use enouia_activity_contract::sha256_hex;
use enouia_activity_store::ActivityLockGuard;
use enouia_activity_store::run_start::{RunDecision, RunStartError, decide_run_start};
use enouia_common::{Cancellation, Clock, ErrorCode, ProcessRequest, ProcessRunner};
use std::ffi::OsString;
use std::path::Path;
use std::time::Duration;

const MAX_BATCH_BYTES: usize = 4 * 1024 * 1024;
const MAX_OUTPUT_BYTES: usize = 64 * 1024;

pub struct SshConfig<'a> {
    pub executable: &'a Path,
    pub restricted_alias: &'a str,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TransportCompletedUnverified {
    pub sequence: u64,
    pub exact_pending_sha256: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum TransportError {
    Store(RunStartError),
    NoPending,
    InvalidConfig,
    BatchTooLarge,
    Cancelled,
    Process(ErrorCode),
    NonZeroExit(Option<i32>),
    OutputTooLarge,
}

fn valid_alias(alias: &str) -> bool {
    let bytes = alias.as_bytes();
    !bytes.is_empty()
        && bytes.len() <= 80
        && bytes[0].is_ascii_alphanumeric()
        && bytes[1..]
            .iter()
            .all(|byte| byte.is_ascii_alphanumeric() || *byte == b'_' || *byte == b'-')
}

/// Send one already committed pending batch under the live writer guard.
/// The receiver's exit-zero text is deliberately ignored: it can be a no-op
/// for an equal/lower sequence. Pending must remain until separate proof.
pub fn send_pending_locked<R: ProcessRunner, C: Clock>(
    guard: &ActivityLockGuard,
    clock: &C,
    config: &SshConfig<'_>,
    runner: &R,
    cancellation: &dyn Cancellation,
) -> Result<TransportCompletedUnverified, TransportError> {
    let RunDecision::RetryPending {
        sequence,
        exact_bytes,
        ..
    } = decide_run_start(guard, clock).map_err(TransportError::Store)?
    else {
        return Err(TransportError::NoPending);
    };
    if !config.executable.is_absolute() || !valid_alias(config.restricted_alias) {
        return Err(TransportError::InvalidConfig);
    }
    if exact_bytes.len() > MAX_BATCH_BYTES {
        return Err(TransportError::BatchTooLarge);
    }
    if cancellation.is_cancelled() {
        return Err(TransportError::Cancelled);
    }
    let exact_pending_sha256 = sha256_hex(&exact_bytes);
    let request = ProcessRequest {
        executable: config.executable.to_path_buf(),
        arguments: vec![
            OsString::from("-T"),
            OsString::from("-o"),
            OsString::from("BatchMode=yes"),
            OsString::from("-o"),
            OsString::from("StrictHostKeyChecking=yes"),
            OsString::from("-o"),
            OsString::from("ConnectTimeout=15"),
            OsString::from(config.restricted_alias),
        ],
        environment: Vec::new(),
        stdin: Some(exact_bytes),
        timeout: Duration::from_secs(60),
        max_output_bytes: MAX_OUTPUT_BYTES,
    };
    let output = match runner.run(&request, cancellation) {
        Ok(output) => output,
        Err(_) if cancellation.is_cancelled() => return Err(TransportError::Cancelled),
        Err(error) => return Err(TransportError::Process(error.code)),
    };
    if cancellation.is_cancelled() {
        return Err(TransportError::Cancelled);
    }
    if output.stdout.len() > MAX_OUTPUT_BYTES
        || output.stderr.len() > MAX_OUTPUT_BYTES - output.stdout.len()
    {
        return Err(TransportError::OutputTooLarge);
    }
    if output.exit_code != Some(0) {
        return Err(TransportError::NonZeroExit(output.exit_code));
    }
    Ok(TransportCompletedUnverified {
        sequence,
        exact_pending_sha256,
    })
}
