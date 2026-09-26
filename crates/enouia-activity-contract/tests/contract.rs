use enouia_activity_contract::{
    MAX_SAFE_INTEGER, checked_safe_sum, normalize_activity, normalize_batch, public_data_bytes,
    public_data_sha256, validate_failed_retention, validate_imported_pending,
    validate_publishable_batch,
};
use enouia_common::FakeClock;
use serde_json::{Value, json};

const ATTEMPT: &str = "2026-09-26T08:00:00.000Z";
const CREATED: &str = "2026-09-26T08:00:01.000Z";

fn snapshot(zone: &str, metric: &str, days: Value) -> Value {
    json!({"updatedAt": ATTEMPT, "timezone": zone, "metric": metric, "days": days})
}

fn data() -> Value {
    json!({"version":1,"sources":{"github":null,"codex":null,"claude":null}})
}

fn batch() -> Value {
    json!({
        "version":1,"producer":"morii-workstation","sequence":1,"createdAt":CREATED,
        "sources":{
            "github":{"attemptedAt":ATTEMPT,"result":"failed"},
            "codex":{"attemptedAt":ATTEMPT,"result":"failed"},
            "claude":{"attemptedAt":ATTEMPT,"result":"failed"}
        },
        "data":data()
    })
}

fn clock() -> FakeClock {
    FakeClock::new(1_790_409_601_000)
}

#[test]
fn three_null_sources_are_explicit() {
    let clean = normalize_activity(&data()).unwrap();
    assert_eq!(
        public_data_bytes(&clean).unwrap(),
        b"{\"version\":1,\"sources\":{\"github\":null,\"codex\":null,\"claude\":null}}\n"
    );
    let normalized = normalize_batch(&batch(), &clock()).unwrap();
    assert!(normalized.sources.github.succeeded_at.is_none());
}

#[test]
fn explicit_zero_is_preserved_as_a_recorded_day() {
    let mut raw = data();
    raw["sources"]["github"] = snapshot(
        "GitHub",
        "contributions",
        json!([{"date":"2026-09-26","value":0}]),
    );
    let clean = normalize_activity(&raw).unwrap();
    assert_eq!(clean.sources.github.unwrap().days[0].value, 0);
}

#[test]
fn all_three_successes_and_fixed_literals() {
    let mut raw = batch();
    raw["data"]["sources"]["github"] = snapshot("GitHub", "contributions", json!([]));
    raw["data"]["sources"]["codex"] = snapshot("Codex", "tokens", json!([]));
    raw["data"]["sources"]["claude"] = snapshot("Asia/Shanghai", "tokens", json!([]));
    for id in ["github", "codex", "claude"] {
        raw["sources"][id]["result"] = json!("success");
    }
    let normalized = normalize_batch(&raw, &clock()).unwrap();
    assert_eq!(
        normalized.sources.codex.succeeded_at.as_deref(),
        Some(ATTEMPT)
    );
    raw["data"]["sources"]["codex"]["timezone"] = json!("Asia/Shanghai");
    assert!(normalize_batch(&raw, &clock()).is_err());
    raw["data"]["sources"]["codex"]["timezone"] = json!("Codex");
    raw["data"]["sources"]["github"]["metric"] = json!("tokens");
    assert!(normalize_batch(&raw, &clock()).is_err());
}

#[test]
fn failed_source_retains_old_snapshot_and_success_time() {
    let mut raw = batch();
    raw["data"]["sources"]["codex"] = json!({"updatedAt":"2026-09-25T06:00:00.000Z","timezone":"Codex","metric":"tokens","days":[{"date":"2026-09-24","value":5}]});
    let normalized = normalize_batch(&raw, &clock()).unwrap();
    assert_eq!(
        normalized.sources.codex.succeeded_at.as_deref(),
        Some("2026-09-25T06:00:00.000Z")
    );
    assert_eq!(normalized.data.sources.codex.unwrap().days[0].value, 5);
}

