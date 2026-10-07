//! Offline development fixture bridge. No files, processes, network, or delivery.
use enouia_activity::{SourceAttempt, SourceDelta, SourceId, merge_activity};
use enouia_activity_contract::{
    Batch, normalize_activity, normalize_batch, public_data_bytes, sha256_hex,
};
use enouia_common::{ErrorCode, FakeClock};
use serde_json::{Value, json};
use std::io::{Read, Write};

fn attempt(
    source: SourceId,
    at: &str,
    parsed: Result<enouia_activity_contract::Snapshot, ErrorCode>,
) -> SourceAttempt {
    match parsed {
        Ok(snapshot) => SourceAttempt::Success {
            source,
            attempted_at: at.to_owned(),
            snapshot,
        },
        Err(error_code) => SourceAttempt::Failed {
            source,
            attempted_at: at.to_owned(),
            error_code,
        },
    }
}
fn delta(value: &SourceDelta) -> Value {
    json!({"disposition":format!("{:?}", value.disposition),"newDates":value.new_dates,
        "revisedDates":value.revised_dates,"totalChange":value.total_change,
        "ignoredFutureDays":value.ignored_future_days,"ignoredBeforeFloorDays":value.ignored_before_floor_days,"retainedHigherDays":value.retained_higher_days})
}
fn evaluate(raw: &Value) -> Result<Value, &'static str> {
    let object = raw.as_object().ok_or("invalid_input")?;
    if object.keys().any(|key| {
        ![
            "previous",
            "attemptedAt",
            "clockMs",
            "sequence",
            "github",
            "codex",
            "claude",
            "failures",
        ]
        .contains(&key.as_str())
    }) {
        return Err("invalid_input");
    }
    let previous = normalize_activity(&raw["previous"]).map_err(|_| "invalid_previous")?;
    let at = raw["attemptedAt"].as_str().ok_or("invalid_input")?;
    let clock = FakeClock::new(raw["clockMs"].as_i64().ok_or("invalid_input")?);
    let failures = raw["failures"].as_array().ok_or("invalid_input")?;
    if failures
        .iter()
        .any(|value| !matches!(value.as_str(), Some("github" | "codex" | "claude")))
    {
        return Err("invalid_input");
    }
    let failed = |name: &str| failures.iter().any(|value| value.as_str() == Some(name));
    let github = if failed("github") {
        Err(ErrorCode::SourceInvalid)
    } else {
        enouia_activity::github::parse_calendar(&raw["github"], at)
    };
    let codex = if failed("codex") {
        Err(ErrorCode::SourceInvalid)
    } else {
        enouia_activity::codex::parse_usage(&raw["codex"], at)
    };
    let claude = if failed("claude") {
        Err(ErrorCode::SourceInvalid)
    } else {
        raw["claude"]
            .as_array()
            .ok_or(ErrorCode::SourceInvalid)
            .and_then(|reports| enouia_activity::claude::parse_reports(reports, at))
    };
    let merged = merge_activity(
        &previous,
        [
            attempt(SourceId::Github, at, github),
            attempt(SourceId::Codex, at, codex),
            attempt(SourceId::Claude, at, claude),
        ],
        &clock,
    )
    .map_err(|error| match error {
        enouia_activity::MergeError::ClockRegression => "clock_regression",
        _ => "merge_rejected",
    })?;
    let data_bytes = public_data_bytes(&merged.data).map_err(|_| "invalid_data")?;
    let batch = Batch {
        version: 1,
        producer: "morii-workstation".to_owned(),
        sequence: raw["sequence"].as_u64().ok_or("invalid_input")?,
        created_at: at.to_owned(),
        sources: merged.outcomes,
        data: merged.data,
    };
    let batch = normalize_batch(
        &serde_json::to_value(batch).map_err(|_| "invalid_batch")?,
        &clock,
    )
    .map_err(|_| "invalid_batch")?;
    Ok(
        json!({"state":"merged","batch":batch,"canonicalDataSha256":sha256_hex(&data_bytes),
        "deltas":{"github":delta(&merged.deltas.github),"codex":delta(&merged.deltas.codex),"claude":delta(&merged.deltas.claude)}}),
    )
}
fn main() -> std::process::ExitCode {
    let mut bytes = Vec::new();
    let result = std::io::stdin()
        .take(4 * 1024 * 1024 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "invalid_input")
        .and({
            if bytes.len() > 4 * 1024 * 1024 {
                Err("input_too_large")
            } else {
                Ok(())
            }
        })
        .and_then(|_| serde_json::from_slice::<Value>(&bytes).map_err(|_| "invalid_input"))
        .and_then(|raw| evaluate(&raw));
    let (code, output) = match result {
        Ok(output) => (0, output),
        Err(state) => (5, json!({"state":state})),
    };
    let mut output = serde_json::to_vec(&output).expect("JSON value serialization");
    output.push(b'\n');
    if std::io::stdout().write_all(&output).is_err() {
        return std::process::ExitCode::from(6);
    }
    std::process::ExitCode::from(code)
}
