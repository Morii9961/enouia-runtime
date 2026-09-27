//! Strict normalization of account-wide Codex token usage.

use enouia_activity_contract::{
    MAX_SAFE_INTEGER, Snapshot, checked_safe_sum, exact_activity_timestamp_ms, normalize_activity,
};
use enouia_common::{Cancellation, ErrorCode, JsonLineSession};
use serde_json::{Value, json};
use std::time::{Duration, Instant};

use crate::{SourceAttempt, SourceId};

const COLLECTION_TIMEOUT: Duration = Duration::from_secs(90);
const MAX_RESPONSE_BYTES: usize = 4 * 1024 * 1024;

/// A cancelled run is not an ordinary failed source and must not be committed.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CollectAbort {
    Cancelled,
}

fn send<S: JsonLineSession>(
    session: &mut S,
    message: &Value,
    cancellation: &dyn Cancellation,
) -> Result<(), ErrorCode> {
    let mut line = serde_json::to_vec(message).map_err(|_| ErrorCode::SourceInvalid)?;
    line.push(b'\n');
    session
        .write_line(&line, cancellation)
        .map_err(|error| error.code)
}

/// Drive the official app-server handshake and one usage request over a
/// caller-owned session. The caller chooses and launches the CLI separately.
/// Notifications are ignored; only the expected response IDs advance state.
pub fn collect<S: JsonLineSession>(
    session: &mut S,
    attempted_at: &str,
    cancellation: &dyn Cancellation,
) -> Result<SourceAttempt, CollectAbort> {
    let failed = |error_code| SourceAttempt::Failed {
        source: SourceId::Codex,
        attempted_at: attempted_at.to_owned(),
        error_code,
    };
    if cancellation.is_cancelled() {
        return Err(CollectAbort::Cancelled);
    }
    if exact_activity_timestamp_ms(attempted_at).is_none() {
        return Ok(failed(ErrorCode::SourceInvalid));
    }
    if let Err(error) = send(
        session,
        &json!({
            "method":"initialize",
            "id":1,
            "params":{"clientInfo":{"name":"enouia_activity","title":"Enouia Activity","version":"0.1.0"}}
        }),
        cancellation,
    ) {
        return if cancellation.is_cancelled() {
            Err(CollectAbort::Cancelled)
        } else {
            Ok(failed(error))
        };
    }
    let deadline = Instant::now() + COLLECTION_TIMEOUT;
    let mut remaining_bytes = MAX_RESPONSE_BYTES;
    let mut initialized = false;
    loop {
        if cancellation.is_cancelled() {
            return Err(CollectAbort::Cancelled);
        }
        let timeout = deadline.saturating_duration_since(Instant::now());
        if timeout.is_zero() || remaining_bytes == 0 {
            return Ok(failed(ErrorCode::SourceInvalid));
        }
        let line = match session.read_line(timeout, remaining_bytes, cancellation) {
            Ok(line) => line,
            Err(_) if cancellation.is_cancelled() => return Err(CollectAbort::Cancelled),
            Err(error) => return Ok(failed(error.code)),
        };
        if cancellation.is_cancelled() {
            return Err(CollectAbort::Cancelled);
        }
        if line.len() > remaining_bytes {
            return Ok(failed(ErrorCode::SourceInvalid));
        }
        remaining_bytes -= line.len();
        let message: Value = match serde_json::from_slice(&line) {
            Ok(message) => message,
            Err(_) => return Ok(failed(ErrorCode::SourceInvalid)),
        };
        match message.get("id").and_then(Value::as_u64) {
            Some(1) if !initialized => {
                if message.get("error").is_some()
                    || !message.get("result").is_some_and(Value::is_object)
                {
                    return Ok(failed(ErrorCode::SourceInvalid));
                }
                for request in [
                    json!({"method":"initialized","params":{}}),
                    json!({"method":"account/usage/read","id":2}),
                ] {
                    if let Err(error) = send(session, &request, cancellation) {
                        return if cancellation.is_cancelled() {
                            Err(CollectAbort::Cancelled)
                        } else {
                            Ok(failed(error))
                        };
                    }
                }
                initialized = true;
            }
            Some(2) if initialized => {
                if let Some(error) = message.get("error") {
                    let code = if error.get("code").and_then(Value::as_i64) == Some(-32600) {
                        ErrorCode::UnsupportedMethod
                    } else {
                        ErrorCode::SourceInvalid
                    };
                    return Ok(failed(code));
                }
                let Some(result) = message.get("result") else {
                    return Ok(failed(ErrorCode::SourceInvalid));
                };
                return Ok(match parse_usage(result, attempted_at) {
                    Ok(snapshot) => SourceAttempt::Success {
                        source: SourceId::Codex,
                        attempted_at: attempted_at.to_owned(),
                        snapshot,
                    },
                    Err(error) => failed(error),
                });
            }
            Some(1 | 2) => return Ok(failed(ErrorCode::SourceInvalid)),
            Some(_) | None => {}
        }
    }
}

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
