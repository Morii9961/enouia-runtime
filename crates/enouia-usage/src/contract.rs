//! Frozen Dashboard Schema plus independent Runtime semantic checks.
use crate::count::{Counts, INPUT_KEYS};
use crate::time::{date_days, range, shanghai_day, timestamp};
use crate::{Error, Result, bounded_json};
use serde_json::{Value, json};
use std::collections::BTreeSet;

pub const MAX_BYTES: usize = 1024 * 1024;
pub fn parse(bytes: &[u8]) -> Result<Value> {
    let v = bounded_json(bytes, MAX_BYTES)?;
    validate(&v)?;
    Ok(v)
}
pub fn validate(v: &Value) -> Result<()> {
    let v11 = match v["schema_version"].as_str() {
        Some("1.0") => false,
        Some("1.1") => true,
        _ => return Err(Error::InvalidSchema),
    };
    structure(v, v11)?;
    let days = range(
        v["range"]["start"].as_str().ok_or(Error::InvalidDate)?,
        v["range"]["end_exclusive"]
            .as_str()
            .ok_or(Error::InvalidDate)?,
    )?;
    let listed = v["days"].as_array().ok_or(Error::InvalidSchema)?;
    if listed.len() != days.len()
        || days
            .iter()
            .zip(listed)
            .any(|(a, b)| b["date"].as_str() != Some(a.as_str()))
    {
        return Err(Error::InvalidDate);
    }
    let generated = v["generated_at"].as_str().ok_or(Error::InvalidDate)?;
    timestamp(generated)?;
    let generated_day = shanghai_day(generated)?;
    if v11 {
        quality(v.get("quality"))?;
        for day in listed {
            quality(day.get("quality"))?;
        }
    }
    let mut seen = BTreeSet::new();
    for row in v["rows"].as_array().ok_or(Error::InvalidSchema)? {
        let day = listed
            .iter()
            .find(|d| d["date"] == row["date"])
            .ok_or(Error::InvalidDate)?;
        if ["missing", "not_collected"]
            .iter()
            .any(|s| day["state"] == *s)
        {
            return Err(Error::InvalidSchema);
        }
        row_semantics(v, row)?;
        if v11 {
            quality(row.get("quality"))?;
            if cannot_date(row.get("quality")) {
                return Err(Error::InvalidSchema);
            }
        }
        let mut dimensions = row.clone();
        dimensions
            .as_object_mut()
            .ok_or(Error::InvalidSchema)?
            .remove("counts");
        dimensions.as_object_mut().unwrap().remove("quality");
        if !seen.insert(dimensions.to_string()) {
            return Err(Error::Conflict);
        }
    }
    if v11 {
        let unallocated = v.get("unallocated").and_then(Value::as_array);
        if v["rows"].as_array().unwrap().len() + unallocated.map_or(0, Vec::len) > 2000 {
            return Err(Error::BudgetExceeded);
        }
        let mut seen = BTreeSet::new();
        for row in unallocated.into_iter().flatten() {
            quality(row.get("quality"))?;
            if row["quality"]["state"] != "reported" || !cannot_date(row.get("quality")) {
                return Err(Error::InvalidSchema);
            }
            let unknown = row["time_basis"] == "checkpoint_unknown";
            if unknown != row["observed_date"].is_null() {
                return Err(Error::InvalidDate);
            }
            if let Some(date) = row["observed_date"].as_str() {
                date_days(date)?;
                if date > generated_day.as_str() {
                    return Err(Error::InvalidDate);
                }
            }
            row_semantics(v, row)?;
            let mut dims = row.clone();
            dims.as_object_mut().unwrap().remove("counts");
            dims.as_object_mut().unwrap().remove("quality");
            if !seen.insert(dims.to_string()) {
                return Err(Error::Conflict);
            }
        }
    }
    Ok(())
}
fn row_semantics(snapshot: &Value, row: &Value) -> Result<()> {
    let counts: Counts =
        serde_json::from_value(row["counts"].clone()).map_err(|_| Error::InvalidCounts)?;
    counts.validate()?;
    if row["cache_detail"] == "complete" && INPUT_KEYS.iter().any(|k| counts.get(k).is_none()) {
        return Err(Error::InvalidCounts);
    }
    if (snapshot["source"] == "codex_local"
        && ![json!("openai"), json!("unknown")].contains(&row["provider"]))
        || (snapshot["source"] == "claude_local"
            && ![json!("anthropic"), json!("unknown")].contains(&row["provider"]))
    {
        return Err(Error::InvalidSchema);
    }
    if row["classification"] == "request_classified"
        && ["service_tier", "context_class", "region"]
            .iter()
            .any(|k| row[*k] == "unknown")
    {
        return Err(Error::InvalidSchema);
    }
    let unallocated = row.get("observed_date").is_some();
    if !unallocated
        && ((snapshot["source"] == "account_daily" && row["time_basis"] != "provider_day")
            || (row["time_basis"] != "provider_day"
                && snapshot["source_timezone"] != "Asia/Shanghai"))
    {
        return Err(Error::InvalidSchema);
    }
    for label in ["unknown", "not_applicable"] {
        if (row["effort"] == label) != (row["effort_evidence"] == label) {
            return Err(Error::InvalidSchema);
        }
    }
    Ok(())
}
fn quality(value: Option<&Value>) -> Result<()> {
    if let Some(q) = value {
        let mut codes = BTreeSet::new();
        for r in q["reasons"].as_array().ok_or(Error::InvalidSchema)? {
            if !codes.insert(r["code"].as_str().ok_or(Error::InvalidSchema)?) {
                return Err(Error::Conflict);
            }
        }
    }
    Ok(())
}
fn cannot_date(value: Option<&Value>) -> bool {
    value
        .and_then(|q| q["reasons"].as_array())
        .is_some_and(|reasons| {
            reasons.iter().any(|r| {
                (r["code"] == "request_start_unavailable" || r["code"] == "checkpoint_unallocated")
                    && r["occurrences"] != "0"
            })
        })
}

