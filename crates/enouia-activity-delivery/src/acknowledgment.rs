//! Public observation and local pending-clear in one locked operation.

use crate::public_fetch::{PublicFetcher, PublicObservationError, observe_pending_locked};
use enouia_activity_store::ActivityLockGuard;
use enouia_activity_store::reader::{ReadError, read_current};
use enouia_activity_store::writer::{
    CommitError, PublicationEvidence, commit_publication_observed,
};
use enouia_common::{Cancellation, Clock};

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum AcknowledgmentError {
    Observation(PublicObservationError),
    Current(ReadError),
    Commit(CommitError),
}

/// Observe exact public bytes/outcomes first, then atomically record the
/// observation and clear pending in a new immutable generation.
pub fn observe_and_acknowledge_locked<F: PublicFetcher, C: Clock>(
    guard: &ActivityLockGuard,
    clock: &C,
    origin: &str,
    fetcher: &F,
    next_generation_id: &str,
    cancellation: &dyn Cancellation,
) -> Result<(), AcknowledgmentError> {
    let observed = observe_pending_locked(guard, clock, origin, fetcher, cancellation)
        .map_err(AcknowledgmentError::Observation)?;
    if cancellation.is_cancelled() {
        return Err(AcknowledgmentError::Observation(
            PublicObservationError::Cancelled,
        ));
    }
    let current = read_current(guard.root(), clock).map_err(AcknowledgmentError::Current)?;
    let evidence = PublicationEvidence {
        origin: origin.to_owned(),
        sequence: observed.sequence,
        exact_pending_sha256: observed.exact_pending_sha256,
        manifest_sha256: observed.content.manifest_sha256,
        activity_sha256: observed.content.activity_sha256,
        generated_at_ms: observed.content.generated_at_ms,
        published_at_ms: observed.content.published_at_ms,
        received_at_ms: observed.content.received_at_ms,
    };
    commit_publication_observed(guard, &current.id, next_generation_id, &evidence, clock)
        .map_err(AcknowledgmentError::Commit)
}
