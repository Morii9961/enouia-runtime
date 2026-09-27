//! Independent Activity v1 wire contract. No Activity storage or Runtime Core dependency.

mod sha256;
mod time;

use enouia_common::Clock;
use serde::Serialize;
use serde_json::{Map, Value};
use std::collections::HashSet;

pub use sha256::sha256_hex;
pub const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;

/// The frozen Shanghai calendar date used for activity acquisition bounds.
pub fn shanghai_date(unix_ms: i64) -> Option<String> {
    time::shanghai_date(unix_ms)
}

/// Compare a source success time with a fixed run clock without rewriting it.
pub fn activity_timestamp_ms(value: &str) -> Option<i64> {
    time::parse_timestamp(value)
}

pub fn exact_activity_timestamp_ms(value: &str) -> Option<i64> {
    time::exact_utc_millis(value)
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ContractError {
    pub code: &'static str,
    pub field: &'static str,
}

impl std::fmt::Display for ContractError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code, self.field)
    }
}

impl std::error::Error for ContractError {}

fn invalid(field: &'static str) -> ContractError {
    ContractError {
        code: "contract_invalid",
        field,
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct Day {
    pub date: String,
    pub value: u64,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub updated_at: String,
    pub timezone: String,
    pub metric: String,
    pub days: Vec<Day>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct ActivitySources {
    pub github: Option<Snapshot>,
    pub codex: Option<Snapshot>,
    pub claude: Option<Snapshot>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct ActivityData {
    pub version: u8,
    pub sources: ActivitySources,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ResultKind {
    Success,
    Failed,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceOutcome {
    pub attempted_at: String,
    pub succeeded_at: Option<String>,
    pub result: ResultKind,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct BatchSources {
    pub github: SourceOutcome,
    pub codex: SourceOutcome,
    pub claude: SourceOutcome,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Batch {
    pub version: u8,
    pub producer: String,
    pub sequence: u64,
    pub created_at: String,
    pub sources: BatchSources,
    pub data: ActivityData,
}

fn object<'a>(
    value: &'a Value,
    field: &'static str,
) -> Result<&'a Map<String, Value>, ContractError> {
    value.as_object().ok_or_else(|| invalid(field))
}

fn required<'a>(
    map: &'a Map<String, Value>,
    key: &'static str,
) -> Result<&'a Value, ContractError> {
    map.get(key).ok_or_else(|| invalid(key))
}

fn string<'a>(value: &'a Value, field: &'static str) -> Result<&'a str, ContractError> {
    value.as_str().ok_or_else(|| invalid(field))
}

fn safe_integer(value: &Value, field: &'static str) -> Result<u64, ContractError> {
    // JSON 1.0 and 1e0 are integers to JavaScript Number.isSafeInteger.
    let n = value.as_f64().ok_or_else(|| invalid(field))?;
    if !n.is_finite() || n < 0.0 || n > MAX_SAFE_INTEGER as f64 || n.fract() != 0.0 {
        return Err(invalid(field));
    }
    Ok(n as u64)
}

pub fn checked_safe_sum(values: impl IntoIterator<Item = u64>) -> Result<u64, ContractError> {
    values.into_iter().try_fold(0_u64, |sum, value| {
        sum.checked_add(value)
            .filter(|next| *next <= MAX_SAFE_INTEGER)
            .ok_or_else(|| invalid("safe_sum"))
    })
}

fn snapshot(
    value: &Value,
    timezone: &str,
    metric: &str,
) -> Result<Option<Snapshot>, ContractError> {
    if value.is_null() {
        return Ok(None);
    }
    let raw = object(value, "snapshot")?;
    let updated_at = string(required(raw, "updatedAt")?, "updatedAt")?;
    if time::parse_timestamp(updated_at).is_none() {
        return Err(invalid("updatedAt"));
    }
    if string(required(raw, "timezone")?, "timezone")? != timezone
        || string(required(raw, "metric")?, "metric")? != metric
    {
        return Err(invalid("source_literal"));
    }
    let days_raw = required(raw, "days")?
        .as_array()
        .ok_or_else(|| invalid("days"))?;
    let mut seen = HashSet::new();
    let mut days = Vec::with_capacity(days_raw.len());
    for item in days_raw {
        let day = object(item, "day")?;
        let date = string(required(day, "date")?, "date")?;
        if time::date_parts(date).is_none() || !seen.insert(date) {
            return Err(invalid("date"));
        }
        let value = safe_integer(required(day, "value")?, "value")?;
        days.push(Day {
            date: date.to_owned(),
            value,
        });
    }
    checked_safe_sum(days.iter().map(|day| day.value))?;
    days.sort_unstable_by(|a, b| a.date.cmp(&b.date));
    Ok(Some(Snapshot {
        updated_at: updated_at.to_owned(),
        timezone: timezone.to_owned(),
        metric: metric.to_owned(),
        days,
    }))
}

/// Validates required fields and rebuilds the recursive public allowlist.
pub fn normalize_activity(raw: &Value) -> Result<ActivityData, ContractError> {
    let root = object(raw, "activity")?;
    if safe_integer(required(root, "version")?, "version")? != 1 {
        return Err(invalid("version"));
    }
    let sources = object(required(root, "sources")?, "sources")?;
    Ok(ActivityData {
        version: 1,
        sources: ActivitySources {
            github: snapshot(required(sources, "github")?, "GitHub", "contributions")?,
            codex: snapshot(required(sources, "codex")?, "Codex", "tokens")?,
            claude: snapshot(required(sources, "claude")?, "Asia/Shanghai", "tokens")?,
        },
    })
}

fn outcome(
    raw: &Value,
    source: &Option<Snapshot>,
    created_ms: i64,
) -> Result<SourceOutcome, ContractError> {
    let fields = object(raw, "source_outcome")?;
    let attempted_at = string(required(fields, "attemptedAt")?, "attemptedAt")?;
    let attempted_ms =
        time::exact_utc_millis(attempted_at).ok_or_else(|| invalid("attemptedAt"))?;
    if attempted_ms > created_ms {
        return Err(invalid("attemptedAt"));
    }
    let result = match string(required(fields, "result")?, "result")? {
        "success" => ResultKind::Success,
        "failed" => ResultKind::Failed,
        _ => return Err(invalid("result")),
    };
    let succeeded_at = source.as_ref().map(|snapshot| snapshot.updated_at.clone());
    if let Some(snapshot) = source
        && time::parse_timestamp(&snapshot.updated_at).ok_or_else(|| invalid("updatedAt"))?
            > attempted_ms
    {
        return Err(invalid("updatedAt"));
    }
    if result == ResultKind::Success && succeeded_at.as_deref() != Some(attempted_at) {
        return Err(invalid("success_time"));
    }
    Ok(SourceOutcome {
        attempted_at: attempted_at.to_owned(),
        succeeded_at,
        result,
    })
}

/// Normalizes the receiver's batch v1 shape, deriving every succeededAt from data.
pub fn normalize_batch<C: Clock>(raw: &Value, clock: &C) -> Result<Batch, ContractError> {
    let root = object(raw, "batch")?;
    if safe_integer(required(root, "version")?, "version")? != 1
        || string(required(root, "producer")?, "producer")? != "morii-workstation"
    {
        return Err(invalid("batch_identity"));
    }
    let sequence = safe_integer(required(root, "sequence")?, "sequence")?;
    if sequence == 0 {
        return Err(invalid("sequence"));
    }
    let created_at = string(required(root, "createdAt")?, "createdAt")?;
    let created_ms = time::exact_utc_millis(created_at).ok_or_else(|| invalid("createdAt"))?;
    if created_ms > clock.now_unix_ms().saturating_add(300_000) {
        return Err(invalid("createdAt"));
    }
    let data = normalize_activity(required(root, "data")?)?;
    let sources = object(required(root, "sources")?, "sources")?;
    Ok(Batch {
        version: 1,
        producer: "morii-workstation".to_owned(),
        sequence,
        created_at: created_at.to_owned(),
        sources: BatchSources {
            github: outcome(
                required(sources, "github")?,
                &data.sources.github,
                created_ms,
            )?,
            codex: outcome(required(sources, "codex")?, &data.sources.codex, created_ms)?,
            claude: outcome(
                required(sources, "claude")?,
                &data.sources.claude,
                created_ms,
            )?,
        },
        data,
    })
}

/// The existing public manifest requires exact ISO times for every derived success.
/// This is a separate gate from the receiver's broader ActivityData timestamp parser.
pub fn validate_publishable_batch(batch: &Batch) -> Result<(), ContractError> {
    for value in [
        &batch.sources.github.succeeded_at,
        &batch.sources.codex.succeeded_at,
        &batch.sources.claude.succeeded_at,
    ]
    .into_iter()
    .flatten()
    {
        if time::exact_utc_millis(value).is_none() {
            return Err(invalid("succeededAt"));
        }
    }
    Ok(())
}

/// Producer-side failure retention check when a prior archive is available.
/// The receiver's single-batch validator cannot infer the previous snapshot.
pub fn validate_failed_retention(
    batch: &Batch,
    previous: &ActivityData,
) -> Result<(), ContractError> {
    for (result, current, old) in [
        (
            batch.sources.github.result,
            &batch.data.sources.github,
            &previous.sources.github,
        ),
        (
            batch.sources.codex.result,
            &batch.data.sources.codex,
            &previous.sources.codex,
        ),
        (
            batch.sources.claude.result,
            &batch.data.sources.claude,
            &previous.sources.claude,
        ),
    ] {
        if result == ResultKind::Failed && current != old {
            return Err(invalid("failed_retention"));
        }
    }
    Ok(())
}

fn exact_keys(raw: &Map<String, Value>, allowed: &[&str]) -> Result<(), ContractError> {
    if raw.keys().any(|key| !allowed.contains(&key.as_str())) {
        return Err(invalid("private_field"));
    }
    Ok(())
}

/// Import guard: do not silently alter an already-sent pending object with extra fields.
pub fn validate_imported_pending<C: Clock>(raw: &Value, clock: &C) -> Result<Batch, ContractError> {
    let root = object(raw, "batch")?;
    exact_keys(
        root,
        &[
            "version",
            "producer",
            "sequence",
            "createdAt",
            "sources",
            "data",
        ],
    )?;
    let source_map = object(required(root, "sources")?, "sources")?;
    exact_keys(source_map, &["github", "codex", "claude"])?;
    for id in ["github", "codex", "claude"] {
        exact_keys(
            object(required(source_map, id)?, "source_outcome")?,
            &["attemptedAt", "succeededAt", "result"],
        )?;
    }
    let data = object(required(root, "data")?, "data")?;
    exact_keys(data, &["version", "sources"])?;
    let data_sources = object(required(data, "sources")?, "sources")?;
    exact_keys(data_sources, &["github", "codex", "claude"])?;
    for id in ["github", "codex", "claude"] {
        let value = required(data_sources, id)?;
        if !value.is_null() {
            let item = object(value, "snapshot")?;
            exact_keys(item, &["updatedAt", "timezone", "metric", "days"])?;
            for day in required(item, "days")?
                .as_array()
                .ok_or_else(|| invalid("days"))?
            {
                exact_keys(object(day, "day")?, &["date", "value"])?;
            }
        }
    }
    let batch = normalize_batch(raw, clock)?;
    for id in ["github", "codex", "claude"] {
        let supplied = required(
            object(required(source_map, id)?, "source_outcome")?,
            "succeededAt",
        );
        if let Ok(value) = supplied {
            let expected = match id {
                "github" => &batch.sources.github.succeeded_at,
                "codex" => &batch.sources.codex.succeeded_at,
                _ => &batch.sources.claude.succeeded_at,
            };
            if value != &serde_json::to_value(expected).map_err(|_| invalid("succeededAt"))? {
                return Err(invalid("succeededAt"));
            }
        }
    }
    Ok(batch)
}

/// The exact compact UTF-8 public file: ordered fields and one LF.
pub fn public_data_bytes(data: &ActivityData) -> Result<Vec<u8>, ContractError> {
    let value = serde_json::to_value(data).map_err(|_| invalid("activity"))?;
    let normalized = normalize_activity(&value)?;
    let mut bytes = serde_json::to_vec(&normalized).map_err(|_| invalid("activity"))?;
    bytes.push(b'\n');
    Ok(bytes)
}

pub fn public_data_sha256(data: &ActivityData) -> Result<String, ContractError> {
    Ok(sha256_hex(&public_data_bytes(data)?))
}
