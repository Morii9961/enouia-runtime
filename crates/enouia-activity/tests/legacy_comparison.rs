use enouia_activity::claude::parse_reports;
use enouia_activity::codex::parse_usage;
use enouia_activity::github::parse_calendar;
use enouia_activity::{SourceAttempt, SourceId, merge_activity};
use enouia_activity_contract::{Day, Snapshot, normalize_activity};
use enouia_common::FakeClock;
use serde_json::{Value, json};

const ORACLE: &str =
    include_str!("../../../tests/fixtures/activity/legacy-source-snapshots-v1.json");
const GITHUB: &str = include_str!("../../../tests/fixtures/activity/github-calendar-v1.json");
const CODEX: &str = include_str!("../../../tests/fixtures/activity/codex-usage-v1.json");
const CLAUDE: &str = include_str!("../../../tests/fixtures/activity/claude-stores-v1.json");

fn inputs() -> (Value, Value, Vec<Value>, Value) {
    (
        serde_json::from_str(GITHUB).unwrap(),
        serde_json::from_str(CODEX).unwrap(),
        serde_json::from_str(CLAUDE).unwrap(),
        serde_json::from_str(ORACLE).unwrap(),
    )
}

fn attempts(at: &str, github: Value, codex: Value, claude: &[Value]) -> [SourceAttempt; 3] {
    [
        SourceAttempt::Success {
            source: SourceId::Github,
            attempted_at: at.to_owned(),
            snapshot: parse_calendar(&github, at).unwrap(),
        },
        SourceAttempt::Success {
            source: SourceId::Codex,
            attempted_at: at.to_owned(),
            snapshot: parse_usage(&codex, at).unwrap(),
        },
        SourceAttempt::Success {
            source: SourceId::Claude,
            attempted_at: at.to_owned(),
            snapshot: parse_reports(claude, at).unwrap(),
        },
    ]
}

#[test]
fn three_source_baseline_matches_legacy_importers_on_identical_reports() {
    let (github, codex, claude, oracle) = inputs();
    let at = oracle["attemptedAt"].as_str().unwrap();
    let previous = normalize_activity(&json!({
        "version": 1,
        "sources": {"github": null, "codex": null, "claude": null}
    }))
    .unwrap();
    let result = merge_activity(
        &previous,
        attempts(at, github, codex, &claude),
        &FakeClock::new(1_790_409_601_000),
    )
    .unwrap();
    assert_eq!(
        serde_json::to_value(result.data).unwrap(),
        oracle["baseline"]
    );
}

#[test]
fn lower_claude_report_keeps_the_archived_day_like_legacy() {
    let (github, codex, claude, oracle) = inputs();
    let at = oracle["attemptedAt"].as_str().unwrap();
    let correction = &oracle["claudeDownwardCorrection"];
    let mut previous = normalize_activity(&json!({
        "version": 1,
        "sources": {"github": null, "codex": null, "claude": null}
    }))
    .unwrap();
    previous.sources.claude = Some(Snapshot {
        updated_at: "2026-09-25T08:00:00.000Z".to_owned(),
        timezone: "Asia/Shanghai".to_owned(),
        metric: "tokens".to_owned(),
        days: vec![Day {
            date: correction["date"].as_str().unwrap().to_owned(),
            value: correction["previous"].as_u64().unwrap(),
        }],
    });
    let result = merge_activity(
        &previous,
        attempts(at, github, codex, &claude),
        &FakeClock::new(1_790_409_601_000),
    )
    .unwrap();
    let value = result.data.sources.claude.unwrap().days[0].value;
    // ADR-029: upstream Claude stores prune transcripts, so the lower
    // complete report keeps the archived value, matching legacy.
    assert_eq!(value, correction["runtime"].as_u64().unwrap());
    assert_eq!(value, correction["legacy"].as_u64().unwrap());
    assert_eq!(result.deltas.claude.revised_dates, 0);
    assert_eq!(result.deltas.claude.retained_higher_days, 1);
    assert_eq!(result.deltas.claude.total_change, 1);
}
