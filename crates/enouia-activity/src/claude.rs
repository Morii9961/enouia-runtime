//! Strict normalization of pinned ccusage daily reports from disjoint stores.

use enouia_activity_contract::{
    MAX_SAFE_INTEGER, Snapshot, checked_safe_sum, exact_activity_timestamp_ms, normalize_activity,
};
use enouia_common::{Cancellation, ErrorCode, ProcessRequest, ProcessRunner};
use serde_json::{Value, json};
use std::collections::{BTreeMap, HashSet};
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::time::Duration;

use crate::{SourceAttempt, SourceId};

const STORE_TIMEOUT: Duration = Duration::from_secs(120);
const MAX_OUTPUT_BYTES: usize = 4 * 1024 * 1024;

/// Store paths are already discovered inventory entries. Include the normal
/// Claude store and every distinct local Cowork store; discovery owns reparse
/// resolution and transcript checks before constructing this configuration.
pub struct ClaudeConfig<'a> {
    pub node_executable: &'a Path,
    pub ccusage_cli: &'a Path,
    pub stores: &'a [PathBuf],
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CollectAbort {
    Cancelled,
}

/// Run the pinned Claude-only daily command once for each configured store.
/// Any failed or incomplete store fails this entire source attempt.
pub fn collect<R: ProcessRunner>(
    config: &ClaudeConfig<'_>,
    attempted_at: &str,
    runner: &R,
    cancellation: &dyn Cancellation,
) -> Result<SourceAttempt, CollectAbort> {
    let failed = |error_code| SourceAttempt::Failed {
        source: SourceId::Claude,
        attempted_at: attempted_at.to_owned(),
        error_code,
    };
    if cancellation.is_cancelled() {
        return Err(CollectAbort::Cancelled);
    }
    if !config.node_executable.is_absolute()
        || !config.ccusage_cli.is_absolute()
        || config.stores.is_empty()
        || config.stores.iter().any(|path| !path.is_absolute())
    {
        return Ok(failed(ErrorCode::Unconfigured));
    }
    if exact_activity_timestamp_ms(attempted_at).is_none() {
        return Ok(failed(ErrorCode::SourceInvalid));
    }
    let mut unique = HashSet::new();
    if config.stores.iter().any(|path| !unique.insert(path)) {
        return Ok(failed(ErrorCode::Unconfigured));
    }
    let mut reports = Vec::with_capacity(config.stores.len());
    for store in config.stores {
        if cancellation.is_cancelled() {
            return Err(CollectAbort::Cancelled);
        }
        let request = ProcessRequest {
            executable: config.node_executable.to_path_buf(),
            arguments: [
                config.ccusage_cli.as_os_str().to_os_string(),
                OsString::from("claude"),
                OsString::from("daily"),
                OsString::from("--json"),
                OsString::from("--offline"),
                OsString::from("--timezone"),
                OsString::from("Asia/Shanghai"),
            ]
            .into(),
            environment: vec![(
                OsString::from("CLAUDE_CONFIG_DIR"),
                store.as_os_str().to_os_string(),
            )],
            stdin: None,
            timeout: STORE_TIMEOUT,
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
        let report = match serde_json::from_slice::<Value>(&output.stdout) {
            Ok(report) => report,
            Err(_) => return Ok(failed(ErrorCode::SourceInvalid)),
        };
        reports.push(report);
    }
    Ok(match parse_reports(&reports, attempted_at) {
        Ok(snapshot) => SourceAttempt::Success {
            source: SourceId::Claude,
            attempted_at: attempted_at.to_owned(),
            snapshot,
        },
        Err(error) => failed(error),
    })
}

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
            .get("date")
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
