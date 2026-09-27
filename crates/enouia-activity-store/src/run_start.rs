//! Recovery-first decision for a locked Activity invocation.

use crate::ActivityLockGuard;
use crate::recovery::{RecoveryError, audit_generations};
use enouia_activity_contract::{ActivityData, MAX_SAFE_INTEGER};
use enouia_common::Clock;

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RunStartError {
    Recovery(RecoveryError),
    SequenceExhausted,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RunDecision {
    RetryPending {
        generation_id: String,
        sequence: u64,
        exact_bytes: Vec<u8>,
    },
    Collect {
        generation_id: String,
        archive: Box<ActivityData>,
        next_sequence: u64,
    },
}

/// Called with the live writer guard at run start. The caller must keep that
/// guard through retry, collection, commit, and delivery disposition.
pub fn decide_run_start<C: Clock>(
    guard: &ActivityLockGuard,
    clock: &C,
) -> Result<RunDecision, RunStartError> {
    let current = audit_generations(guard.root(), clock)
        .map_err(RunStartError::Recovery)?
        .current;
    if let Some(pending) = &current.validated.pending {
        return Ok(RunDecision::RetryPending {
            generation_id: current.id,
            sequence: pending.sequence,
            exact_bytes: current.image.pending.unwrap(),
        });
    }
    let next_sequence = current
        .validated
        .highest_reserved
        .checked_add(1)
        .filter(|sequence| *sequence <= MAX_SAFE_INTEGER)
        .ok_or(RunStartError::SequenceExhausted)?;
    Ok(RunDecision::Collect {
        generation_id: current.id,
        archive: Box::new(current.validated.archive),
        next_sequence,
    })
}
