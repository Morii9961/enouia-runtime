//! Count-only adapters; supplied JSON is transient, never a stored transcript.
use crate::count::{COUNT_KEYS, Counts, INPUT_KEYS, Token};
use crate::identity::IdentityKey;
use crate::time::{shanghai_day, timestamp};
use crate::{Error, Result};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::{BTreeMap, BTreeSet};

pub const ADAPTER_VERSION: &str = "0.1.0";
#[derive(Clone, Copy, Debug, PartialEq, Eq, Ord, PartialOrd, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Source {
    CodexLocal,
    ClaudeLocal,
}
impl Source {
    pub fn name(self) -> &'static str {
        match self {
            Self::CodexLocal => "codex_local",
            Self::ClaudeLocal => "claude_local",
        }
    }
    pub fn provider(self) -> &'static str {
        match self {
            Self::CodexLocal => "openai",
            Self::ClaudeLocal => "anthropic",
        }
    }
}

/// The caller approves public model labels; unknown/private source strings map to unknown.
pub struct Models(BTreeSet<String>);
impl Models {
    pub fn new(labels: &[String]) -> Result<Self> {
        if labels.len() > 128
            || labels.iter().any(|s| {
                s.is_empty()
                    || s.len() > 80
                    || !s.as_bytes()[0].is_ascii_alphanumeric()
                    || !s.bytes().all(|b| {
                        b.is_ascii_lowercase() || b.is_ascii_digit() || b"._-".contains(&b)
                    })
                    || ["sk-", "ghp_", "github_pat_"].iter().any(|p| s.contains(p))
            })
        {
            return Err(Error::Unconfigured);
        }
        Ok(Self(labels.iter().cloned().collect()))
    }
    pub fn resolve(&self, label: Option<&str>) -> String {
        label
            .filter(|s| self.0.contains(*s))
            .unwrap_or("unknown")
            .into()
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Fact {
    pub model: String,
    pub effort: String,
    pub effort_evidence: String,
    pub observed_date: Option<String>,
    pub time_basis: String,
    pub counts: Counts,
    /// Finite protocol codes, with fixed affected-object units. No text diagnostics.
    pub reasons: BTreeMap<String, Option<Token>>,
}
impl Fact {
    pub fn new(
        model: String,
        effort: String,
        evidence: String,
        date: Option<String>,
        counts: Counts,
    ) -> Self {
        let mut reasons = BTreeMap::from([(
            "pricing_conditions_unknown".into(),
            Some(Token::from_u64(1)),
        )]);
        if model == "unknown" {
            reasons.insert("model_unresolved".into(), Some(Token::from_u64(1)));
        }
        if evidence == "inferred" {
            reasons.insert("effort_inferred".into(), Some(Token::from_u64(1)));
        }
        if COUNT_KEYS.iter().any(|k| counts.get(k).is_none()) {
            reasons.insert("counts_unreported".into(), Some(Token::from_u64(1)));
        }
        let basis = if date.is_some() {
            reasons.insert("request_start_unavailable".into(), Some(Token::from_u64(1)));
            "usage_observation"
        } else {
            reasons.insert("checkpoint_unallocated".into(), Some(Token::from_u64(1)));
            "checkpoint_unknown"
        };
        Self {
            model,
            effort,
            effort_evidence: evidence,
            observed_date: date,
            time_basis: basis.into(),
            counts,
            reasons,
        }
    }
    pub fn quality(&self) -> Value {
        json!({"state":"reported","reasons":self.reasons.iter().map(|(code,n)|json!({"code":code,"occurrences":n})).collect::<Vec<_>>()})
    }
    pub fn wire(&self, source: Source) -> Value {
        json!({"provider":source.provider(),"model":self.model,"effort":self.effort,"effort_evidence":self.effort_evidence,
            "observed_date":self.observed_date,"time_basis":self.time_basis,"service_tier":"unknown","context_class":"unknown","region":"unknown","classification":"unknown",
            "cache_detail":if INPUT_KEYS.iter().all(|k|self.counts.get(k).is_some()){"complete"}else{"missing"},"counts":self.counts,"quality":self.quality()})
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Vector {
    pub input: Token,
    pub cached: Option<Token>,
    pub write: Option<Token>,
    pub output: Token,
    pub reasoning: Option<Token>,
    pub total: Token,
}
fn raw(value: &Value, key: &str) -> Result<Option<Token>> {
    match value.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(v) => v
            .as_u64()
            .map(Token::from_u64)
            .map(Some)
            .ok_or(Error::InvalidCounts),
    }
}
impl Vector {
    pub fn read(value: &Value) -> Result<Self> {
        let v = Self {
            input: raw(value, "input_tokens")?.ok_or(Error::InvalidCounts)?,
            cached: raw(value, "cached_input_tokens")?,
            write: raw(value, "cache_write_input_tokens")?,
            output: raw(value, "output_tokens")?.ok_or(Error::InvalidCounts)?,
            reasoning: raw(value, "reasoning_output_tokens")?,
            total: raw(value, "total_tokens")?.ok_or(Error::InvalidCounts)?,
        };
        v.validate()?;
        Ok(v)
    }
    pub fn validate(&self) -> Result<()> {
        if self.input.add(&self.output)? != self.total {
            return Err(Error::InvalidCounts);
        }
        if self.cached.as_ref().is_some_and(|n| n > &self.input)
            || self.write.as_ref().is_some_and(|n| n > &self.input)
            || self.reasoning.as_ref().is_some_and(|n| n > &self.output)
        {
            return Err(Error::InvalidCounts);
        }
        if let (Some(a), Some(b)) = (&self.cached, &self.write)
            && a.add(b)? > self.input
        {
            return Err(Error::InvalidCounts);
        }
        Ok(())
    }
    pub fn diff(&self, old: &Self) -> Result<Self> {
        let delta = |a: &Option<Token>, b: &Option<Token>| -> Result<Option<Token>> {
            match (a, b) {
                (Some(a), Some(b)) => Ok(Some(a.sub(b)?)),
                _ => Ok(None),
            }
        };
        let v = Self {
            input: self.input.sub(&old.input)?,
            cached: delta(&self.cached, &old.cached)?,
            write: delta(&self.write, &old.write)?,
            output: self.output.sub(&old.output)?,
            reasoning: delta(&self.reasoning, &old.reasoning)?,
            total: self.total.sub(&old.total)?,
        };
        v.validate()?;
        Ok(v)
    }
    pub fn vertex(&self) -> String {
        enouia_common::sha256_hex(
            serde_json::to_string(self)
                .expect("metering vector")
                .as_bytes(),
        )
    }
    pub fn counts(&self) -> Result<Counts> {
        let mut c = Counts::default();
        c.set("input_total", Some(self.input.clone()));
        c.set("input_cache_read", self.cached.clone());
        c.set("output_total", Some(self.output.clone()));
        c.set("output_reasoning_subset", self.reasoning.clone());
        if let Some(w) = &self.write {
            c.set("input_cache_write_unknown", Some(w.clone()));
            if w.is_zero() {
                for k in [
                    "input_cache_write_5m",
                    "input_cache_write_1h",
                    "input_cache_write_30m",
                ] {
                    c.set(k, Some(Token::zero()));
                }
            }
            if let Some(read) = &self.cached {
                c.set("input_uncached", Some(self.input.sub(read)?.sub(w)?));
            }
        }
        c.validate()?;
        Ok(c)
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum Record {
    Checkpoint {
        vector: Vector,
    },
    Step {
        before: Vector,
        after: Vector,
        fact: Box<Fact>,
    },
    Message {
        fact: Fact,
        sidechain: bool,
    },
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Observation {
    pub source: Source,
    pub group: String,
    pub identity: String,
    pub record: Record,
}

pub struct Codex<'a> {
    key: &'a IdentityKey,
    models: &'a Models,
    group: Option<String>,
    previous: Option<Vector>,
    last_time: Option<i64>,
    context: Option<(String, String)>,
    mixed: bool,
    pub last_mismatch: bool,
}
impl<'a> Codex<'a> {
    pub fn new(key: &'a IdentityKey, models: &'a Models) -> Self {
        Self {
            key,
            models,
            group: None,
            previous: None,
            last_time: None,
            context: None,
            mixed: false,
            last_mismatch: false,
        }
    }
    pub fn group(&self) -> Option<&str> {
        self.group.as_deref()
    }
    pub fn push(&mut self, line: &Value) -> Result<Option<Observation>> {
        let p = &line["payload"];
        match line["type"].as_str() {
            Some("session_meta") => {
                let id = p["id"]
                    .as_str()
                    .filter(|s| !s.is_empty() && s.len() <= 160)
                    .ok_or(Error::UnsupportedSource)?;
                if p.get("forked_from_id").is_some_and(|v| !v.is_null()) {
                    return Err(Error::UnsupportedSource);
                }
                let group = self.key.digest("codex_session", &[id.as_bytes()]);
                if self.group.as_ref().is_some_and(|old| old != &group) {
                    return Err(Error::Conflict);
                }
                self.group = Some(group);
                Ok(None)
            }
            Some("turn_context") => {
                let next = (
                    self.models.resolve(p["model"].as_str()),
                    effort(p["effort"].as_str()),
                );
                if self.previous.is_some() && self.context.as_ref().is_some_and(|old| old != &next)
                {
                    self.mixed = true;
                }
                self.context = Some(next);
                Ok(None)
            }
            Some("event_msg") if p["type"] == "token_count" => {
                if p["info"].is_null() {
                    return Ok(None);
                }
                let group = self.group.clone().ok_or(Error::UnsupportedSource)?;
                let current = Vector::read(&p["info"]["total_token_usage"])?;
                let at = line["timestamp"].as_str().and_then(|v| timestamp(v).ok());
                if let (Some(old), Some(now)) = (self.last_time, at)
                    && now < old
                {
                    return Err(Error::Conflict);
                }
                let record = if let Some(previous) = &self.previous {
                    if previous == &current {
                        return Ok(None);
                    }
                    let delta = current.diff(previous)?;
                    self.last_mismatch = p["info"]
                        .get("last_token_usage")
                        .is_some_and(|last| Vector::read(last).map_or(true, |v| v != delta));
                    let (model, e) = if self.mixed {
                        ("unknown".into(), "unknown".into())
                    } else {
                        self.context
                            .clone()
                            .unwrap_or(("unknown".into(), "unknown".into()))
                    };
                    let evidence = if e == "unknown" {
                        "unknown"
                    } else {
                        "inferred"
                    }
                    .into();
                    let day = line["timestamp"]
                        .as_str()
                        .and_then(|v| shanghai_day(v).ok());
                    let mut fact = Fact::new(model, e, evidence, day, delta.counts()?);
                    if self.last_mismatch {
                        fact.reasons
                            .insert("parse_rejected".into(), Some(Token::from_u64(1)));
                    }
                    Record::Step {
                        before: previous.clone(),
                        after: current.clone(),
                        fact: Box::new(fact),
                    }
                } else {
                    Record::Checkpoint {
                        vector: current.clone(),
                    }
                };
                let identity = match &record {
                    Record::Checkpoint { vector } => self.key.digest(
                        "codex_checkpoint",
                        &[group.as_bytes(), vector.vertex().as_bytes()],
                    ),
                    Record::Step { before, after, .. } => self.key.digest(
                        "codex_step",
                        &[
                            group.as_bytes(),
                            before.vertex().as_bytes(),
                            after.vertex().as_bytes(),
                        ],
                    ),
                    _ => unreachable!(),
                };
                self.previous = Some(current);
                self.last_time = at;
                self.mixed = false;
                Ok(Some(Observation {
                    source: Source::CodexLocal,
                    group,
                    identity,
                    record,
                }))
            }
            _ => Ok(None),
        }
    }
}
fn effort(raw: Option<&str>) -> String {
    raw.filter(|v| ["low", "medium", "high", "xhigh", "max"].contains(v))
        .unwrap_or("unknown")
        .into()
}

pub fn claude(line: &Value, key: &IdentityKey, models: &Models) -> Result<Option<Observation>> {
    if line["type"] != "assistant" {
        return Ok(None);
    }
    let message = &line["message"];
    let usage = &message["usage"];
    if usage.is_null() {
        return Ok(None);
    }
    let id = message["id"]
        .as_str()
        .filter(|s| !s.is_empty() && s.len() <= 160)
        .ok_or(Error::UnsupportedSource)?;
    let request = line["requestId"].as_str().unwrap_or("");
    if request.len() > 160 {
        return Err(Error::UnsupportedSource);
    }
    let ordinary = raw(usage, "input_tokens")?.ok_or(Error::InvalidCounts)?;
    let output = raw(usage, "output_tokens")?.ok_or(Error::InvalidCounts)?;
    let read = raw(usage, "cache_read_input_tokens")?;
    let total = raw(usage, "cache_creation_input_tokens")?;
    let five = raw(&usage["cache_creation"], "ephemeral_5m_input_tokens")?;
    let hour = raw(&usage["cache_creation"], "ephemeral_1h_input_tokens")?;
    let nested = match (&five, &hour) {
        (Some(a), Some(b)) => Some(a.add(b)?),
        _ => None,
    };
    if let Some(total) = &total {
        let known = five
            .as_ref()
            .unwrap_or(&Token::zero())
            .add(hour.as_ref().unwrap_or(&Token::zero()))?;
        if &known > total {
            return Err(Error::InvalidCounts);
        }
    }
    if let (Some(a), Some(b)) = (&total, &nested)
        && a != b
    {
        return Err(Error::InvalidCounts);
    }
    let write = total.or(nested);
    let mut c = Counts::default();
    c.set("input_uncached", Some(ordinary.clone()));
    c.set("input_cache_read", read.clone());
    c.set("output_total", Some(output));
    match (&write, &five, &hour) {
        (Some(total), _, _) if total.is_zero() => {
            for k in [
                "input_cache_write_5m",
                "input_cache_write_1h",
                "input_cache_write_30m",
                "input_cache_write_unknown",
            ] {
                c.set(k, Some(Token::zero()));
            }
        }
        (Some(_), Some(f), Some(h)) => {
            c.set("input_cache_write_5m", Some(f.clone()));
            c.set("input_cache_write_1h", Some(h.clone()));
            c.set("input_cache_write_30m", Some(Token::zero()));
            c.set("input_cache_write_unknown", Some(Token::zero()));
        }
        (Some(total), _, _) => {
            c.set("input_cache_write_unknown", Some(total.clone()));
        }
        _ => {}
    }
    if let (Some(read), Some(write)) = (&read, &write) {
        c.set("input_total", Some(ordinary.add(read)?.add(write)?));
    }
    c.validate()?;
    let fact = Fact::new(
        models.resolve(message["model"].as_str()),
        "unknown".into(),
        "unknown".into(),
        line["timestamp"]
            .as_str()
            .and_then(|v| shanghai_day(v).ok()),
        c,
    );
    let group = key.digest("claude_message", &[id.as_bytes()]);
    let identity = key.digest("claude_request", &[group.as_bytes(), request.as_bytes()]);
    Ok(Some(Observation {
        source: Source::ClaudeLocal,
        group,
        identity,
        record: Record::Message {
            fact,
            sidechain: line["isSidechain"] == true,
        },
    }))
}

/// Strict set union for source copies. Changed observations need reviewed revision resolution.
pub fn unique<'a>(items: impl IntoIterator<Item = &'a Observation>) -> Result<Vec<Observation>> {
    let mut map = BTreeMap::new();
    for item in items {
        if let Some(old) = map.insert(&item.identity, item)
            && old != item
        {
            return Err(Error::Conflict);
        }
    }
    Ok(map.into_values().cloned().collect())
}
