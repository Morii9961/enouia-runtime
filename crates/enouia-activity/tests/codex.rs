use enouia_activity::codex::parse_usage;
use enouia_activity::{SourceAttempt, SourceId, merge_activity};
use enouia_activity_contract::{Day, MAX_SAFE_INTEGER, Snapshot, normalize_activity};
use enouia_common::{ErrorCode, FakeClock};
use serde_json::{Value, json};

const ATTEMPT: &str = "2026-09-26T08:00:00.000Z";
const FIXTURE: &str = include_str!("../../../tests/fixtures/activity/codex-usage-v1.json");

fn fixture() -> Value {
    serde_json::from_str(FIXTURE).unwrap()
}

#[test]
fn complete_usage_reconciles_and_preserves_server_day_labels() {
    let snapshot = parse_usage(&fixture(), ATTEMPT).unwrap();
    assert_eq!(snapshot.timezone, "Codex");
    assert_eq!(snapshot.metric, "tokens");
    assert_eq!(snapshot.days[0].date, "2026-09-25");
    assert_eq!(snapshot.days[1].value, 0);
    assert!(
        !serde_json::to_string(&snapshot)
            .unwrap()
            .contains("DO_NOT_EXPORT")
    );
}

#[test]
fn missing_or_invalid_lifetime_fails_even_when_legacy_would_accept_it() {
    for lifetime in [
        Value::Null,
        json!(-1),
        json!(MAX_SAFE_INTEGER + 1),
        json!("10"),
        json!(9),
    ] {
        let mut report = fixture();
        report["summary"]["lifetimeTokens"] = lifetime;
        assert_eq!(
            parse_usage(&report, ATTEMPT).unwrap_err(),
            ErrorCode::SourceInvalid
        );
    }
    let mut report = fixture();
    report.as_object_mut().unwrap().remove("summary");
    assert_eq!(
        parse_usage(&report, ATTEMPT).unwrap_err(),
        ErrorCode::SourceInvalid
    );
}

#[test]
fn invalid_buckets_do_not_masquerade_as_zero_usage() {
    for buckets in [
        Value::Null,
        json!([]),
        json!([{"startDate":"2026-02-30","tokens":10}]),
        json!([{"startDate":"2026-09-26","tokens":-1}]),
        json!([{"startDate":"2026-09-26","tokens":MAX_SAFE_INTEGER + 1}]),
        json!([{"startDate":"2026-09-26","tokens":"10"}]),
        json!([
            {"startDate":"2026-09-26","tokens":5},
            {"startDate":"2026-09-26","tokens":5}
        ]),
    ] {
        let mut report = fixture();
        report["dailyUsageBuckets"] = buckets;
        assert_eq!(
            parse_usage(&report, ATTEMPT).unwrap_err(),
            ErrorCode::SourceInvalid
        );
    }
    assert_eq!(
        parse_usage(&fixture(), "2026-09-26T08:00:00Z").unwrap_err(),
        ErrorCode::SourceInvalid
    );
    let overflow = json!({
        "summary":{"lifetimeTokens":MAX_SAFE_INTEGER},
        "dailyUsageBuckets":[
            {"startDate":"2026-09-25","tokens":MAX_SAFE_INTEGER},
            {"startDate":"2026-09-26","tokens":1}
        ]
    });
    assert_eq!(
        parse_usage(&overflow, ATTEMPT).unwrap_err(),
        ErrorCode::SourceInvalid
    );
}

#[test]
fn raw_lifetime_is_checked_before_archive_retention() {
    let previous = normalize_activity(
        &json!({"version":1,"sources":{"github":null,"codex":null,"claude":null}}),
    )
    .unwrap();
    let mut previous = previous;
    previous.sources.codex = Some(Snapshot {
        updated_at: "2026-09-25T08:00:00.000Z".to_owned(),
        timezone: "Codex".to_owned(),
        metric: "tokens".to_owned(),
        days: vec![Day {
            date: "2026-05-01".to_owned(),
            value: 100,
        }],
    });
    let snapshot = parse_usage(&fixture(), ATTEMPT).unwrap();
    let merged = merge_activity(
        &previous,
        [
            SourceAttempt::Failed {
                source: SourceId::Github,
                attempted_at: ATTEMPT.to_owned(),
                error_code: ErrorCode::Unconfigured,
            },
            SourceAttempt::Success {
                source: SourceId::Codex,
                attempted_at: ATTEMPT.to_owned(),
                snapshot,
            },
            SourceAttempt::Failed {
                source: SourceId::Claude,
                attempted_at: ATTEMPT.to_owned(),
                error_code: ErrorCode::Unconfigured,
            },
        ],
        &FakeClock::new(1_790_409_601_000),
    )
    .unwrap();
    let days = &merged.data.sources.codex.unwrap().days;
    assert_eq!(days.len(), 3);
    assert_eq!(days.iter().map(|day| day.value).sum::<u64>(), 110);
}
