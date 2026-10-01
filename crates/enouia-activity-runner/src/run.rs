use crate::collectors::Collector;
use crate::config::Config;
use enouia_activity::merge_activity;
use enouia_activity_contract::{
    Batch, ResultKind, format_activity_timestamp, normalize_batch, public_data_bytes,
    validate_failed_retention, validate_publishable_batch,
};
use enouia_activity_delivery::acknowledgment::{
    AcknowledgmentError, observe_and_acknowledge_locked,
};
use enouia_activity_delivery::public_fetch::{
    FetchError, FetchedResponse, PublicFetcher, PublicObservationError,
};
use enouia_activity_delivery::ssh::{SshConfig, TransportError, send_pending_locked_with_intent};
use enouia_activity_store::ActivityLockGuard;
use enouia_activity_store::generation::GenerationImage;
use enouia_activity_store::reader::read_current;
use enouia_activity_store::retry::{RetryIntent, record_retry_failure_locked};
use enouia_activity_store::run_start::{RunDecision, decide_run_start};
use enouia_activity_store::writer::commit;
use enouia_common::{Cancellation, Clock, ErrorCode, ProcessRunner};
use serde::Serialize;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

#[derive(Clone, Copy, PartialEq)]
pub enum Command {
    Sync,
    RetryPending,
}

pub struct Ports<'a, C, A, R, F> {
    pub clock: &'a C,
    pub collector: &'a A,
    pub process: &'a R,
    pub fetcher: &'a F,
    pub cancellation: &'a dyn Cancellation,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunSummary {
    pub schema_version: u8,
    pub state: &'static str,
    pub exit_code: u8,
    pub collection_attempted: bool,
    pub source_failures: usize,
    pub sequence: Option<u64>,
    pub transport_attempted: bool,
    pub transport_completed: bool,
    pub publication_observed: bool,
    pub next_eligible_at_ms: Option<i64>,
    pub error_code: Option<ErrorCode>,
}

impl Default for RunSummary {
    fn default() -> Self {
        Self {
            schema_version: 1,
            state: "completed",
            exit_code: 0,
            collection_attempted: false,
            source_failures: 0,
            sequence: None,
            transport_attempted: false,
            transport_completed: false,
            publication_observed: false,
            next_eligible_at_ms: None,
            error_code: None,
        }
    }
}

struct Failure {
    state: &'static str,
    code: ErrorCode,
    exit: u8,
}
fn storage() -> Failure {
    Failure {
        state: "storage_failed",
        code: ErrorCode::StorageFailed,
        exit: 6,
    }
}
fn cancelled() -> Failure {
    Failure {
        state: "cancelled",
        code: ErrorCode::DeliveryUnverified,
        exit: 3,
    }
}
fn invalid_config() -> Failure {
    Failure {
        state: "invalid_config",
        code: ErrorCode::Unconfigured,
        exit: 5,
    }
}
fn check_cancel(cancellation: &dyn Cancellation) -> Result<(), Failure> {
    if cancellation.is_cancelled() {
        Err(cancelled())
    } else {
        Ok(())
    }
}

pub fn generation_id() -> String {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_nanos());
    format!(
        "g-run-{}-{nonce:x}-{}",
        std::process::id(),
        COUNTER.fetch_add(1, Ordering::Relaxed)
    )
}

/// One caller-owned writer lock covers recovery, collectors, commit, transport,
/// retry disposition and observation. The executable acquires it exactly once.
pub fn run_locked<C: Clock, A: Collector, R: ProcessRunner, F: PublicFetcher>(
    guard: &ActivityLockGuard,
    config: &Config,
    command: Command,
    ports: &Ports<'_, C, A, R, F>,
) -> RunSummary {
    let mut summary = RunSummary::default();
    if let Err(failure) = execute(guard, config, command, ports, &mut summary) {
        summary.state = failure.state;
        summary.error_code = (failure.state != "cancelled").then_some(failure.code);
        summary.exit_code = failure.exit;
    }
    summary
}

