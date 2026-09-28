//! Sanitized, read-only Activity delivery overview from one audited generation.

use crate::ActivityLockGuard;
use crate::generation::{RetryState, paused_from_delivery, retry_from_delivery};
use crate::recovery::{RecoveryError, audit_generations};
use enouia_activity_contract::{exact_activity_timestamp_ms, sha256_hex};
use enouia_common::Clock;

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum OverviewError {
    Recovery(RecoveryError),
    InvalidDelivery,
    ClockRegression,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PendingOverview {
    pub sequence: u64,
    pub exact_pending_sha256: String,
    pub age_ms: u64,
    pub retry: Option<RetryState>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DeliveryOverview {
    pub paused: bool,
    pub pending: Option<PendingOverview>,
}

/// Derive age from the durable batch creation time; never persist an age that
/// could become stale after restart. No path or raw pending bytes are returned.
pub fn read_delivery_overview_locked<C: Clock>(
    guard: &ActivityLockGuard,
    clock: &C,
) -> Result<DeliveryOverview, OverviewError> {
    let current = audit_generations(guard.root(), clock)
        .map_err(OverviewError::Recovery)?
        .current;
    let paused =
        paused_from_delivery(&current.image.delivery).ok_or(OverviewError::InvalidDelivery)?;
    let now = clock.now_unix_ms();
    if now < 0 {
        return Err(OverviewError::ClockRegression);
    }
    let pending = current
        .validated
        .pending
        .as_ref()
        .map(|batch| {
            let created = exact_activity_timestamp_ms(&batch.created_at)
                .ok_or(OverviewError::InvalidDelivery)?;
            let age_ms = now
                .checked_sub(created)
                .and_then(|age| u64::try_from(age).ok())
                .ok_or(OverviewError::ClockRegression)?;
            let exact_bytes = current
                .image
                .pending
                .as_deref()
                .ok_or(OverviewError::InvalidDelivery)?;
            Ok(PendingOverview {
                sequence: batch.sequence,
                exact_pending_sha256: sha256_hex(exact_bytes),
                age_ms,
                retry: retry_from_delivery(&current.image.delivery),
            })
        })
        .transpose()?;
    Ok(DeliveryOverview { paused, pending })
}
