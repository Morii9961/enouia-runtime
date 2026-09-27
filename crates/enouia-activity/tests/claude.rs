use enouia_activity::claude::parse_reports;
use enouia_common::ErrorCode;
use serde_json::{Value, json};

const ATTEMPT: &str = "2026-09-26T08:00:00.000Z";
const FIXTURE: &str = include_str!("../../../tests/fixtures/activity/claude-stores-v1.json");

fn fixture_reports() -> Vec<Value> {
    serde_json::from_str(FIXTURE).unwrap()
}

#[test]
fn complete_stores_sum_by_shanghai_day_without_double_counting_reasoning() {
    let snapshot = parse_reports(&fixture_reports(), ATTEMPT).unwrap();
    assert_eq!(snapshot.updated_at, ATTEMPT);
    assert_eq!(snapshot.timezone, "Asia/Shanghai");
    assert_eq!(snapshot.metric, "tokens");
    assert_eq!(snapshot.days.len(), 2);
    assert_eq!(snapshot.days[0].date, "2026-09-25");
    assert_eq!(snapshot.days[0].value, 40);
    assert_eq!(snapshot.days[1].date, "2026-09-26");
    assert_eq!(snapshot.days[1].value, 1);
    assert!(
        !serde_json::to_string(&snapshot)
            .unwrap()
            .contains("DO_NOT_EXPORT")
    );
}

#[test]
fn invalid_or_incomplete_store_fails_the_whole_aggregate() {
    let mut reports = fixture_reports();
    reports[1]["daily"][0]["totalTokens"] = json!(13);
    assert_eq!(
        parse_reports(&reports, ATTEMPT).unwrap_err(),
        ErrorCode::SourceInvalid
    );
    let mut reports = fixture_reports();
    reports[1]["totals"]["totalTokens"] = json!(14);
    assert_eq!(
        parse_reports(&reports, ATTEMPT).unwrap_err(),
        ErrorCode::SourceInvalid
    );
    let mut reports = fixture_reports();
    reports[1].as_object_mut().unwrap().remove("daily");
    assert_eq!(
        parse_reports(&reports, ATTEMPT).unwrap_err(),
        ErrorCode::SourceInvalid
    );
}

#[test]
fn invalid_dates_duplicates_and_legacy_date_key_are_rejected() {
    for invalid in ["2026-02-30", "2026-09-25"] {
        let mut reports = fixture_reports();
        reports[0]["daily"][1]["period"] = json!(invalid);
        assert_eq!(
            parse_reports(&reports, ATTEMPT).unwrap_err(),
            ErrorCode::SourceInvalid
        );
    }
    let mut reports = fixture_reports();
    let row = reports[0]["daily"][0].as_object_mut().unwrap();
    row.insert("date".to_owned(), json!("2026-09-25"));
    row.remove("period");
    assert_eq!(
        parse_reports(&reports, ATTEMPT).unwrap_err(),
        ErrorCode::SourceInvalid
    );
}

#[test]
fn unsafe_or_negative_arithmetic_fails_without_partial_data() {
    for value in [json!(-1), json!("1"), json!(9_007_199_254_740_992_u64)] {
        let mut reports = fixture_reports();
        reports[0]["daily"][0]["cacheReadTokens"] = value;
        assert_eq!(
            parse_reports(&reports, ATTEMPT).unwrap_err(),
            ErrorCode::SourceInvalid
        );
    }
    let store = json!({
        "daily":[{"period":"2026-09-25","inputTokens":9_007_199_254_740_991_u64,"cacheReadTokens":0,"cacheCreationTokens":0,"outputTokens":0,"totalTokens":9_007_199_254_740_991_u64}],
        "totals":{"totalTokens":9_007_199_254_740_991_u64}
    });
    assert_eq!(
        parse_reports(&[store.clone(), store], ATTEMPT).unwrap_err(),
        ErrorCode::SourceInvalid
    );
}

#[test]
fn empty_report_is_valid_only_with_explicit_zero_total() {
    let empty = json!({"daily":[],"totals":{"totalTokens":0}});
    let snapshot = parse_reports(&[empty.clone(), fixture_reports()[0].clone()], ATTEMPT).unwrap();
    assert_eq!(snapshot.days.len(), 2);
    assert_eq!(snapshot.days[0].value, 26);
    assert_eq!(
        parse_reports(&[json!({"daily":[],"totals":{"totalTokens":1}})], ATTEMPT).unwrap_err(),
        ErrorCode::SourceInvalid
    );
    assert_eq!(
        parse_reports(&[], ATTEMPT).unwrap_err(),
        ErrorCode::SourceInvalid
    );
}