fn execute<C: Clock, A: Collector, R: ProcessRunner, F: PublicFetcher>(
    guard: &ActivityLockGuard,
    config: &Config,
    command: Command,
    ports: &Ports<'_, C, A, R, F>,
    summary: &mut RunSummary,
) -> Result<(), Failure> {
    config.validate().map_err(|_| invalid_config())?;
    if std::fs::canonicalize(&config.data_root).map_err(|_| invalid_config())? != guard.root() {
        return Err(invalid_config());
    }
    check_cancel(ports.cancellation)?;
    match decide_run_start(guard, ports.clock).map_err(|_| storage())? {
        RunDecision::Paused {
            pending_sequence, ..
        } => {
            summary.sequence = pending_sequence;
            summary.state = "paused";
            summary.exit_code = 3;
        }
        RunDecision::RetryPending { sequence, .. } => {
            summary.sequence = Some(sequence);
            let current = read_current(guard.root(), ports.clock).map_err(|_| storage())?;
            let batch = current.validated.pending.ok_or_else(storage)?;
            summary.source_failures = [
                &batch.sources.github,
                &batch.sources.codex,
                &batch.sources.claude,
            ]
            .iter()
            .filter(|o| o.result == ResultKind::Failed)
            .count();
            // Lost acknowledgments can be resolved even before retry eligibility.
            deliver(guard, config, command, ports, summary, true)?;
            // End this invocation after resolving the old pending. The next
            // invocation may collect; this keeps the single-send bound explicit.
        }
        RunDecision::Collect {
            archive,
            next_sequence,
            ..
        } => {
            if command == Command::RetryPending {
                summary.state = "no_pending";
                return Ok(());
            }
            let attempted_ms = ports.clock.now_unix_ms();
            let attempted_at = format_activity_timestamp(attempted_ms)
                .filter(|_| attempted_ms >= 0)
                .ok_or(Failure {
                    state: "clock_regression",
                    code: ErrorCode::ClockRegression,
                    exit: 6,
                })?;
            summary.collection_attempted = true;
            let attempts = ports
                .collector
                .collect(&attempted_at, ports.cancellation)
                .map_err(|_| cancelled())?;
            check_cancel(ports.cancellation)?;
            let merged =
                merge_activity(&archive, attempts, ports.clock).map_err(|error| Failure {
                    state: "collection_invalid",
                    code: if matches!(error, enouia_activity::MergeError::ClockRegression) {
                        ErrorCode::ClockRegression
                    } else {
                        ErrorCode::ContractInvalid
                    },
                    exit: 6,
                })?;
            let created_ms = ports.clock.now_unix_ms();
            if created_ms < attempted_ms {
                return Err(Failure {
                    state: "clock_regression",
                    code: ErrorCode::ClockRegression,
                    exit: 6,
                });
            }
            let batch = Batch {
                version: 1,
                producer: "morii-workstation".to_owned(),
                sequence: next_sequence,
                created_at: format_activity_timestamp(created_ms).ok_or_else(storage)?,
                sources: merged.outcomes,
                data: merged.data,
            };
            let normalized = normalize_batch(
                &serde_json::to_value(&batch).map_err(|_| storage())?,
                ports.clock,
            )
            .map_err(|_| storage())?;
            validate_publishable_batch(&normalized).map_err(|_| Failure {
                state: "unpublishable_history",
                code: ErrorCode::ContractInvalid,
                exit: 6,
            })?;
            validate_failed_retention(&normalized, &archive).map_err(|_| storage())?;
            summary.source_failures = [
                &normalized.sources.github,
                &normalized.sources.codex,
                &normalized.sources.claude,
            ]
            .iter()
            .filter(|o| o.result == ResultKind::Failed)
            .count();
            let mut pending = serde_json::to_vec(&normalized).map_err(|_| storage())?;
            pending.push(b'\n');
            // Reject without truncating history or reserving a sequence.
            if pending.len() > 4 * 1024 * 1024 {
                return Err(Failure {
                    state: "batch_too_large",
                    code: ErrorCode::ContractInvalid,
                    exit: 6,
                });
            }
            let current = read_current(guard.root(), ports.clock).map_err(|_| storage())?;
            let image = GenerationImage {
                activity: public_data_bytes(&normalized.data).map_err(|_| storage())?,
                sequence: format!("{{\"sequence\":{next_sequence}}}\n").into_bytes(),
                pending: Some(pending),
                delivery: current.image.delivery,
            };
            check_cancel(ports.cancellation)?;
            commit(guard, &current.id, &generation_id(), &image, ports.clock)
                .map_err(|_| storage())?;
            summary.sequence = Some(next_sequence);
            deliver(guard, config, command, ports, summary, false)?;
        }
    }
    Ok(())
}

