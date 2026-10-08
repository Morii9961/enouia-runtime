//! Activity IPC v1 read DTOs (contracts/ipc/activity-v1.schema.json) for the
//! local desktop surface. Built from one lock-free generation read; nothing
//! here collects, sends, writes or reports a path.

use crate::config::{Config, Mode};
use enouia_activity_contract::{
    ActivityData, Snapshot, activity_timestamp_ms, format_activity_timestamp, public_data_bytes,
    sha256_hex,
};
use enouia_activity_store::generation::StoredOutcome;
use enouia_activity_store::overview::ActivityStatus;
use enouia_common::{
    ComponentId, ErrorCode, HealthComponent, HealthState, OperationalMode, StructuredError,
};
use serde_json::{Value, json};

/// Moriium's checked activity freshness window (Architecture section 13).
pub const STALE_AFTER_MS: i64 = 3 * 60 * 60 * 1000;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum Freshness {
    NoData,
    Fresh,
    Stale,
    Failed,
}

impl Freshness {
    fn label(self) -> &'static str {
        match self {
            Self::NoData => "no_data",
            Self::Fresh => "fresh",
            Self::Stale => "stale",
            Self::Failed => "failed",
        }
    }
}

fn iso(ms: i64) -> Option<String> {
    format_activity_timestamp(ms)
}

fn age_seconds(now_ms: i64, at: &str) -> Option<u64> {
    activity_timestamp_ms(at)
        .and_then(|at| now_ms.checked_sub(at))
        .filter(|age| *age >= 0)
        .and_then(|age| u64::try_from(age / 1000).ok())
}

struct SourceView<'a> {
    snapshot: &'a Option<Snapshot>,
    attempt: Option<(String, Option<String>, &'static str)>,
    freshness: Freshness,
}

fn outcome(stored: &StoredOutcome) -> (String, Option<String>, &'static str) {
    let result = if stored.result == "success" {
        "success"
    } else {
        "failed"
    };
    (
        stored.attempted_at.clone(),
        stored.succeeded_at.clone(),
        result,
    )
}

fn source_view<'a>(
    snapshot: &'a Option<Snapshot>,
    attempt: Option<(String, Option<String>, &'static str)>,
    now_ms: i64,
) -> SourceView<'a> {
    let freshness = match snapshot {
        None => Freshness::NoData,
        Some(_) if attempt.as_ref().is_some_and(|a| a.2 == "failed") => Freshness::Failed,
        Some(s) => match activity_timestamp_ms(&s.updated_at) {
            Some(at) if (0..=STALE_AFTER_MS).contains(&now_ms.saturating_sub(at)) => {
                Freshness::Fresh
            }
            _ => Freshness::Stale,
        },
    };
    SourceView {
        snapshot,
        attempt,
        freshness,
    }
}

fn source_summary(view: &SourceView, timezone: &str, metric: &str) -> Value {
    let days = view
        .snapshot
        .as_ref()
        .map(|s| s.days.as_slice())
        .unwrap_or(&[]);
    // Contract validation already bounds the per-source sum to a safe integer.
    let total: u64 = days.iter().map(|day| day.value).sum();
    json!({
        "timezone": timezone,
        "metric": metric,
        "recordedDays": days.len(),
        "firstDate": days.first().map(|d| &d.date),
        "lastDate": days.last().map(|d| &d.date),
        "total": total.to_string(),
        "lastAttemptAt": view.attempt.as_ref().map(|a| &a.0),
        "lastSuccessAt": view.snapshot.as_ref().map(|s| &s.updated_at),
        "lastResult": view.attempt.as_ref().map_or("unknown", |a| a.2),
        "freshness": view.freshness.label(),
    })
}

fn health(
    id: ComponentId,
    state: HealthState,
    mode: OperationalMode,
    observed_at: &Option<String>,
    last_success_at: Option<String>,
    now_ms: i64,
) -> HealthComponent {
    let age_seconds = last_success_at
        .as_deref()
        .and_then(|at| age_seconds(now_ms, at));
    HealthComponent {
        id,
        state,
        mode,
        observed_at: observed_at.clone(),
        last_success_at,
        age_seconds,
    }
}

