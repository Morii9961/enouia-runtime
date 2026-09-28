//! Locked retry-disposition state for one immutable pending batch.

use crate::ActivityLockGuard;
use crate::generation::{GenerationImage, RetryState, paused_from_delivery, retry_from_delivery};
use crate::recovery::{RecoveryError, audit_generations};
use crate::writer::{CommitError, commit};
use enouia_activity_contract::sha256_hex;
use enouia_common::{Clock, ErrorCode};
use serde_json::Value;

const MAX_RETRY_DELAY_MS: i64 = 24 * 60 * 60 * 1000;

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RetryError {
    Recovery(RecoveryError),
    NoPending,
    InvalidClock,
    InvalidNextEligible,
    CountExhausted,
    InvalidDelivery,
    Commit(CommitError),
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RetryIntent {
    Automatic,
    Manual,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum TransportDecision {
    Eligible {
        generation_id: String,
        sequence: u64,
        exact_bytes: Vec<u8>,
    },
    Deferred {
        generation_id: String,
        sequence: u64,
        next_eligible_at_ms: i64,
    },
    Paused,
    NoPending,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RetryGateError {
    Recovery(RecoveryError),
    InvalidDelivery,
    InvalidClock,
}

/// Decide whether one transport attempt may start. Public observation is a
/// separate read-only path and may still resolve pending during the wait.
pub fn decide_transport_retry_locked<C: Clock>(
    guard: &ActivityLockGuard,
    clock: &C,
    intent: RetryIntent,
) -> Result<TransportDecision, RetryGateError> {
    let current = audit_generations(guard.root(), clock)
        .map_err(RetryGateError::Recovery)?
        .current;
    if paused_from_delivery(&current.image.delivery).ok_or(RetryGateError::InvalidDelivery)? {
        return Ok(TransportDecision::Paused);
    }
    let Some(pending) = current.validated.pending else {
        return Ok(TransportDecision::NoPending);
    };
    let now = clock.now_unix_ms();
    if now < 0 {
        return Err(RetryGateError::InvalidClock);
    }
    let delivery: Value = serde_json::from_slice(&current.image.delivery)
        .map_err(|_| RetryGateError::InvalidDelivery)?;
    let retry = retry_from_delivery(&current.image.delivery);
    if delivery.get("retry").is_some() && retry.is_none() {
        return Err(RetryGateError::InvalidDelivery);
    }
    if let (RetryIntent::Automatic, Some(state)) = (intent, retry)
        && now < state.next_eligible_at_ms
    {
        return Ok(TransportDecision::Deferred {
            generation_id: current.id,
            sequence: pending.sequence,
            next_eligible_at_ms: state.next_eligible_at_ms,
        });
    }
    Ok(TransportDecision::Eligible {
        generation_id: current.id,
        sequence: pending.sequence,
        exact_bytes: current
            .image
            .pending
            .ok_or(RetryGateError::InvalidDelivery)?,
    })
}

/// Persist one sanitized failed-delivery disposition under the live writer
/// lock. Scheduling policy chooses the next time, bounded to 24 hours here.
/// The pending bytes, archive, and high-water sequence stay unchanged.
pub fn record_retry_failure_locked<C: Clock>(
    guard: &ActivityLockGuard,
    clock: &C,
    next_generation_id: &str,
    last_error_code: ErrorCode,
    next_eligible_at_ms: i64,
    transport_attempted: bool,
) -> Result<RetryState, RetryError> {
    let current = audit_generations(guard.root(), clock)
        .map_err(RetryError::Recovery)?
        .current;
    let pending = current
        .validated
        .pending
        .as_ref()
        .ok_or(RetryError::NoPending)?;
    let exact_pending = current
        .image
        .pending
        .as_ref()
        .ok_or(RetryError::NoPending)?;
    let now = clock.now_unix_ms();
    if now < 0 {
        return Err(RetryError::InvalidClock);
    }
    if next_eligible_at_ms < now || next_eligible_at_ms > now.saturating_add(MAX_RETRY_DELAY_MS) {
        return Err(RetryError::InvalidNextEligible);
    }
    let previous = retry_from_delivery(&current.image.delivery);
    let failure_count = previous
        .as_ref()
        .map_or(Some(1), |state| state.failure_count.checked_add(1))
        .ok_or(RetryError::CountExhausted)?;
    let last_transport_at_ms = if transport_attempted {
        Some(now)
    } else {
        previous.and_then(|state| state.last_transport_at_ms)
    };
    if last_transport_at_ms.is_some_and(|at| at > next_eligible_at_ms) {
        return Err(RetryError::InvalidNextEligible);
    }
    let retry = RetryState {
        pending_sequence: pending.sequence,
        exact_pending_sha256: sha256_hex(exact_pending),
        failure_count,
        last_error_code,
        next_eligible_at_ms,
        last_transport_at_ms,
    };
    let mut delivery: Value =
        serde_json::from_slice(&current.image.delivery).map_err(|_| RetryError::InvalidDelivery)?;
    let object = delivery
        .as_object_mut()
        .ok_or(RetryError::InvalidDelivery)?;
    object.insert(
        "retry".to_owned(),
        serde_json::to_value(&retry).map_err(|_| RetryError::InvalidDelivery)?,
    );
    let mut delivery = serde_json::to_vec(&delivery).map_err(|_| RetryError::InvalidDelivery)?;
    delivery.push(b'\n');
    if delivery.len() > 1024 * 1024 {
        return Err(RetryError::InvalidDelivery);
    }
    let image = GenerationImage {
        activity: current.image.activity,
        sequence: current.image.sequence,
        pending: current.image.pending,
        delivery,
    };
    commit(guard, &current.id, next_generation_id, &image, clock).map_err(RetryError::Commit)?;
    Ok(retry)
}
