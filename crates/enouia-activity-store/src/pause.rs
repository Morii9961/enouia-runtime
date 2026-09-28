//! Locked persistence for the Activity pause flag.

use crate::ActivityLockGuard;
use crate::generation::{GenerationImage, paused_from_delivery};
use crate::recovery::{RecoveryError, audit_generations};
use crate::writer::{CommitError, commit};
use enouia_common::Clock;
use serde_json::Value;

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum PauseError {
    Recovery(RecoveryError),
    InvalidDelivery,
    Commit(CommitError),
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum PauseOutcome {
    Unchanged { generation_id: String },
    Changed { generation_id: String, paused: bool },
}

/// Update only operational state under the same writer lock as a sync run.
/// A no-op does not create a new generation or consume a sequence.
pub fn set_paused_locked<C: Clock>(
    guard: &ActivityLockGuard,
    clock: &C,
    next_generation_id: &str,
    paused: bool,
) -> Result<PauseOutcome, PauseError> {
    let current = audit_generations(guard.root(), clock)
        .map_err(PauseError::Recovery)?
        .current;
    let previous =
        paused_from_delivery(&current.image.delivery).ok_or(PauseError::InvalidDelivery)?;
    if previous == paused {
        return Ok(PauseOutcome::Unchanged {
            generation_id: current.id,
        });
    }
    let mut delivery: Value =
        serde_json::from_slice(&current.image.delivery).map_err(|_| PauseError::InvalidDelivery)?;
    let object = delivery
        .as_object_mut()
        .ok_or(PauseError::InvalidDelivery)?;
    object.insert("paused".to_owned(), Value::Bool(paused));
    let mut delivery = serde_json::to_vec(&delivery).map_err(|_| PauseError::InvalidDelivery)?;
    delivery.push(b'\n');
    if delivery.len() > 1024 * 1024 {
        return Err(PauseError::InvalidDelivery);
    }
    let image = GenerationImage {
        activity: current.image.activity,
        sequence: current.image.sequence,
        pending: current.image.pending,
        delivery,
    };
    commit(guard, &current.id, next_generation_id, &image, clock).map_err(PauseError::Commit)?;
    Ok(PauseOutcome::Changed {
        generation_id: next_generation_id.to_owned(),
        paused,
    })
}
