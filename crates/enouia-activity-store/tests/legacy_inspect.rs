#![cfg(windows)]

use enouia_activity_contract::{
    ActivityData, ActivitySources, Day, Snapshot, normalize_activity, normalize_batch,
    public_data_bytes, sha256_hex,
};
use enouia_activity_store::generation::GenerationError;
use enouia_activity_store::legacy_inspect::{
    CompareError, InspectError, ValueChange, compare_archives, inspect_legacy_trio,
};
use enouia_common::FakeClock;
use serde_json::{Value, json};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const ORACLE: &str = include_str!("../../../tests/fixtures/activity/moriium-oracle-input.json");

fn clock() -> FakeClock {
    FakeClock::new(1_790_409_601_000)
}

fn copied_trio() -> (PathBuf, Vec<u8>, Vec<u8>) {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let directory = std::env::temp_dir().join(format!(
        "enouia-legacy-inspect-{}-{nonce}",
        std::process::id()
    ));
    fs::create_dir(&directory).unwrap();
    let mut raw: Value = serde_json::from_str(ORACLE).unwrap();
    raw["sequence"] = json!(1);
    let batch = normalize_batch(&raw, &clock()).unwrap();
    let mut pending = serde_json::to_vec(&batch).unwrap();
    pending.push(b'\n');
    let archive = public_data_bytes(&batch.data).unwrap();
    let pretty_archive =
        serde_json::to_vec_pretty(&serde_json::from_slice::<Value>(&archive).unwrap()).unwrap();
    fs::write(directory.join("activity.json"), &pretty_archive).unwrap();
    fs::write(directory.join("sequence.json"), b"{\"sequence\":5}\r\n").unwrap();
    fs::write(directory.join("pending.json"), &pending).unwrap();
    (directory, archive, pending)
}

fn clean(directory: &Path) {
    assert!(directory.starts_with(std::env::temp_dir()));
    assert!(
        directory
            .file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with("enouia-legacy-inspect-")
    );
    fs::remove_dir_all(directory).unwrap();
}

#[test]
fn inspects_copied_trio_without_rewriting_pending_or_losing_raw_hashes() {
    let (directory, archive, pending) = copied_trio();
    let inspection = inspect_legacy_trio(&directory, &clock()).unwrap();
    assert_eq!(inspection.highest_reserved, 5);
    assert_eq!(inspection.pending.as_ref().unwrap().sequence, 1);
    assert_eq!(
        inspection.exact_pending_bytes.as_deref(),
        Some(pending.as_slice())
    );
    assert_eq!(inspection.pending_sha256, Some(sha256_hex(&pending)));
    assert_eq!(inspection.canonical_archive_bytes, archive);
    assert_ne!(
        inspection.raw_archive_sha256,
        sha256_hex(&inspection.canonical_archive_bytes)
    );
    assert_eq!(
        inspection.raw_sequence_sha256,
        sha256_hex(b"{\"sequence\":5}\r\n")
    );
    let mut reordered: Value =
        serde_json::from_slice(&fs::read(directory.join("activity.json")).unwrap()).unwrap();
    let days = reordered["sources"]["codex"]["days"]
        .as_array_mut()
        .unwrap();
    days.push(json!({"date":"2025-01-01","value":1}));
    fs::remove_file(directory.join("pending.json")).unwrap();
    let expected = public_data_bytes(&normalize_activity(&reordered).unwrap()).unwrap();
    fs::write(
        directory.join("activity.json"),
        serde_json::to_vec(&reordered).unwrap(),
    )
    .unwrap();
    assert_eq!(
        inspect_legacy_trio(&directory, &clock())
            .unwrap()
            .canonical_archive_bytes,
        expected
    );
    clean(&directory);
}

#[test]
fn rejects_private_archive_extras_and_pending_above_reserved_sequence() {
    let (directory, _, _) = copied_trio();
    let mut archive: Value =
        serde_json::from_slice(&fs::read(directory.join("activity.json")).unwrap()).unwrap();
    archive["sources"]["codex"]["privateTitle"] = json!("must not import");
    fs::write(
        directory.join("activity.json"),
        serde_json::to_vec(&archive).unwrap(),
    )
    .unwrap();
    assert!(matches!(
        inspect_legacy_trio(&directory, &clock()),
        Err(InspectError::ArchiveExtraFields)
    ));
    archive["sources"]["codex"]
        .as_object_mut()
        .unwrap()
        .remove("privateTitle");
    fs::write(
        directory.join("activity.json"),
        serde_json::to_vec(&archive).unwrap(),
    )
    .unwrap();
    fs::write(directory.join("sequence.json"), b"{\"sequence\":0}\n").unwrap();
    assert_eq!(
        inspect_legacy_trio(&directory, &clock()).err().unwrap(),
        InspectError::InvalidImage(GenerationError::InvalidSequence)
    );
    fs::write(directory.join("sequence.json"), b"{\"sequence\":1}\n").unwrap();
    let mut pending: Value =
        serde_json::from_slice(&fs::read(directory.join("pending.json")).unwrap()).unwrap();
    pending["sequence"] = json!(2);
    fs::write(
        directory.join("pending.json"),
        serde_json::to_vec(&pending).unwrap(),
    )
    .unwrap();
    assert_eq!(
        inspect_legacy_trio(&directory, &clock()).err().unwrap(),
        InspectError::InvalidImage(GenerationError::InvalidPending)
    );
    clean(&directory);
}

