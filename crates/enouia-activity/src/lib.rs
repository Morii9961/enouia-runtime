//! Pure Activity merge. Collector adapters, storage, and delivery live elsewhere.

use enouia_activity_contract::{
    ActivityData, ActivitySources, BatchSources, ContractError, Day, ResultKind, Snapshot,
    SourceOutcome, activity_timestamp_ms, checked_safe_sum, exact_activity_timestamp_ms,
    normalize_activity, shanghai_date,
};
use enouia_common::{Clock, ErrorCode};
use std::collections::BTreeMap;

const AI_FLOOR: &str = "2026-01-01";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SourceId {
    Github,
    Codex,
    Claude,
}

impl SourceId {
    fn index(self) -> usize {
        match self {
            Self::Github => 0,
            Self::Codex => 1,
            Self::Claude => 2,
        }
    }
}

/// Success contains a fully acquired report. Adapters validate raw reports
/// before constructing this type; merge validates the wire snapshot again.
#[derive(Clone, Debug)]
pub enum SourceAttempt {
    Success {
        source: SourceId,
        attempted_at: String,
        snapshot: Snapshot,
    },
    Failed {
        source: SourceId,
        attempted_at: String,
        error_code: ErrorCode,
    },
}

impl SourceAttempt {
    fn source(&self) -> SourceId {
        match self {
            Self::Success { source, .. } | Self::Failed { source, .. } => *source,
        }
    }

