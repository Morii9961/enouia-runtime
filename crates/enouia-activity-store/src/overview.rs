//! Sanitized, read-only Activity delivery overview from one audited generation.

use crate::ActivityLockGuard;
use crate::generation::{
    LastOutcomes, PublicationRecord, RetryState, last_outcomes_from_delivery, paused_from_delivery,
    publication_from_delivery, retry_from_delivery,
};
use crate::reader::{ReadError, read_current};
use crate::recovery::{RecoveryError, audit_generations};
use enouia_activity_contract::{ActivityData, Batch, exact_activity_timestamp_ms, sha256_hex};
use enouia_common::Clock;
use std::path::Path;

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum OverviewError {
    Recovery(RecoveryError),
    Read(ReadError),
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

/// Pending batch as status readers see it. Its exact bytes stay in the store.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PendingStatus {
    pub batch: Batch,
    pub exact_pending_sha256: String,
    pub age_ms: u64,
    pub retry: Option<RetryState>,
}

/// Everything a local Activity surface may show, from one generation.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ActivityStatus {
    pub archive: ActivityData,
    pub highest_reserved: u64,
    pub paused: bool,
    pub pending: Option<PendingStatus>,
    pub publication: Option<PublicationRecord>,
    pub last_outcomes: Option<LastOutcomes>,
}

/// Lock-free status read: CURRENT is read once and its generation is
/// immutable, so a concurrent writer neither blocks nor tears this view. It
/// runs no recovery, writes nothing and never reports a path.
pub fn read_activity_status<C: Clock>(
    root: &Path,
    clock: &C,
) -> Result<ActivityStatus, OverviewError> {
    let current = read_current(root, clock).map_err(OverviewError::Read)?;
    let delivery = &current.image.delivery;
    let paused = paused_from_delivery(delivery).ok_or(OverviewError::InvalidDelivery)?;
    let now = clock.now_unix_ms();
    if now < 0 {
        return Err(OverviewError::ClockRegression);
    }
    let pending = match (current.validated.pending, current.image.pending.as_deref()) {
        (Some(batch), Some(bytes)) => {
            let created = exact_activity_timestamp_ms(&batch.created_at)
                .ok_or(OverviewError::InvalidDelivery)?;
            let age_ms = now
                .checked_sub(created)
                .and_then(|age| u64::try_from(age).ok())
                .ok_or(OverviewError::ClockRegression)?;
            Some(PendingStatus {
                batch,
                exact_pending_sha256: sha256_hex(bytes),
                age_ms,
                retry: retry_from_delivery(delivery),
            })
        }
        (None, None) => None,
        _ => return Err(OverviewError::InvalidDelivery),
    };
    Ok(ActivityStatus {
        archive: current.validated.archive,
        highest_reserved: current.validated.highest_reserved,
        paused,
        pending,
        publication: publication_from_delivery(delivery),
        last_outcomes: last_outcomes_from_delivery(delivery),
    })
}