fn observe<C: Clock, A, R, F: PublicFetcher>(
    guard: &ActivityLockGuard,
    origin: &str,
    ports: &Ports<'_, C, A, R, F>,
) -> Result<bool, Failure> {
    match observe_and_acknowledge_locked(
        guard,
        ports.clock,
        origin,
        ports.fetcher,
        &generation_id(),
        ports.cancellation,
    ) {
        Ok(()) => Ok(true),
        Err(AcknowledgmentError::Current(_) | AcknowledgmentError::Commit(_)) => Err(storage()),
        Err(AcknowledgmentError::Observation(error)) => match error {
            PublicObservationError::Store(_)
            | PublicObservationError::InvalidPending
            | PublicObservationError::NoPending => Err(storage()),
            PublicObservationError::InvalidOrigin => Err(invalid_config()),
            PublicObservationError::Cancelled => Err(cancelled()),
            PublicObservationError::Paused => Err(Failure {
                state: "paused",
                code: ErrorCode::Busy,
                exit: 3,
            }),
            _ => Ok(false),
        },
    }
}

fn published(summary: &mut RunSummary) {
    summary.state = "publication_observed";
    summary.publication_observed = true;
    summary.exit_code = if summary.source_failures > 0 { 2 } else { 0 };
}

struct BudgetFetcher<'a, F> {
    inner: &'a F,
    deadline: Option<Instant>,
}
impl<F: PublicFetcher> PublicFetcher for BudgetFetcher<'_, F> {
    fn fetch(
        &self,
        url: &str,
        limit: usize,
        timeout: Duration,
        cancellation: &dyn Cancellation,
    ) -> Result<FetchedResponse, FetchError> {
        let timeout = self.deadline.map_or(timeout, |deadline| {
            timeout.min(deadline.saturating_duration_since(Instant::now()))
        });
        if timeout.is_zero() {
            return Err(FetchError::Timeout);
        }
        self.inner.fetch(url, limit, timeout, cancellation)
    }
}