fn snapshot(time: &str, dates: &[(&str, u64)], source: &str) -> Snapshot {
    let (timezone, metric) = match source {
        "github" => ("GitHub", "contributions"),
        "codex" => ("Codex", "tokens"),
        "claude" => ("Asia/Shanghai", "tokens"),
        _ => panic!("unexpected test source"),
    };
    Snapshot {
        updated_at: time.to_owned(),
        timezone: timezone.to_owned(),
        metric: metric.to_owned(),
        days: dates
            .iter()
            .map(|(date, value)| Day {
                date: (*date).to_owned(),
                value: *value,
            })
            .collect(),
    }
}

#[test]
fn reports_per_source_history_and_correction_conflicts_without_choosing_a_winner() {
    let current = ActivityData {
        version: 1,
        sources: ActivitySources {
            github: Some(snapshot(
                "2026-01-03T00:00:00.000Z",
                &[("2026-01-01", 10), ("2026-01-02", 20)],
                "github",
            )),
            codex: Some(snapshot(
                "2026-01-03T00:00:00.000Z",
                &[("2026-01-01", 5)],
                "codex",
            )),
            claude: None,
        },
    };
    let candidate = ActivityData {
        version: 1,
        sources: ActivitySources {
            github: Some(snapshot(
                "2026-01-04T00:00:00.000Z",
                &[("2026-01-02", 22), ("2026-01-03", 30)],
                "github",
            )),
            codex: None,
            claude: Some(snapshot(
                "2026-01-04T00:00:00.000Z",
                &[("2026-01-03", 7)],
                "claude",
            )),
        },
    };
    let comparison = compare_archives(&current, &candidate).unwrap();
    assert_eq!(comparison.github.current_only_dates, ["2026-01-01"]);
    assert_eq!(comparison.github.candidate_only_dates, ["2026-01-03"]);
    assert_eq!(
        comparison.github.changed_values,
        [ValueChange {
            date: "2026-01-02".to_owned(),
            current: 20,
            candidate: 22,
        }]
    );
    assert!(comparison.github.requires_reconciliation);
    assert_ne!(
        comparison.github.current_sha256,
        comparison.github.candidate_sha256
    );
    assert_eq!(comparison.codex.current_only_dates, ["2026-01-01"]);
    assert!(comparison.codex.requires_reconciliation);
    assert_eq!(comparison.claude.candidate_only_dates, ["2026-01-03"]);
    assert!(!comparison.claude.requires_reconciliation);
}

#[test]
fn detects_success_time_regression_without_a_day_change() {
    let current = ActivityData {
        version: 1,
        sources: ActivitySources {
            github: Some(snapshot(
                "2026-01-04T00:00:00.000Z",
                &[("2026-01-01", 10)],
                "github",
            )),
            codex: None,
            claude: None,
        },
    };
    let mut candidate = current.clone();
    candidate.sources.github.as_mut().unwrap().updated_at = "2026-01-03T00:00:00.000Z".to_owned();
    let comparison = compare_archives(&current, &candidate).unwrap();
    assert!(comparison.github.success_time_regressed);
    assert!(comparison.github.requires_reconciliation);
    assert!(comparison.github.changed_values.is_empty());
    candidate.sources.github.as_mut().unwrap().updated_at = "invalid".to_owned();
    assert_eq!(
        compare_archives(&current, &candidate).unwrap_err(),
        CompareError::InvalidSnapshot
    );
}

#[test]
fn flags_retained_success_times_the_manifest_cannot_publish_without_restamping() {
    let (directory, _, _) = copied_trio();
    fs::remove_file(directory.join("pending.json")).unwrap();
    assert!(
        inspect_legacy_trio(&directory, &clock())
            .unwrap()
            .unpublishable_success_times
            .is_empty()
    );
    let mut archive: Value =
        serde_json::from_slice(&fs::read(directory.join("activity.json")).unwrap()).unwrap();
    // ActivityData accepts each shape; the manifest's toISOString check does not.
    for time in [
        "2026-09-25",
        "2026-09-25T06:00:00Z",
        "2026-09-25T14:00:00.000+08:00",
    ] {
        archive["sources"]["codex"]["updatedAt"] = json!(time);
        fs::write(
            directory.join("activity.json"),
            serde_json::to_vec(&archive).unwrap(),
        )
        .unwrap();
        let inspection = inspect_legacy_trio(&directory, &clock()).unwrap();
        assert_eq!(inspection.unpublishable_success_times, ["codex"]);
        assert_eq!(
            inspection.archive.sources.codex.unwrap().updated_at,
            time,
            "inspection must not restamp a retained time"
        );
    }
    clean(&directory);
}