pub const QUALITY_CODES: [&str; 15] = [
    "counter_reset",
    "session_copy_conflict",
    "source_missing",
    "source_unreadable",
    "source_deleted",
    "retained_not_observed",
    "checkpoint_unallocated",
    "request_start_unavailable",
    "incomplete_tail",
    "parse_rejected",
    "unsupported_source",
    "model_unresolved",
    "effort_inferred",
    "counts_unreported",
    "pricing_conditions_unknown",
];
fn shape(v: &Value, required: &[&str], optional: &[&str]) -> Result<()> {
    let map = v.as_object().ok_or(Error::InvalidSchema)?;
    if required.iter().any(|k| !map.contains_key(*k))
        || map
            .keys()
            .any(|k| !required.contains(&k.as_str()) && !optional.contains(&k.as_str()))
    {
        return Err(Error::InvalidSchema);
    }
    Ok(())
}
fn one(v: &Value, options: &[&str]) -> bool {
    v.as_str().is_some_and(|s| options.contains(&s))
}
fn decimal(v: &Value, max: usize, positive: bool) -> bool {
    v.as_str().is_some_and(|s| {
        !s.is_empty()
            && s.len() <= max
            && s.bytes().all(|b| b.is_ascii_digit())
            && (s == "0" || !s.starts_with('0'))
            && (!positive || s != "0")
    })
}
fn quality_shape(v: &Value) -> Result<()> {
    shape(v, &["state", "reasons"], &[])?;
    if !one(&v["state"], &["reported", "not_reported"]) {
        return Err(Error::InvalidSchema);
    }
    let reasons = v["reasons"].as_array().ok_or(Error::InvalidSchema)?;
    if reasons.len() > 15 || (v["state"] == "not_reported" && !reasons.is_empty()) {
        return Err(Error::InvalidSchema);
    }
    for r in reasons {
        shape(r, &["code", "occurrences"], &[])?;
        if !one(&r["code"], &QUALITY_CODES)
            || (!r["occurrences"].is_null() && !decimal(&r["occurrences"], 78, false))
        {
            return Err(Error::InvalidSchema);
        }
    }
    Ok(())
}
fn structure(v: &Value, v11: bool) -> Result<()> {
    shape(
        v,
        &[
            "kind",
            "schema_version",
            "mode",
            "dataset_id",
            "revision",
            "generated_at",
            "timezone",
            "source",
            "source_timezone",
            "range",
            "adapter_version",
            "days",
            "rows",
        ],
        if v11 {
            &["quality", "unallocated"]
        } else {
            &[]
        },
    )?;
    if v["kind"] != "ai_usage_snapshot"
        || v["mode"] != "range_replacement"
        || v["timezone"] != "Asia/Shanghai"
        || !one(
            &v["source"],
            &[
                "codex_local",
                "claude_local",
                "account_daily",
                "manual_aggregate",
            ],
        )
        || !one(
            &v["source_timezone"],
            &["Asia/Shanghai", "UTC", "provider_defined", "unknown"],
        )
        || !decimal(&v["revision"], 30, true)
    {
        return Err(Error::InvalidSchema);
    }
    let id = v["dataset_id"]
        .as_str()
        .ok_or(Error::InvalidSchema)?
        .as_bytes();
    if id.len() != 36
        || id[14] != b'4'
        || !b"89ab".contains(&id[19])
        || id.iter().enumerate().any(|(i, b)| {
            if [8, 13, 18, 23].contains(&i) {
                *b != b'-'
            } else {
                !b.is_ascii_digit() && !(b'a'..=b'f').contains(b)
            }
        })
    {
        return Err(Error::InvalidSchema);
    }
    let generated = v["generated_at"].as_str().ok_or(Error::InvalidSchema)?;
    if !((generated.len() == 20 && generated.ends_with('Z'))
        || (generated.len() == 25 && generated.ends_with("+08:00")))
    {
        return Err(Error::InvalidSchema);
    }
    let version = v["adapter_version"].as_str().ok_or(Error::InvalidSchema)?;
    let parts: Vec<_> = version.split('.').collect();
    if version.len() > 30
        || parts.len() != 3
        || parts
            .iter()
            .any(|p| p.is_empty() || !p.bytes().all(|b| b.is_ascii_digit()))
    {
        return Err(Error::InvalidSchema);
    }
    shape(&v["range"], &["start", "end_exclusive"], &[])?;
    let days = v["days"].as_array().ok_or(Error::InvalidSchema)?;
    if days.is_empty() || days.len() > 366 {
        return Err(Error::InvalidSchema);
    }
    for day in days {
        shape(
            day,
            &["date", "state"],
            if v11 { &["quality"] } else { &[] },
        )?;
        if !one(
            &day["state"],
            &["complete", "partial", "missing", "not_collected"],
        ) {
            return Err(Error::InvalidSchema);
        }
        if let Some(q) = day.get("quality") {
            quality_shape(q)?;
        }
    }
    if let Some(q) = v.get("quality") {
        quality_shape(q)?;
    }
    let rows = v["rows"].as_array().ok_or(Error::InvalidSchema)?;
    if rows.len() > 2000 {
        return Err(Error::InvalidSchema);
    }
    for row in rows {
        row_shape(row, false, v11)?;
    }
    if let Some(items) = v.get("unallocated") {
        let items = items.as_array().ok_or(Error::InvalidSchema)?;
        if items.len() > 2000 {
            return Err(Error::InvalidSchema);
        }
        for row in items {
            row_shape(row, true, true)?;
        }
    }
    Ok(())
}
fn row_shape(row: &Value, unallocated: bool, v11: bool) -> Result<()> {
    let mut required = vec![
        "provider",
        "model",
        "effort",
        "effort_evidence",
        "time_basis",
        "service_tier",
        "context_class",
        "region",
        "classification",
        "cache_detail",
        "counts",
    ];
    if unallocated {
        required.extend(["observed_date", "quality"]);
    } else {
        required.push("date");
    }
    shape(
        row,
        &required,
        if v11 && !unallocated {
            &["quality"]
        } else {
            &[]
        },
    )?;
    if !one(&row["provider"], &["openai", "anthropic", "unknown"])
        || !one(
            &row["effort"],
            &[
                "low",
                "medium",
                "high",
                "xhigh",
                "max",
                "unknown",
                "not_applicable",
            ],
        )
        || !one(
            &row["effort_evidence"],
            &["reported", "inferred", "unknown", "not_applicable"],
        )
        || !one(
            &row["service_tier"],
            &["standard", "fast", "ultrafast", "flex", "batch", "unknown"],
        )
        || !one(
            &row["context_class"],
            &["short", "long", "not_applicable", "unknown"],
        )
        || !one(&row["classification"], &["request_classified", "unknown"])
        || !one(&row["cache_detail"], &["complete", "missing"])
    {
        return Err(Error::InvalidSchema);
    }
    if !one(
        &row["time_basis"],
        if unallocated {
            &[
                "usage_observation",
                "response_completion",
                "checkpoint_unknown",
            ]
        } else {
            &["request_start", "shanghai_day", "provider_day"]
        },
    ) {
        return Err(Error::InvalidSchema);
    }
    let model = row["model"].as_str().ok_or(Error::InvalidSchema)?;
    if model.is_empty()
        || model.len() > 80
        || !model.as_bytes()[0].is_ascii_alphanumeric()
        || !model
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b"._-".contains(&b))
        || secret_model(model)
    {
        return Err(Error::InvalidSchema);
    }
    let region = row["region"].as_str().ok_or(Error::InvalidSchema)?;
    let parts: Vec<_> = region.split('-').collect();
    if region.len() > 40
        || (!(region == "global" || region == "unknown")
            && (parts.is_empty()
                || parts.len() > 4
                || parts[0].len() != 2
                || !parts[0].bytes().all(|b| b.is_ascii_lowercase())
                || parts.iter().skip(1).any(|p| {
                    p.is_empty()
                        || !p
                            .bytes()
                            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit())
                })))
    {
        return Err(Error::InvalidSchema);
    }
    shape(&row["counts"], &crate::count::COUNT_KEYS, &[])?;
    if row["counts"]
        .as_object()
        .unwrap()
        .values()
        .any(|c| !c.is_null() && !decimal(c, 78, false))
    {
        return Err(Error::InvalidCounts);
    }
    if let Some(q) = row.get("quality") {
        quality_shape(q)?;
    }
    if unallocated && !row["observed_date"].is_null() && !row["observed_date"].is_string() {
        return Err(Error::InvalidSchema);
    }
    Ok(())
}
fn secret_model(model: &str) -> bool {
    [
        "sk-",
        "github_pat_",
        "ghp_",
        "gho_",
        "ghu_",
        "ghs_",
        "ghr_",
        "xoxa-",
        "xoxb-",
        "xoxp-",
        "xoxr-",
        "xoxs-",
    ]
    .iter()
    .any(|p| {
        model
            .find(p)
            .is_some_and(|i| model.len() - i - p.len() >= 10)
    })
}
