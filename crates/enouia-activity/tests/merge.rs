use enouia_activity::{Disposition, MergeError, SourceAttempt, SourceId, merge_activity};
use enouia_activity_contract::{
    ActivityData, Day, MAX_SAFE_INTEGER, ResultKind, Snapshot, normalize_activity,
    public_data_bytes,
};
use enouia_common::{ErrorCode, FakeClock};
use serde_json::{Value, json};

const ATTEMPT: &str = "2026-09-26T08:00:00.000Z";
const OLD: &str = "2026-09-25T08:00:00.000Z";

fn clock() -> FakeClock {
    FakeClock::new(1_790_409_601_000)
}

fn empty() -> ActivityData {
    normalize_activity(&json!({"version":1,"sources":{"github":null,"codex":null,"claude":null}}))
        .unwrap()
}

fn snapshot(source: SourceId, at: &str, days: &[(&str, u64)]) -> Snapshot {
    let (timezone, metric) = match source {
        SourceId::Github => ("GitHub", "contributions"),
        SourceId::Codex => ("Codex", "tokens"),
        SourceId::Claude => ("Asia/Shanghai", "tokens"),
    };
    Snapshot {
        updated_at: at.to_owned(),
        timezone: timezone.to_owned(),
        metric: metric.to_owned(),
        days: days
            .iter()
            .map(|(date, value)| Day {
                date: (*date).to_owned(),
                value: *value,
            })
            .collect(),
    }
}

fn success(source: SourceId, days: &[(&str, u64)]) -> SourceAttempt {
    SourceAttempt::Success {
        source,
        attempted_at: ATTEMPT.to_owned(),
        snapshot: snapshot(source, ATTEMPT, days),
    }
}

fn failed(source: SourceId) -> SourceAttempt {
    SourceAttempt::Failed {
        source,
        attempted_at: ATTEMPT.to_owned(),
        error_code: ErrorCode::UnsupportedMethod,
    }
}

#[test]
fn committed_attempt_fixture_preserves_failed_history_and_explicit_zero() {
    let raw: Value = serde_json::from_str(include_str!(
        "../../../tests/fixtures/activity/source-attempts-v1.json"
    ))
    .unwrap();
    let previous = normalize_activity(&raw["previous"]).unwrap();
    let attempts = [&raw["attempts"][0], &raw["attempts"][1], &raw["attempts"][2]]
        .map(|item| {
            let source = match item["source"].as_str().unwrap() {
                "github" => SourceId::Github,
                "codex" => SourceId::Codex,
                "claude" => SourceId::Claude,
                _ => unreachable!(),
            };
            if item["result"] == "failed" {
                failed(source)
            } else {
                let clean = normalize_activity(&json!({
                    "version":1,
                    "sources":{
                        "github":if source == SourceId::Github { item["validatedIncomingSnapshot"].clone() } else { Value::Null },
                        "codex":if source == SourceId::Codex { item["validatedIncomingSnapshot"].clone() } else { Value::Null },
                        "claude":if source == SourceId::Claude { item["validatedIncomingSnapshot"].clone() } else { Value::Null }
                    }
                }))
                .unwrap();
                let snapshot = match source {
                    SourceId::Github => clean.sources.github.unwrap(),
                    SourceId::Codex => clean.sources.codex.unwrap(),
                    SourceId::Claude => clean.sources.claude.unwrap(),
                };
                SourceAttempt::Success {
                    source,
                    attempted_at: ATTEMPT.to_owned(),
                    snapshot,
                }
            }
        });
    let merged = merge_activity(&previous, attempts, &clock()).unwrap();
    assert_eq!(merged.data.sources.codex, previous.sources.codex);
    assert_eq!(merged.outcomes.codex.succeeded_at.as_deref(), Some(OLD));
    assert_eq!(merged.outcomes.codex.result, ResultKind::Failed);
    assert_eq!(
        merged.data.sources.github.as_ref().unwrap().days[1].value,
        0
    );
    assert_eq!(merged.deltas.github.new_dates, 1);
    assert_eq!(merged.deltas.claude.total_change, 7);
    assert_eq!(merged.outcomes.claude.result, ResultKind::Success);
    assert_eq!(
        merged.data.sources.github.unwrap().days[0].date,
        "2026-09-24"
    );
}

#[test]
fn corrections_replace_values_and_missing_days_remain() {
    let mut previous = empty();
    previous.sources.github = Some(snapshot(
        SourceId::Github,
        OLD,
        &[("2026-09-23", 2), ("2026-09-24", 4), ("2026-09-25", 8)],
    ));
    let merged = merge_activity(
        &previous,
        [
            success(SourceId::Github, &[("2026-09-24", 1), ("2026-09-25", 10)]),
            failed(SourceId::Codex),
            failed(SourceId::Claude),
        ],
        &clock(),
    )
    .unwrap();
    let days = &merged.data.sources.github.unwrap().days;
    assert_eq!(days.iter().map(|d| d.value).collect::<Vec<_>>(), [2, 1, 10]);
    assert_eq!(merged.deltas.github.new_dates, 0);
    assert_eq!(merged.deltas.github.revised_dates, 2);
    assert_eq!(merged.deltas.github.total_change, -1);
}

