//! SSH exit zero is transport evidence only; it is never a publication receipt.

use enouia_activity_contract::sha256_hex;
use enouia_activity_store::ActivityLockGuard;
use enouia_activity_store::retry::{
    RetryGateError, RetryIntent, TransportDecision, decide_transport_retry_locked,
};
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
    Store(RetryGateError),
    NoPending,
    Paused,
    Deferred(i64),
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
    send_pending_locked_with_intent(
        guard,
        clock,
        config,
        runner,
        RetryIntent::Automatic,
        cancellation,
    )
}

/// Manual intent skips only the recorded wait. Pause and the writer lock
/// remain effective, and process exit never clears pending.
pub fn send_pending_locked_with_intent<R: ProcessRunner, C: Clock>(
    guard: &ActivityLockGuard,
    clock: &C,
    config: &SshConfig<'_>,
    runner: &R,
    intent: RetryIntent,
    cancellation: &dyn Cancellation,
) -> Result<TransportCompletedUnverified, TransportError> {
    let (sequence, exact_bytes) =
        match decide_transport_retry_locked(guard, clock, intent).map_err(TransportError::Store)? {
            TransportDecision::Eligible {
                sequence,
                exact_bytes,
                ..
            } => (sequence, exact_bytes),
            TransportDecision::Paused => return Err(TransportError::Paused),
            TransportDecision::NoPending => return Err(TransportError::NoPending),
            TransportDecision::Deferred {
                next_eligible_at_ms,
                ..
            } => {
                return Err(TransportError::Deferred(next_eligible_at_ms));
            }
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