#[test]
fn failure_retention_uses_previous_archive_when_available() {
    let mut raw = batch();
    raw["data"]["sources"]["codex"] = json!({"updatedAt":"2026-09-25T06:00:00.000Z","timezone":"Codex","metric":"tokens","days":[{"date":"2026-09-24","value":5}]});
    let previous = normalize_activity(&raw["data"]).unwrap();
    let batch = normalize_batch(&raw, &clock()).unwrap();
    assert!(validate_failed_retention(&batch, &previous).is_ok());
    let mut altered = batch.clone();
    altered.data.sources.codex.as_mut().unwrap().days[0].value = 6;
    assert!(validate_failed_retention(&altered, &previous).is_err());
    altered.data.sources.codex = None;
    assert!(validate_failed_retention(&altered, &previous).is_err());
}

#[test]
fn real_unique_dates_and_leap_days() {
    let mut raw = data();
    raw["sources"]["github"] = snapshot(
        "GitHub",
        "contributions",
        json!([{"date":"2028-02-29","value":1}]),
    );
    assert!(normalize_activity(&raw).is_ok());
    for bad in [
        "2027-02-29",
        "2026-13-01",
        "2026-02-30",
        "2026-9-26",
        "1900-02-29",
    ] {
        raw["sources"]["github"]["days"][0]["date"] = json!(bad);
        assert!(normalize_activity(&raw).is_err(), "{bad}");
    }
    raw["sources"]["github"]["days"] =
        json!([{"date":"2028-02-29","value":1},{"date":"2028-02-29","value":2}]);
    assert!(normalize_activity(&raw).is_err());
}

#[test]
fn values_and_sums_stay_inside_javascript_safe_range() {
    let mut raw = data();
    raw["sources"]["github"] = snapshot(
        "GitHub",
        "contributions",
        json!([{"date":"2026-09-26","value":MAX_SAFE_INTEGER}]),
    );
    assert!(normalize_activity(&raw).is_ok());
    for bad in [json!(-1), json!(1.5), json!(9007199254740992_u64)] {
        raw["sources"]["github"]["days"][0]["value"] = bad;
        assert!(normalize_activity(&raw).is_err());
    }
    raw["sources"]["github"]["days"] =
        json!([{"date":"2026-09-25","value":MAX_SAFE_INTEGER},{"date":"2026-09-26","value":1}]);
    assert!(normalize_activity(&raw).is_err());
    assert!(checked_safe_sum([MAX_SAFE_INTEGER, 1]).is_err());
    raw["sources"]["github"]["days"] = json!([{"date":"2026-09-26","value":1.0}]);
    assert_eq!(
        normalize_activity(&raw)
            .unwrap()
            .sources
            .github
            .unwrap()
            .days[0]
            .value,
        1
    );
}

#[test]
fn sequence_boundaries_and_identity_are_fixed() {
    let mut raw = batch();
    raw["sequence"] = json!(MAX_SAFE_INTEGER);
    assert!(normalize_batch(&raw, &clock()).is_ok());
    for bad in [json!(0), json!(-1), json!(1.5), json!(9007199254740992_u64)] {
        raw["sequence"] = bad;
        assert!(normalize_batch(&raw, &clock()).is_err());
    }
    raw["sequence"] = json!(1);
    raw["producer"] = json!("another-producer");
    assert!(normalize_batch(&raw, &clock()).is_err());
}

#[test]
fn exact_envelope_times_and_cross_field_order_are_required() {
    let mut raw = batch();
    raw["createdAt"] = json!("2026-09-26T08:00:01Z");
    assert!(normalize_batch(&raw, &clock()).is_err());
    raw["createdAt"] = json!("2026-09-26T08:00:01.000+00:00");
    assert!(normalize_batch(&raw, &clock()).is_err());
    raw["createdAt"] = json!("2026-09-26T08:05:01.001Z");
    assert!(normalize_batch(&raw, &clock()).is_err());
    raw["createdAt"] = json!(CREATED);
    raw["sources"]["github"]["attemptedAt"] = json!("2026-09-26T08:00:02.000Z");
    assert!(normalize_batch(&raw, &clock()).is_err());
    raw["sources"]["github"]["attemptedAt"] = json!(ATTEMPT);
    raw["data"]["sources"]["github"] = json!({"updatedAt":"2026-09-26T08:00:00.001Z","timezone":"GitHub","metric":"contributions","days":[]});
    assert!(normalize_batch(&raw, &clock()).is_err());
    raw["data"]["sources"]["github"]["updatedAt"] = json!("2026-09-25T08:00:00.000Z");
    raw["sources"]["github"]["result"] = json!("success");
    assert!(normalize_batch(&raw, &clock()).is_err());
}