#[test]
fn explicit_zero_and_zero_growth_are_successful() {
    let merged = merge_activity(
        &empty(),
        [
            failed(SourceId::Github),
            success(SourceId::Codex, &[("2026-09-26", 0)]),
            failed(SourceId::Claude),
        ],
        &clock(),
    )
    .unwrap();
    assert_eq!(merged.outcomes.codex.result, ResultKind::Success);
    assert_eq!(merged.deltas.codex.total_change, 0);
    assert_eq!(merged.data.sources.codex.unwrap().days[0].value, 0);
}

#[test]
fn ai_floor_and_future_days_do_not_evict_old_history() {
    let mut previous = empty();
    previous.sources.codex = Some(snapshot(SourceId::Codex, OLD, &[("2025-12-31", 5)]));
    let merged = merge_activity(
        &previous,
        [
            failed(SourceId::Github),
            success(
                SourceId::Codex,
                &[("2025-12-30", 2), ("2026-09-27", 3), ("2026-09-26", 4)],
            ),
            failed(SourceId::Claude),
        ],
        &clock(),
    )
    .unwrap();
    assert_eq!(merged.data.sources.codex.unwrap().days.len(), 2);
    assert_eq!(merged.deltas.codex.ignored_before_floor_days, 1);
    assert_eq!(merged.deltas.codex.ignored_future_days, 1);
    assert_eq!(merged.deltas.codex.total_change, 4);
}

#[test]
fn no_admissible_days_fails_only_that_source() {
    let mut previous = empty();
    previous.sources.codex = Some(snapshot(SourceId::Codex, OLD, &[("2026-09-24", 10)]));
    let merged = merge_activity(
        &previous,
        [
            success(SourceId::Github, &[("2026-09-26", 1)]),
            success(SourceId::Codex, &[("2026-09-27", 8)]),
            failed(SourceId::Claude),
        ],
        &clock(),
    )
    .unwrap();
    assert_eq!(
        merged.deltas.codex.disposition,
        Disposition::NoAdmissibleDays
    );
    assert_eq!(merged.data.sources.codex, previous.sources.codex);
    assert_eq!(merged.outcomes.github.result, ResultKind::Success);
}

#[test]
fn invalid_source_and_unsafe_merged_sum_retain_only_that_source() {
    let mut previous = empty();
    previous.sources.codex = Some(snapshot(
        SourceId::Codex,
        OLD,
        &[("2026-09-24", MAX_SAFE_INTEGER)],
    ));
    let mut invalid = snapshot(SourceId::Github, ATTEMPT, &[("2026-02-29", 1)]);
    invalid.metric = "tokens".to_owned();
    let merged = merge_activity(
        &previous,
        [
            SourceAttempt::Success {
                source: SourceId::Github,
                attempted_at: ATTEMPT.to_owned(),
                snapshot: invalid,
            },
            success(SourceId::Codex, &[("2026-09-26", 1)]),
            failed(SourceId::Claude),
        ],
        &clock(),
    )
    .unwrap();
    assert_eq!(
        merged.deltas.github.disposition,
        Disposition::InvalidSnapshot
    );
    assert_eq!(
        merged.deltas.codex.disposition,
        Disposition::InvalidSnapshot
    );
    assert_eq!(merged.data.sources.codex, previous.sources.codex);
    assert!(merged.data.sources.github.is_none());
}

#[test]
fn regressions_and_incomplete_attempt_sets_block_everything() {
    let mut previous = empty();
    previous.sources.github = Some(snapshot(SourceId::Github, OLD, &[("2026-09-27", 1)]));
    assert_eq!(
        merge_activity(
            &previous,
            [
                failed(SourceId::Github),
                failed(SourceId::Codex),
                failed(SourceId::Claude)
            ],
            &clock()
        )
        .unwrap_err(),
        MergeError::ClockRegression
    );
    previous.sources.github.as_mut().unwrap().days[0].date = "2026-09-25".to_owned();
    previous.sources.github.as_mut().unwrap().updated_at = "2026-09-27T08:00:00.000Z".to_owned();
    assert_eq!(
        merge_activity(
            &previous,
            [
                failed(SourceId::Github),
                failed(SourceId::Codex),
                failed(SourceId::Claude)
            ],
            &clock()
        )
        .unwrap_err(),
        MergeError::ClockRegression
    );
    assert_eq!(
        merge_activity(
            &empty(),
            [
                failed(SourceId::Github),
                failed(SourceId::Github),
                failed(SourceId::Claude)
            ],
            &clock()
        )
        .unwrap_err(),
        MergeError::InvalidAttempt
    );
    let clock = FakeClock::new(1_790_409_599_000);
    assert_eq!(
        merge_activity(
            &empty(),
            [
                failed(SourceId::Github),
                failed(SourceId::Codex),
                failed(SourceId::Claude)
            ],
            &clock
        )
        .unwrap_err(),
        MergeError::ClockRegression
    );
}

#[test]
fn public_bytes_keep_the_existing_contract_order() {
    let merged = merge_activity(
        &empty(),
        [
            failed(SourceId::Github),
            success(SourceId::Codex, &[("2026-09-26", 0)]),
            failed(SourceId::Claude),
        ],
        &clock(),
    )
    .unwrap();
    let bytes = public_data_bytes(&merged.data).unwrap();
    assert!(bytes.starts_with(b"{\"version\":1,\"sources\":{\"github\":null,\"codex\":"));
    assert!(bytes.ends_with(b"\"claude\":null}}\n"));
}