fn deliver<C: Clock, A: Collector, R: ProcessRunner, F: PublicFetcher>(
    guard: &ActivityLockGuard,
    config: &Config,
    command: Command,
    ports: &Ports<'_, C, A, R, F>,
    summary: &mut RunSummary,
    preobserve: bool,
) -> Result<(), Failure> {
    if !config.delivery_enabled {
        summary.state = "delivery_disabled";
        summary.exit_code = 4;
        return Ok(());
    }
    let d = config.delivery.as_ref().ok_or_else(invalid_config)?;
    if preobserve && observe(guard, &d.public_origin, ports)? {
        published(summary);
        return Ok(());
    }
    check_cancel(ports.cancellation)?;
    let intent = if command == Command::RetryPending {
        RetryIntent::Manual
    } else {
        RetryIntent::Automatic
    };
    let error_code = match send_pending_locked_with_intent(
        guard,
        ports.clock,
        &SshConfig {
            executable: &d.ssh_executable,
            restricted_alias: &d.restricted_alias,
        },
        ports.process,
        intent,
        ports.cancellation,
    ) {
        Ok(_) => {
            summary.transport_attempted = true;
            summary.transport_completed = true;
            ErrorCode::DeliveryUnverified
        }
        Err(TransportError::Deferred(time)) => {
            summary.state = "not_due";
            summary.exit_code = 3;
            summary.next_eligible_at_ms = Some(time);
            return Ok(());
        }
        Err(
            TransportError::Store(_) | TransportError::NoPending | TransportError::BatchTooLarge,
        ) => return Err(storage()),
        Err(TransportError::InvalidConfig) => return Err(invalid_config()),
        Err(TransportError::Cancelled) => return Err(cancelled()),
        Err(TransportError::Paused) => {
            summary.state = "paused";
            summary.exit_code = 3;
            return Ok(());
        }
        Err(TransportError::Process(code)) => {
            summary.transport_attempted = true;
            if code == ErrorCode::Unconfigured {
                return Err(invalid_config());
            }
            code
        }
        Err(TransportError::NonZeroExit(_) | TransportError::OutputTooLarge) => {
            summary.transport_attempted = true;
            ErrorCode::DeliveryUnverified
        }
    };
    // A disconnected transport may have been accepted; observe before retrying.
    let deadline = Instant::now() + Duration::from_secs(d.observation_seconds);
    let fetcher = BudgetFetcher {
        inner: ports.fetcher,
        deadline: (d.observation_seconds > 0).then_some(deadline),
    };
    let poll_ports = Ports {
        clock: ports.clock,
        collector: ports.collector,
        process: ports.process,
        fetcher: &fetcher,
        cancellation: ports.cancellation,
    };
    loop {
        check_cancel(ports.cancellation)?;
        if observe(guard, &d.public_origin, &poll_ports)? {
            published(summary);
            return Ok(());
        }
        if Instant::now() >= deadline {
            break;
        }
        let wait_until = (Instant::now() + Duration::from_secs(5)).min(deadline);
        while Instant::now() < wait_until {
            check_cancel(ports.cancellation)?;
            std::thread::sleep(
                Duration::from_millis(50).min(wait_until.saturating_duration_since(Instant::now())),
            );
        }
    }
    let next_time = ports
        .clock
        .now_unix_ms()
        .checked_add((d.retry_seconds * 1000) as i64)
        .ok_or_else(storage)?;
    record_retry_failure_locked(
        guard,
        ports.clock,
        &generation_id(),
        error_code,
        next_time,
        true,
    )
    .map_err(|_| storage())?;
    summary.state = "delivery_unresolved";
    summary.exit_code = 4;
    summary.error_code = Some(error_code);
    summary.next_eligible_at_ms = Some(next_time);
    Ok(())
}

pub struct SystemClock;
impl Clock for SystemClock {
    fn now_unix_ms(&self) -> i64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .ok()
            .and_then(|d| i64::try_from(d.as_millis()).ok())
            .unwrap_or(-1)
    }
}

pub struct DeadlineCancellation {
    deadline: Instant,
}
impl DeadlineCancellation {
    pub fn new(seconds: u64) -> Self {
        Self {
            deadline: Instant::now() + Duration::from_secs(seconds),
        }
    }
}
impl Cancellation for DeadlineCancellation {
    fn is_cancelled(&self) -> bool {
        Instant::now() >= self.deadline
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;

    struct Probe {
        calls: Cell<usize>,
        timeout: Cell<Duration>,
    }
    impl PublicFetcher for Probe {
        fn fetch(
            &self,
            _: &str,
            _: usize,
            timeout: Duration,
            _: &dyn Cancellation,
        ) -> Result<FetchedResponse, FetchError> {
            self.calls.set(self.calls.get() + 1);
            self.timeout.set(timeout);
            Err(FetchError::Unavailable)
        }
    }
    struct Never;
    impl Cancellation for Never {
        fn is_cancelled(&self) -> bool {
            false
        }
    }

    #[test]
    fn observation_fetches_cannot_outlive_the_shared_polling_deadline() {
        let probe = Probe {
            calls: Cell::new(0),
            timeout: Cell::new(Duration::ZERO),
        };
        let fetcher = BudgetFetcher {
            inner: &probe,
            deadline: Some(Instant::now() + Duration::from_secs(1)),
        };
        assert!(matches!(
            fetcher.fetch("http://127.0.0.1", 1024, Duration::from_secs(15), &Never),
            Err(FetchError::Unavailable)
        ));
        assert!(
            probe.timeout.get() > Duration::ZERO && probe.timeout.get() <= Duration::from_secs(1)
        );
        let expired = BudgetFetcher {
            inner: &probe,
            deadline: Some(Instant::now()),
        };
        assert!(matches!(
            expired.fetch("http://127.0.0.1", 1024, Duration::from_secs(15), &Never),
            Err(FetchError::Timeout)
        ));
        assert_eq!(probe.calls.get(), 1);
    }
}