/// `activity_overview`: per-source summaries, delivery state and health.
pub fn overview(status: &ActivityStatus, config: &Config, now_ms: i64) -> Value {
    let pending = status.pending.as_ref();
    let attempts =
        |pick: fn(
            &enouia_activity_contract::BatchSources,
        ) -> &enouia_activity_contract::SourceOutcome,
         stored: fn(&enouia_activity_store::generation::StoredOutcomes) -> &StoredOutcome| {
            if let Some(pending) = pending {
                let o = pick(&pending.batch.sources);
                let result = match o.result {
                    enouia_activity_contract::ResultKind::Success => "success",
                    enouia_activity_contract::ResultKind::Failed => "failed",
                };
                Some((o.attempted_at.clone(), o.succeeded_at.clone(), result))
            } else {
                status
                    .last_outcomes
                    .as_ref()
                    .map(|last| outcome(stored(&last.sources)))
            }
        };
    let sources = &status.archive.sources;
    let github = source_view(
        &sources.github,
        attempts(|s| &s.github, |s| &s.github),
        now_ms,
    );
    let codex = source_view(&sources.codex, attempts(|s| &s.codex, |s| &s.codex), now_ms);
    let claude = source_view(
        &sources.claude,
        attempts(|s| &s.claude, |s| &s.claude),
        now_ms,
    );

    let mode = if status.paused {
        OperationalMode::Paused
    } else {
        OperationalMode::Idle
    };
    let retry = pending.and_then(|p| p.retry.as_ref());
    let delivery_state = if status.paused {
        "paused"
    } else if pending.is_some() {
        if !config.delivery_enabled {
            "unconfigured"
        } else if retry.is_some_and(|r| r.last_error_code == ErrorCode::DeliveryUnverified) {
            "unverified"
        } else if retry.is_some_and(|r| r.last_transport_at_ms.is_some()) {
            "transported"
        } else {
            "pending"
        }
    } else if status.publication.is_some() {
        "observed"
    } else {
        "idle"
    };
    let publication_observed_at =
        status
            .publication
            .as_ref()
            .and_then(|receipt| match &status.last_outcomes {
                Some(last) if last.sequence == receipt.sequence => iso(last.observed_at_ms),
                // The public manifest's generation time is not the local
                // observation time. Older receipts did not record that fact.
                _ => None,
            });
    let observed_at = iso(now_ms);
    let mut components = Vec::new();
    for (id, view) in [
        (ComponentId::ActivityCollectorGithub, &github),
        (ComponentId::ActivityCollectorCodex, &codex),
        (ComponentId::ActivityCollectorClaude, &claude),
    ] {
        let state = match view.freshness {
            Freshness::Fresh => HealthState::Healthy,
            Freshness::Stale | Freshness::Failed => HealthState::Degraded,
            Freshness::NoData => HealthState::Unavailable,
        };
        let success = view.snapshot.as_ref().map(|s| s.updated_at.clone());
        components.push(health(id, state, mode, &observed_at, success, now_ms));
    }
    components.push(health(
        ComponentId::ActivityArchive,
        HealthState::Healthy,
        mode,
        &observed_at,
        None,
        now_ms,
    ));
    let delivery_health = match delivery_state {
        "unconfigured" => HealthState::Unavailable,
        "unverified" | "transported" => HealthState::Degraded,
        _ if retry.is_some() => HealthState::Degraded,
        _ => HealthState::Healthy,
    };
    components.push(health(
        ComponentId::ActivityDelivery,
        delivery_health,
        mode,
        &observed_at,
        publication_observed_at.clone(),
        now_ms,
    ));

    json!({
        "schemaVersion": 1,
        "kind": "activity_overview",
        "generatedAt": observed_at,
        "sources": {
            "github": source_summary(&github, "GitHub", "contributions"),
            "codex": source_summary(&codex, "Codex", "tokens"),
            "claude": source_summary(&claude, "Asia/Shanghai", "tokens"),
        },
        "schedule": { "mode": if status.paused { "paused" } else { "idle" }, "nextTriggerAt": null },
        "delivery": {
            "pendingSequence": pending.map(|p| p.batch.sequence),
            "lastTransportAt": retry.and_then(|r| r.last_transport_at_ms).and_then(iso),
            "publicationObservedAt": publication_observed_at,
            "publicHash": status.publication.as_ref().map(|p| &p.activity_sha256),
            "state": delivery_state,
        },
        "producer": {
            "mode": match config.mode { Mode::Sandbox => "sandbox", Mode::Production => "production" },
            "deliveryEnabled": config.delivery_enabled,
            "paused": status.paused,
            "highestReserved": status.highest_reserved,
        },
        "pending": pending.map(|p| json!({
            "sequence": p.batch.sequence,
            "createdAt": p.batch.created_at,
            "ageSeconds": p.age_ms / 1000,
            "exactSha256": p.exact_pending_sha256,
            "failureCount": p.retry.as_ref().map_or(0, |r| r.failure_count),
            "nextEligibleAt": p.retry.as_ref().and_then(|r| iso(r.next_eligible_at_ms)),
            "lastErrorCode": p.retry.as_ref().map(|r| r.last_error_code),
        })),
        "health": components,
    })
}

/// `activity_public_preview`: the allowlisted data the next send carries
/// (the pending batch if one exists, which equals the archive it created).
pub fn preview(status: &ActivityStatus) -> Option<Value> {
    let data: &ActivityData = status
        .pending
        .as_ref()
        .map_or(&status.archive, |pending| &pending.batch.data);
    let bytes = public_data_bytes(data).ok()?;
    let value: Value = serde_json::from_slice(&bytes).ok()?;
    Some(json!({
        "schemaVersion": 1,
        "kind": "activity_public_preview",
        "data": value,
        "sha256": sha256_hex(&bytes),
    }))
}

/// `activity_error` with a stable code; never a path or subprocess text.
pub fn error(code: ErrorCode, component: ComponentId, retryable: bool) -> Value {
    json!({
        "schemaVersion": 1,
        "kind": "activity_error",
        "error": StructuredError { code, component, retryable },
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn future_success_is_not_fresh_and_cannot_have_a_zero_age() {
        let now = 1_790_409_601_000;
        let snapshot = Some(Snapshot {
            updated_at: format_activity_timestamp(now + 1).unwrap(),
            timezone: "Codex".to_owned(),
            metric: "tokens".to_owned(),
            days: vec![],
        });
        let view = source_view(&snapshot, None, now);
        assert_eq!(view.freshness.label(), "stale");
        assert_eq!(
            age_seconds(now, &snapshot.as_ref().unwrap().updated_at),
            None
        );
        assert_eq!(
            age_seconds(now + 1, &snapshot.as_ref().unwrap().updated_at),
            Some(0)
        );
    }
}
