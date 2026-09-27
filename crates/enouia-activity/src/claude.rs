//! Strict normalization of pinned ccusage daily reports from disjoint stores.

use enouia_activity_contract::{
    MAX_SAFE_INTEGER, Snapshot, checked_safe_sum, exact_activity_timestamp_ms, normalize_activity,
};
use enouia_common::ErrorCode;
use serde_json::{Value, json};
use std::collections::BTreeMap;

fn tokens(row: &Value, field: &str) -> Result<u64, ErrorCode> {
    row.get(field)
        .and_then(Value::as_u64)
        .filter(|value| *value <= MAX_SAFE_INTEGER)
        .ok_or(ErrorCode::SourceInvalid)
}

fn parse_store(report: &Value) -> Result<BTreeMap<String, u64>, ErrorCode> {
    let rows = report
        .get("daily")
        .and_then(Value::as_array)
        .ok_or(ErrorCode::SourceInvalid)?;
    let declared_total = report
        .pointer("/totals/totalTokens")
        .and_then(Value::as_u64)
        .filter(|value| *value <= MAX_SAFE_INTEGER)
        .ok_or(ErrorCode::SourceInvalid)?;
    let mut days = BTreeMap::new();
    for row in rows {
        let date = row
            .get("period")
            .and_then(Value::as_str)
            .ok_or(ErrorCode::SourceInvalid)?;
        let inputs = [
            tokens(row, "inputTokens")?,
            tokens(row, "cacheReadTokens")?,
            tokens(row, "cacheCreationTokens")?,
            tokens(row, "outputTokens")?,
        ];
        let calculated = checked_safe_sum(inputs).map_err(|_| ErrorCode::SourceInvalid)?;
        if calculated != tokens(row, "totalTokens")?
            || days.insert(date.to_owned(), calculated).is_some()
        {
            return Err(ErrorCode::SourceInvalid);
        }
    }
    if checked_safe_sum(days.values().copied()).map_err(|_| ErrorCode::SourceInvalid)?
        != declared_total
    {
        return Err(ErrorCode::SourceInvalid);
    }
    Ok(days)
}

/// Validate every complete ccusage `daily --json` report, then sum distinct
/// stores by Shanghai date. Store path deduplication belongs to discovery.
/// `reasoningOutputTokens` is already part of `outputTokens` and is not added.
pub fn parse_reports(reports: &[Value], attempted_at: &str) -> Result<Snapshot, ErrorCode> {
    if reports.is_empty() || exact_activity_timestamp_ms(attempted_at).is_none() {
        return Err(ErrorCode::SourceInvalid);
    }
    let mut combined = BTreeMap::<String, u64>::new();
    for report in reports {
        for (date, value) in parse_store(report)? {
            let next = checked_safe_sum([combined.get(&date).copied().unwrap_or(0), value])
                .map_err(|_| ErrorCode::SourceInvalid)?;
            combined.insert(date, next);
        }
    }
    let days: Vec<Value> = combined
        .into_iter()
        .map(|(date, value)| json!({"date":date,"value":value}))
        .collect();
    let normalized = normalize_activity(&json!({
        "version":1,
        "sources":{
            "github":null,
            "codex":null,
            "claude":{"updatedAt":attempted_at,"timezone":"Asia/Shanghai","metric":"tokens","days":days}
        }
    }))
    .map_err(|_| ErrorCode::SourceInvalid)?;
    normalized.sources.claude.ok_or(ErrorCode::SourceInvalid)
}
