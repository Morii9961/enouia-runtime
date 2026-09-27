//! Strict normalization of account-wide Codex token usage.

use enouia_activity_contract::{
    MAX_SAFE_INTEGER, Snapshot, checked_safe_sum, exact_activity_timestamp_ms, normalize_activity,
};
use enouia_common::ErrorCode;
use serde_json::{Value, json};

/// Convert the `account/usage/read` result after a successful app-server
/// handshake. The server's date labels are preserved under the `Codex` literal.
/// All returned buckets are reconciled before the merge's admission filter.
pub fn parse_usage(result: &Value, attempted_at: &str) -> Result<Snapshot, ErrorCode> {
    if exact_activity_timestamp_ms(attempted_at).is_none() {
        return Err(ErrorCode::SourceInvalid);
    }
    let buckets = result
        .get("dailyUsageBuckets")
        .and_then(Value::as_array)
        .filter(|buckets| !buckets.is_empty())
        .ok_or(ErrorCode::SourceInvalid)?;
    let lifetime = result
        .pointer("/summary/lifetimeTokens")
        .and_then(Value::as_u64)
        .filter(|value| *value <= MAX_SAFE_INTEGER)
        .ok_or(ErrorCode::SourceInvalid)?;
    let mut days = Vec::with_capacity(buckets.len());
    let mut values = Vec::with_capacity(buckets.len());
    for bucket in buckets {
        let date = bucket
            .get("startDate")
            .and_then(Value::as_str)
            .ok_or(ErrorCode::SourceInvalid)?;
        let value = bucket
            .get("tokens")
            .and_then(Value::as_u64)
            .filter(|value| *value <= MAX_SAFE_INTEGER)
            .ok_or(ErrorCode::SourceInvalid)?;
        days.push(json!({"date":date,"value":value}));
        values.push(value);
    }
    if checked_safe_sum(values).map_err(|_| ErrorCode::SourceInvalid)? != lifetime {
        return Err(ErrorCode::SourceInvalid);
    }
    let normalized = normalize_activity(&json!({
        "version":1,
        "sources":{
            "github":null,
            "codex":{"updatedAt":attempted_at,"timezone":"Codex","metric":"tokens","days":days},
            "claude":null
        }
    }))
    .map_err(|_| ErrorCode::SourceInvalid)?;
    normalized.sources.codex.ok_or(ErrorCode::SourceInvalid)
}
