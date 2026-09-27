//! Shared, side-effect-free ports and DTOs. Domain state belongs to its own crate.

use serde::{Deserialize, Serialize};
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicI64, Ordering};
use std::time::Duration;

/// Milliseconds since the Unix epoch. Implementations must supply UTC time.
pub trait Clock {
    fn now_unix_ms(&self) -> i64;
}

/// Controllable clock for deterministic contract and domain tests.
#[derive(Debug)]
pub struct FakeClock {
    now_ms: AtomicI64,
}

impl FakeClock {
    pub const fn new(now_ms: i64) -> Self {
        Self {
            now_ms: AtomicI64::new(now_ms),
        }
    }

    pub fn set(&self, now_ms: i64) {
        self.now_ms.store(now_ms, Ordering::SeqCst);
    }
}

impl Clock for FakeClock {
    fn now_unix_ms(&self) -> i64 {
        self.now_ms.load(Ordering::SeqCst)
    }
}

/// Platform adapters decide how to cancel and kill their owned child process tree.
pub trait Cancellation {
    fn is_cancelled(&self) -> bool;
}

/// Private subprocess input. This type deliberately has no Serialize implementation.
#[derive(Debug)]
pub struct ProcessRequest {
    pub executable: PathBuf,
    pub arguments: Vec<OsString>,
    pub environment: Vec<(OsString, OsString)>,
    pub stdin: Option<Vec<u8>>,
    pub timeout: Duration,
    pub max_output_bytes: usize,
}

/// Transient private output for an adapter to validate, never a public/UI DTO.
#[derive(Debug)]
pub struct ProcessOutput {
    pub exit_code: Option<i32>,
    pub stdout: Vec<u8>,
    pub stderr: Vec<u8>,
}

pub trait ProcessRunner {
    fn run(
        &self,
        request: &ProcessRequest,
        cancellation: &dyn Cancellation,
    ) -> Result<ProcessOutput, StructuredError>;
}

/// A bounded bidirectional JSON-lines process session. The platform adapter
/// owns the child process tree and must interrupt blocked I/O on cancellation.
/// `read_line` returns one line without LF and enforces its supplied limits.
pub trait JsonLineSession {
    fn write_line(
        &mut self,
        line: &[u8],
        cancellation: &dyn Cancellation,
    ) -> Result<(), StructuredError>;

    fn read_line(
        &mut self,
        timeout: Duration,
        max_bytes: usize,
        cancellation: &dyn Cancellation,
    ) -> Result<Vec<u8>, StructuredError>;
}

/// Platform implementation must stage, flush, and atomically replace a managed file.
/// B2/A1 prove the exact Windows durability and path restrictions before use.
pub trait AtomicFile {
    fn read(&self, path: &Path) -> Result<Option<Vec<u8>>, StructuredError>;
    fn replace_durable(&self, path: &Path, bytes: &[u8]) -> Result<(), StructuredError>;
}

/// A process-scoped exclusive lock; the guard holds ownership until dropped.
pub trait LockProvider {
    type Guard;

    fn try_acquire(&self, path: &Path) -> Result<Self::Guard, StructuredError>;
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HealthState {
    Healthy,
    Degraded,
    Unavailable,
    Recovering,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OperationalMode {
    Unconfigured,
    Idle,
    Running,
    Paused,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ComponentId {
    Core,
    Vault,
    MemoryIndex,
    Provider,
    Session,
    ActivityCollectorGithub,
    ActivityCollectorCodex,
    ActivityCollectorClaude,
    ActivityArchive,
    ActivityScheduler,
    ActivityDelivery,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthComponent {
    pub id: ComponentId,
    pub state: HealthState,
    pub mode: OperationalMode,
    pub observed_at: Option<String>,
    pub last_success_at: Option<String>,
    pub age_seconds: Option<u64>,
}

/// Stable categories only. Raw subprocess output and paths must not enter this DTO.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    Busy,
    Unconfigured,
    UnsupportedMethod,
    SourceInvalid,
    ClockRegression,
    StorageFailed,
    DeliveryUnverified,
    ContractInvalid,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StructuredError {
    pub code: ErrorCode,
    pub component: ComponentId,
    pub retryable: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fake_clock_can_advance_and_regress() {
        let clock = FakeClock::new(10);
        assert_eq!(clock.now_unix_ms(), 10);
        clock.set(-5);
        assert_eq!(clock.now_unix_ms(), -5);
    }

    #[test]
    fn shared_dtos_use_the_frozen_ipc_names() {
        let health = HealthComponent {
            id: ComponentId::ActivityCollectorCodex,
            state: HealthState::Degraded,
            mode: OperationalMode::Idle,
            observed_at: Some("2026-09-26T08:00:00.000Z".to_owned()),
            last_success_at: None,
            age_seconds: Some(3600),
        };
        assert_eq!(
            serde_json::to_value(health).unwrap(),
            serde_json::json!({
                "id":"activity_collector_codex","state":"degraded","mode":"idle",
                "observedAt":"2026-09-26T08:00:00.000Z","lastSuccessAt":null,"ageSeconds":3600
            })
        );
        let error = StructuredError {
            code: ErrorCode::DeliveryUnverified,
            component: ComponentId::ActivityDelivery,
            retryable: true,
        };
        assert_eq!(
            serde_json::to_value(error).unwrap(),
            serde_json::json!({"code":"delivery_unverified","component":"activity_delivery","retryable":true})
        );
    }
}
