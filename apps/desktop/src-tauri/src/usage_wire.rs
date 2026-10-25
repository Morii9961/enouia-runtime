//! Closed count-only runner replies. No Runtime domain dependency in the shell.
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Counts {
    input_total: Option<String>,
    input_uncached: Option<String>,
    input_cache_read: Option<String>,
    input_cache_write_5m: Option<String>,
    input_cache_write_1h: Option<String>,
    input_cache_write_30m: Option<String>,
    input_cache_write_unknown: Option<String>,
    output_total: Option<String>,
    output_reasoning_subset: Option<String>,
}
impl Counts {
    fn valid(&self) -> bool {
        [
            &self.input_total,
            &self.input_uncached,
            &self.input_cache_read,
            &self.input_cache_write_5m,
            &self.input_cache_write_1h,
            &self.input_cache_write_30m,
            &self.input_cache_write_unknown,
            &self.output_total,
            &self.output_reasoning_subset,
        ]
        .into_iter()
        .all(|v| v.as_deref().is_none_or(decimal))
    }
}
fn decimal(v: &str) -> bool {
    !v.is_empty()
        && v.len() <= 78
        && v.bytes().all(|b| b.is_ascii_digit())
        && (v == "0" || !v.starts_with('0'))
}
pub fn digest(v: &str) -> bool {
    v.len() == 64
        && v.bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}
