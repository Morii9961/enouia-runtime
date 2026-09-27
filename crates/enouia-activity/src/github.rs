//! GitHub contribution calendar adapter through the authenticated local CLI.

use crate::{SourceAttempt, SourceId};
use enouia_activity_contract::{
    Snapshot, exact_activity_timestamp_ms, normalize_activity, shanghai_date,
};
use enouia_common::{Cancellation, ErrorCode, ProcessRequest, ProcessRunner};
use serde_json::{Value, json};
use std::ffi::OsString;
use std::path::Path;
use std::time::Duration;

const QUERY: &str = "query($login:String!,$from:DateTime!,$to:DateTime!){user(login:$login){contributionsCollection(from:$from,to:$to){contributionCalendar{weeks{contributionDays{date contributionCount}}}}}}";
const MAX_OUTPUT_BYTES: usize = 4 * 1024 * 1024;
const LOOKBACK_DAYS: i64 = 364;

/// No repository path or credential is needed. `gh` uses its own existing
/// authentication, including any process-local GH_TOKEN supplied by its caller.
pub struct GithubConfig<'a> {
    pub executable: &'a Path,
    pub login: &'a str,
}

/// A cancelled run must not be converted into an ordinary failed source: the
/// caller must abandon the entire candidate batch before committing it.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CollectAbort {
    Cancelled,
}

/// Parse a complete GraphQL response before any acquisition-window filtering.
/// The v1 normalizer checks real/unique dates, literals, safe values and sums.
pub fn parse_calendar(report: &Value, attempted_at: &str) -> Result<Snapshot, ErrorCode> {
    if report.get("errors").is_some_and(|errors| !errors.is_null()) {
        return Err(ErrorCode::SourceInvalid);
    }
    let weeks = report
        .pointer("/data/user/contributionsCollection/contributionCalendar/weeks")
        .and_then(Value::as_array)
        .filter(|weeks| !weeks.is_empty())
        .ok_or(ErrorCode::SourceInvalid)?;
    let mut days = Vec::new();
    for week in weeks {
        let entries = week
            .get("contributionDays")
            .and_then(Value::as_array)
            .ok_or(ErrorCode::SourceInvalid)?;
        for entry in entries {
            let date = entry
                .get("date")
                .and_then(Value::as_str)
                .ok_or(ErrorCode::SourceInvalid)?;
            let count = entry
                .get("contributionCount")
                .and_then(Value::as_u64)
                .ok_or(ErrorCode::SourceInvalid)?;
            days.push(json!({"date":date,"value":count}));
        }
    }
    if days.is_empty() {
        return Err(ErrorCode::SourceInvalid);
    }
    let normalized = normalize_activity(&json!({
        "version":1,
        "sources":{
            "github":{"updatedAt":attempted_at,"timezone":"GitHub","metric":"contributions","days":days},
            "codex":null,
            "claude":null
        }
    }))
    .map_err(|_| ErrorCode::SourceInvalid)?;
    normalized.sources.github.ok_or(ErrorCode::SourceInvalid)
}

/// One bounded CLI request. The process runner owns timeout/cancellation and
/// child-tree cleanup; this adapter additionally rejects oversized output.
pub fn collect<R: ProcessRunner>(
    config: &GithubConfig<'_>,
    attempted_at: &str,
    runner: &R,
    cancellation: &dyn Cancellation,
) -> Result<SourceAttempt, CollectAbort> {
    let failed = |error_code| SourceAttempt::Failed {
        source: SourceId::Github,
        attempted_at: attempted_at.to_owned(),
        error_code,
    };
    if !config.executable.is_absolute() || config.login.trim().is_empty() {
        return Ok(failed(ErrorCode::Unconfigured));
    }
    if cancellation.is_cancelled() {
        return Err(CollectAbort::Cancelled);
    }
    let Some(attempted_ms) = exact_activity_timestamp_ms(attempted_at) else {
        return Ok(failed(ErrorCode::SourceInvalid));
    };
    let Some(start_ms) = attempted_ms.checked_sub(LOOKBACK_DAYS * 86_400_000) else {
        return Ok(failed(ErrorCode::SourceInvalid));
    };
    let (Some(start), Some(end)) = (shanghai_date(start_ms), shanghai_date(attempted_ms)) else {
        return Ok(failed(ErrorCode::SourceInvalid));
    };
    let request = ProcessRequest {
        executable: config.executable.to_path_buf(),
        arguments: [
            "api".into(),
            "graphql".into(),
            "-f".into(),
            OsString::from(format!("query={QUERY}")),
            "-f".into(),
            OsString::from(format!("login={}", config.login)),
            "-f".into(),
            OsString::from(format!("from={start}T00:00:00Z")),
            "-f".into(),
            OsString::from(format!("to={end}T23:59:59Z")),
        ]
        .into(),
        environment: Vec::new(),
        stdin: None,
        timeout: Duration::from_secs(40),
        max_output_bytes: MAX_OUTPUT_BYTES,
    };
    let output = match runner.run(&request, cancellation) {
        Ok(output) => output,
        Err(_) if cancellation.is_cancelled() => return Err(CollectAbort::Cancelled),
        Err(error) => return Ok(failed(error.code)),
    };
    if cancellation.is_cancelled() {
        return Err(CollectAbort::Cancelled);
    }
    if output.exit_code != Some(0)
        || output.stdout.len() > MAX_OUTPUT_BYTES
        || output.stderr.len() > MAX_OUTPUT_BYTES - output.stdout.len()
    {
        return Ok(failed(ErrorCode::SourceInvalid));
    }
    let report: Value = match serde_json::from_slice(&output.stdout) {
        Ok(report) => report,
        Err(_) => return Ok(failed(ErrorCode::SourceInvalid)),
    };
    Ok(match parse_calendar(&report, attempted_at) {
        Ok(snapshot) => SourceAttempt::Success {
            source: SourceId::Github,
            attempted_at: attempted_at.to_owned(),
            snapshot,
        },
        Err(error) => failed(error),
    })
}
