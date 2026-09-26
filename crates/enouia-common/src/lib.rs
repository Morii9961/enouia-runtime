//! Shared, side-effect-free ports and DTOs. Domain state belongs to its own crate.

use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicI64, Ordering};

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