fn natural(n: u64) -> bool {
    n <= 9_007_199_254_740_991
}
fn date(v: &str) -> bool {
    v.len() == 10
        && v.bytes().enumerate().all(|(i, b)| {
            if [4, 7].contains(&i) {
                b == b'-'
            } else {
                b.is_ascii_digit()
            }
        })
}
fn timestamp(v: &Option<String>) -> bool {
    v.as_ref().is_none_or(|s| {
        s.len() <= 40
            && s.len() >= 20
            && s.bytes()
                .all(|b| b.is_ascii_digit() || b"-:TZ.+".contains(&b))
    })
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Coverage {
    files: u64,
    complete_files: u64,
    records: u64,
    rejected: u64,
    incomplete_tails: u64,
    unreadable: u64,
    retained_files: u64,
    unsupported: u64,
    unsafe_entries: u64,
    counter_resets: u64,
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Health {
    revision: u64,
    last_attempt: Option<String>,
    last_completed: Option<String>,
    last_successful: Option<String>,
    attempt_error: Option<String>,
    coverage: Coverage,
    conflicts: u64,
    accepted_facts: u64,
}
impl Health {
    fn valid(&self) -> bool {
        let c = &self.coverage;
        [
            self.revision,
            self.conflicts,
            self.accepted_facts,
            c.files,
            c.complete_files,
            c.records,
            c.rejected,
            c.incomplete_tails,
            c.unreadable,
            c.retained_files,
            c.unsupported,
            c.unsafe_entries,
            c.counter_resets,
        ]
        .into_iter()
        .all(natural)
            && timestamp(&self.last_attempt)
            && timestamp(&self.last_completed)
            && timestamp(&self.last_successful)
            && self.attempt_error.as_deref().is_none_or(error_code)
    }
}
pub fn error_code(v: &str) -> bool {
    [
        "invalid_json",
        "invalid_schema",
        "invalid_counts",
        "counter_reset",
        "invalid_date",
        "overflow",
        "unsupported_source",
        "conflict",
        "stale_read",
        "unsafe_path",
        "budget_exceeded",
        "cancelled",
        "busy",
        "storage_failed",
        "unconfigured",
    ]
    .contains(&v)
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Candidate {
    pub group: String,
    pub identity: String,
    pub digest: String,
}
impl Candidate {
    pub fn valid(&self) -> bool {
        digest(&self.group) && digest(&self.identity) && digest(&self.digest)
    }
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Stamp {
    purpose: String,
    source: String,
    revision: u64,
    evidence: u64,
    candidate: Candidate,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Sealed {
    payload: String,
    seal: String,
}
pub fn token(text: &str, purpose: &str) -> bool {
    if text.len() > 2048 {
        return false;
    }
    let Ok(s) = serde_json::from_str::<Sealed>(text) else {
        return false;
    };
    let Ok(p) = serde_json::from_str::<Stamp>(&s.payload) else {
        return false;
    };
    digest(&s.seal)
        && p.purpose == purpose
        && source(&p.source)
        && natural(p.revision)
        && natural(p.evidence)
        && p.candidate.valid()
}
pub fn source(v: &str) -> bool {
    ["codex_local", "claude_local"].contains(&v)
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Quality {
    state: String,
    reasons: Vec<Reason>,
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Reason {
    code: String,
    occurrences: Option<String>,
}
impl Quality {
    fn valid(&self) -> bool {
        self.state == "reported"
            && self.reasons.len() <= 15
            && self.reasons.iter().all(|r| {
                [
                    "counter_reset",
                    "retained_not_observed",
                    "checkpoint_unallocated",
                    "session_copy_conflict",
                    "source_missing",
                    "source_unreadable",
                    "source_deleted",
                    "incomplete_tail",
                    "request_start_unavailable",
                    "parse_rejected",
                    "unsupported_source",
                    "model_unresolved",
                    "effort_inferred",
                    "counts_unreported",
                    "pricing_conditions_unknown",
                ]
                .contains(&r.code.as_str())
                    && r.occurrences.as_deref().is_none_or(decimal)
            })
    }
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Measurement {
    provider: String,
    model: String,
    effort: String,
    effort_evidence: String,
    observed_date: Option<String>,
    time_basis: String,
    service_tier: String,
    context_class: String,
    region: String,
    classification: String,
    cache_detail: String,
    counts: Counts,
    quality: Quality,
}
impl Measurement {
    fn valid(&self) -> bool {
        ["openai", "anthropic"].contains(&self.provider.as_str())
            && !self.model.is_empty()
            && self.model.len() <= 80
            && self
                .model
                .bytes()
                .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b"._-".contains(&b))
            && ["unknown", "low", "medium", "high", "xhigh", "max"].contains(&self.effort.as_str())
            && ["unknown", "inferred"].contains(&self.effort_evidence.as_str())
            && self.observed_date.as_deref().is_none_or(date)
            && ["usage_observation", "checkpoint_unknown"].contains(&self.time_basis.as_str())
            && self.service_tier == "unknown"
            && self.context_class == "unknown"
            && self.region == "unknown"
            && self.classification == "unknown"
            && ["complete", "missing"].contains(&self.cache_detail.as_str())
            && self.counts.valid()
            && self.quality.valid()
    }
}
#[derive(Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
enum View {
    Checkpoint {
        counts: Counts,
        time_basis: String,
    },
    Step {
        before_counts: Counts,
        after_counts: Counts,
        measurement: Box<Measurement>,
    },
    Message {
        measurement: Measurement,
        sidechain: bool,
    },
}
impl View {
    fn valid(&self) -> bool {
        match self {
            Self::Checkpoint { counts, time_basis } => {
                counts.valid() && time_basis == "checkpoint_unknown"
            }
            Self::Step {
                before_counts,
                after_counts,
                measurement,
            } => before_counts.valid() && after_counts.valid() && measurement.valid(),
            Self::Message { measurement, .. } => measurement.valid(),
        }
    }
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Overview {
    source: String,
    health: Health,
    counts: Option<Counts>,
    date_coverage: String,
    notice: String,
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Page {
    items: Vec<Candidate>,
    next_cursor: Option<String>,
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct PageReply {
    page: Page,
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Review {
    view: View,
    review_token: String,
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Export {
    health: Health,
    exported: bool,
}
/// Only typed, validated values return; raw process messages never reach WebView.
pub fn reply(value: Value, operation: &str, expected_source: &str) -> Result<Value, &'static str> {
    let invalid = "usage_contract_invalid";
    let out = match operation {
        "overview" | "init" | "scan" | "replay" | "resolve" => {
            let mut v: Overview = serde_json::from_value(value).map_err(|_| invalid)?;
            if v.source != expected_source
                || !v.health.valid()
                || v.counts.as_ref().is_some_and(|c| !c.valid())
                || v.date_coverage != "unallocated"
            {
                return Err(invalid);
            }
            v.notice = "导出只含聚合，不含源正文。".into();
            serde_json::to_value(v)
        }
        "candidates" => {
            let v: PageReply = serde_json::from_value(value).map_err(|_| invalid)?;
            if v.page.items.len() > 64
                || v.page.items.iter().any(|c| !c.valid())
                || v.page
                    .next_cursor
                    .as_deref()
                    .is_some_and(|c| !token(c, "page"))
            {
                return Err(invalid);
            }
            serde_json::to_value(v)
        }
        "inspect" => {
            let v: Review = serde_json::from_value(value).map_err(|_| invalid)?;
            if !v.view.valid() || !token(&v.review_token, "review") {
                return Err(invalid);
            }
            serde_json::to_value(v)
        }
        "export" => {
            let v: Export = serde_json::from_value(value).map_err(|_| invalid)?;
            if !v.health.valid() || !v.exported {
                return Err(invalid);
            }
            serde_json::to_value(v)
        }
        _ => return Err(invalid),
    };
    out.map_err(|_| invalid)
}
pub fn runner_error(value: &Value) -> Option<String> {
    let o = value.as_object()?;
    if o.len() != 1 {
        return None;
    }
    let e = o.get("error")?.as_str()?;
    error_code(e).then(|| e.to_owned())
}
pub fn wrap(value: Value) -> Value {
    json!({"version":1,"result":value})
}

#[cfg(test)]
mod tests {
    use super::*;
    fn overview() -> Value {
        json!({"source":"codex_local","health":{"revision":0,"last_attempt":null,"last_completed":null,"last_successful":null,"attempt_error":null,"coverage":{"files":0,"complete_files":0,"records":0,"rejected":0,"incomplete_tails":0,"unreadable":0,"retained_files":0,"unsupported":0,"unsafe_entries":0,"counter_resets":0},"conflicts":0,"accepted_facts":0},"counts":null,"date_coverage":"unallocated","notice":"PRIVATE_SENTINEL"})
    }
    #[test]
    fn only_closed_typed_count_replies_cross_the_native_boundary() {
        let clean = reply(overview(), "overview", "codex_local").unwrap();
        assert!(!clean.to_string().contains("PRIVATE_SENTINEL"));
        let mut value = overview();
        value["health"]["path"] = json!("PRIVATE_SENTINEL");
        assert!(reply(value, "overview", "codex_local").is_err());
        let mut value = overview();
        value["health"]["attempt_error"] = json!("PRIVATE_SENTINEL");
        assert!(reply(value, "overview", "codex_local").is_err());
        let mut value = overview();
        value["health"]["last_attempt"] = json!("C:\\PRIVATE_SENTINEL");
        assert!(reply(value, "overview", "codex_local").is_err());
        assert!(reply(overview(), "overview", "claude_local").is_err());
        assert!(
            reply(
                json!({"page":{"items":[],"next_cursor":"C:\\PRIVATE_SENTINEL"}}),
                "candidates",
                "codex_local"
            )
            .is_err()
        );
        assert!(
            runner_error(&json!({"error":"unsafe_path","details":"PRIVATE_SENTINEL"})).is_none()
        );
        assert_eq!(
            runner_error(&json!({"error":"stale_read"})),
            Some("stale_read".into())
        );
    }
}