    fn attempted_at(&self) -> &str {
        match self {
            Self::Success { attempted_at, .. } | Self::Failed { attempted_at, .. } => attempted_at,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Disposition {
    Applied,
    CollectorFailed(ErrorCode),
    InvalidSnapshot,
    NoAdmissibleDays,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct SourceDelta {
    pub disposition: Disposition,
    pub new_dates: usize,
    pub revised_dates: usize,
    /// Signed difference between safe integer totals, including corrections.
    pub total_change: i64,
    pub ignored_future_days: usize,
    pub ignored_before_floor_days: usize,
}

impl SourceDelta {
    fn retained(disposition: Disposition) -> Self {
        Self {
            disposition,
            new_dates: 0,
            revised_dates: 0,
            total_change: 0,
            ignored_future_days: 0,
            ignored_before_floor_days: 0,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MergeDeltas {
    pub github: SourceDelta,
    pub codex: SourceDelta,
    pub claude: SourceDelta,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MergeResult {
    pub data: ActivityData,
    pub outcomes: BatchSources,
    pub deltas: MergeDeltas,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MergeError {
    InvalidPrevious(ContractError),
    InvalidAttempt,
    ClockRegression,
    InvalidClock,
    InvalidMerged(ContractError),
}

fn normalized_source(source: SourceId, snapshot: &Snapshot) -> Option<Snapshot> {
    let raw = match source {
        SourceId::Github => {
            serde_json::json!({"version":1,"sources":{"github":snapshot,"codex":null,"claude":null}})
        }
        SourceId::Codex => {
            serde_json::json!({"version":1,"sources":{"github":null,"codex":snapshot,"claude":null}})
        }
        SourceId::Claude => {
            serde_json::json!({"version":1,"sources":{"github":null,"codex":null,"claude":snapshot}})
        }
    };
    let clean = normalize_activity(&raw).ok()?;
    match source {
        SourceId::Github => clean.sources.github,
        SourceId::Codex => clean.sources.codex,
        SourceId::Claude => clean.sources.claude,
    }
}

fn merge_one(
    source: SourceId,
    previous: Option<Snapshot>,
    attempt: SourceAttempt,
    end_date: &str,
) -> (Option<Snapshot>, SourceOutcome, SourceDelta) {
    let attempted_at = attempt.attempted_at().to_owned();
    let mut disposition = Disposition::Applied;
    let mut next = previous.clone();
    let mut delta = SourceDelta::retained(Disposition::Applied);

    match attempt {
        SourceAttempt::Failed { error_code, .. } => {
            disposition = Disposition::CollectorFailed(error_code);
        }
        SourceAttempt::Success { snapshot, .. } => {
            if snapshot.updated_at != attempted_at {
                disposition = Disposition::InvalidSnapshot;
            } else if let Some(incoming) = normalized_source(source, &snapshot) {
                let mut days: BTreeMap<String, u64> = previous
                    .as_ref()
                    .map(|old| old.days.iter().map(|d| (d.date.clone(), d.value)).collect())
                    .unwrap_or_default();
                let old_total = days.values().copied().sum::<u64>();
                let mut accepted = 0;
                for day in &incoming.days {
                    if day.date.as_str() > end_date {
                        delta.ignored_future_days += 1;
                    } else if source != SourceId::Github && day.date.as_str() < AI_FLOOR {
                        delta.ignored_before_floor_days += 1;
                    } else {
                        accepted += 1;
                        match days.insert(day.date.clone(), day.value) {
                            None => delta.new_dates += 1,
                            Some(old) if old != day.value => delta.revised_dates += 1,
                            Some(_) => {}
                        }
                    }
                }
                if accepted == 0 {
                    disposition = Disposition::NoAdmissibleDays;
                } else if let Ok(new_total) = checked_safe_sum(days.values().copied()) {
                    delta.total_change = new_total as i64 - old_total as i64;
                    next = Some(Snapshot {
                        updated_at: attempted_at.clone(),
                        timezone: incoming.timezone,
                        metric: incoming.metric,
                        days: days
                            .into_iter()
                            .map(|(date, value)| Day { date, value })
                            .collect(),
                    });
                } else {
                    disposition = Disposition::InvalidSnapshot;
                }
            } else {
                disposition = Disposition::InvalidSnapshot;
            }
        }
    }

    if disposition != Disposition::Applied {
        next = previous;
        delta.new_dates = 0;
        delta.revised_dates = 0;
        delta.total_change = 0;
    }
    delta.disposition = disposition;
    let outcome = SourceOutcome {
        attempted_at,
        succeeded_at: next.as_ref().map(|s| s.updated_at.clone()),
        result: if disposition == Disposition::Applied {
            ResultKind::Success
        } else {
            ResultKind::Failed
        },
    };
    (next, outcome, delta)
}

/// Merge one complete three-source attempt set. This function never mutates
/// previous data. A clock regression or malformed attempt set blocks the whole
/// transaction; an invalid individual source retains that source's old data.
pub fn merge_activity<C: Clock>(
    previous: &ActivityData,
    attempts: [SourceAttempt; 3],
    clock: &C,
) -> Result<MergeResult, MergeError> {
    let raw = serde_json::to_value(previous).map_err(|_| MergeError::InvalidAttempt)?;
    let previous = normalize_activity(&raw).map_err(MergeError::InvalidPrevious)?;
    let mut ordered: [Option<SourceAttempt>; 3] = [None, None, None];
    for attempt in attempts {
        let slot = &mut ordered[attempt.source().index()];
        if slot.is_some() {
            return Err(MergeError::InvalidAttempt);
        }
        *slot = Some(attempt);
    }
    let [Some(github), Some(codex), Some(claude)] = ordered else {
        return Err(MergeError::InvalidAttempt);
    };
    let attempted_at = github.attempted_at();
    if attempted_at != codex.attempted_at() || attempted_at != claude.attempted_at() {
        return Err(MergeError::InvalidAttempt);
    }
    let attempted_ms =
        exact_activity_timestamp_ms(attempted_at).ok_or(MergeError::InvalidAttempt)?;
    let now_ms = clock.now_unix_ms();
    if attempted_ms > now_ms {
        return Err(MergeError::ClockRegression);
    }
    let end_date = shanghai_date(attempted_ms).ok_or(MergeError::InvalidClock)?;
    for old in [
        &previous.sources.github,
        &previous.sources.codex,
        &previous.sources.claude,
    ]
    .into_iter()
    .flatten()
    {
        if activity_timestamp_ms(&old.updated_at).is_none_or(|ms| ms > attempted_ms || ms > now_ms)
            || old.days.iter().any(|day| day.date > end_date)
        {
            return Err(MergeError::ClockRegression);
        }
    }

    let (github_data, github_outcome, github_delta) =
        merge_one(SourceId::Github, previous.sources.github, github, &end_date);
    let (codex_data, codex_outcome, codex_delta) =
        merge_one(SourceId::Codex, previous.sources.codex, codex, &end_date);
    let (claude_data, claude_outcome, claude_delta) =
        merge_one(SourceId::Claude, previous.sources.claude, claude, &end_date);
    let data = ActivityData {
        version: 1,
        sources: ActivitySources {
            github: github_data,
            codex: codex_data,
            claude: claude_data,
        },
    };
    let raw = serde_json::to_value(&data).map_err(|_| MergeError::InvalidAttempt)?;
    normalize_activity(&raw).map_err(MergeError::InvalidMerged)?;
    Ok(MergeResult {
        data,
        outcomes: BatchSources {
            github: github_outcome,
            codex: codex_outcome,
            claude: claude_outcome,
        },
        deltas: MergeDeltas {
            github: github_delta,
            codex: codex_delta,
            claude: claude_delta,
        },
    })
}