#[test]
fn snapshot_accepts_explicit_offset_without_relabeling_codex() {
    let mut raw = data();
    raw["sources"]["codex"] = json!({"updatedAt":"2026-09-26T16:00:00.000+08:00","timezone":"Codex","metric":"tokens","days":[]});
    let clean = normalize_activity(&raw).unwrap();
    assert_eq!(
        clean.sources.codex.unwrap().updated_at,
        "2026-09-26T16:00:00.000+08:00"
    );
    raw["sources"]["codex"]["updatedAt"] = json!("bad-time");
    assert!(normalize_activity(&raw).is_err());
}

#[test]
fn parseable_old_time_may_fail_manifest_publishability_without_restamping() {
    let mut raw = batch();
    raw["data"]["sources"]["codex"] = json!({"updatedAt":"2026-09-25T14:00:00.000+08:00","timezone":"Codex","metric":"tokens","days":[]});
    let clean = normalize_batch(&raw, &clock()).unwrap();
    assert_eq!(
        clean.sources.codex.succeeded_at.as_deref(),
        Some("2026-09-25T14:00:00.000+08:00")
    );
    assert!(validate_publishable_batch(&clean).is_err());
}

#[test]
fn success_time_is_derived_and_private_fields_are_removed_at_every_level() {
    let raw: Value = serde_json::from_str(include_str!(
        "../../../tests/fixtures/activity/moriium-oracle-input.json"
    ))
    .unwrap();
    let batch = normalize_batch(&raw, &clock()).unwrap();
    assert_eq!(batch.sources.github.succeeded_at.as_deref(), Some(ATTEMPT));
    assert_eq!(
        batch.sources.codex.succeeded_at.as_deref(),
        Some("2026-09-25T06:00:00.000Z")
    );
    let encoded = serde_json::to_string(&batch).unwrap();
    assert!(!encoded.contains("PRIVATE"));
    assert!(!encoded.contains("private"));
    assert_eq!(
        batch.data.sources.github.unwrap().days[0].date,
        "2026-09-25"
    );
}

#[test]
fn imported_pending_rejects_private_fields_but_accepts_legacy_missing_success_time() {
    let mut raw = batch();
    assert!(validate_imported_pending(&raw, &clock()).is_ok());
    raw["private"] = json!("PRIVATE");
    assert!(validate_imported_pending(&raw, &clock()).is_err());
    raw.as_object_mut().unwrap().remove("private");
    raw["data"]["sources"]["github"] = snapshot(
        "GitHub",
        "contributions",
        json!([{"date":"2026-09-26","value":0,"private":"PRIVATE"}]),
    );
    assert!(validate_imported_pending(&raw, &clock()).is_err());
    raw["data"]["sources"]["github"]["days"][0]
        .as_object_mut()
        .unwrap()
        .remove("private");
    raw["sources"]["github"]["succeededAt"] = json!("wrong");
    assert!(validate_imported_pending(&raw, &clock()).is_err());
}

#[test]
fn deterministic_public_bytes_match_moriium_oracle_and_sha256() {
    let raw: Value = serde_json::from_str(include_str!(
        "../../../tests/fixtures/activity/moriium-oracle-input.json"
    ))
    .unwrap();
    let batch = normalize_batch(&raw, &clock()).unwrap();
    let expected = include_bytes!("../../../tests/fixtures/activity/moriium-public-data.json");
    let hash = include_str!("../../../tests/fixtures/activity/moriium-public-data.sha256").trim();
    assert_eq!(public_data_bytes(&batch.data).unwrap(), expected);
    assert_eq!(public_data_sha256(&batch.data).unwrap(), hash);
    let mut reordered = batch.data.clone();
    reordered.sources.github.as_mut().unwrap().days.reverse();
    assert_eq!(public_data_bytes(&reordered).unwrap(), expected);
}
