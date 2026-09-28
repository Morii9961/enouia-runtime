use enouia_activity_contract::{normalize_activity, normalize_batch, public_data_bytes};
use enouia_activity_store::generation::{GenerationError, GenerationImage};
use enouia_common::FakeClock;
use serde_json::{Value, json};

const ORACLE: &str = include_str!("../../../tests/fixtures/activity/moriium-oracle-input.json");

fn clock() -> FakeClock {
    FakeClock::new(1_790_409_601_000)
}

fn fixture_image() -> GenerationImage {
    let raw: Value = serde_json::from_str(ORACLE).unwrap();
    let batch = normalize_batch(&raw, &clock()).unwrap();
    let activity = public_data_bytes(&batch.data).unwrap();
    let mut pending = serde_json::to_vec(&batch).unwrap();
    pending.push(b'\n');
    GenerationImage {
        activity,
        sequence: b"{\"sequence\":42}\n".to_vec(),
        pending: Some(pending),
        delivery: b"{\"version\":1}\n".to_vec(),
    }
}

#[test]
fn complete_generation_reconstructs_archive_and_exact_pending() {
    let image = fixture_image();
    let manifest = image.manifest_bytes("g-42-abc", &clock()).unwrap();
    let state = image.validate(&manifest, "g-42-abc", &clock()).unwrap();
    assert_eq!(state.highest_reserved, 42);
    assert_eq!(state.pending.unwrap().sequence, 42);
    assert_eq!(state.archive.sources.github.unwrap().days.len(), 2);
    assert!(!String::from_utf8(manifest).unwrap().contains("PRIVATE_"));
}

#[test]
fn manifest_hashes_detect_any_file_change_or_missing_pending() {
    let image = fixture_image();
    let manifest = image.manifest_bytes("g-42-abc", &clock()).unwrap();
    for changed in [0, 1, 2, 3] {
        let mut image = fixture_image();
        match changed {
            0 => image.activity.push(b' '),
            1 => image.sequence.push(b' '),
            2 => image.pending.as_mut().unwrap().push(b' '),
            3 => image.delivery.push(b' '),
            _ => unreachable!(),
        }
        assert_eq!(
            image.validate(&manifest, "g-42-abc", &clock()).unwrap_err(),
            GenerationError::HashMismatch
        );
    }
    let mut image = fixture_image();
    image.pending = None;
    assert_eq!(
        image.validate(&manifest, "g-42-abc", &clock()).unwrap_err(),
        GenerationError::HashMismatch
    );
}

#[test]
fn untrusted_manifest_cannot_select_another_generation() {
    let image = fixture_image();
    let manifest = image.manifest_bytes("g-42-abc", &clock()).unwrap();
    assert_eq!(
        image.validate(&manifest, "g-41-abc", &clock()).unwrap_err(),
        GenerationError::InvalidManifest
    );
    assert_eq!(
        image.manifest_bytes("../escape", &clock()).unwrap_err(),
        GenerationError::InvalidManifest
    );
    assert_eq!(
        image.manifest_bytes("CON", &clock()).unwrap_err(),
        GenerationError::InvalidManifest
    );
    let mut raw: Value = serde_json::from_slice(&manifest).unwrap();
    raw["private"] = json!("unexpected");
    assert_eq!(
        image
            .validate(&serde_json::to_vec(&raw).unwrap(), "g-42-abc", &clock())
            .unwrap_err(),
        GenerationError::InvalidManifest
    );
}

#[test]
fn hashes_alone_do_not_validate_sequence_archive_or_pending() {
    let mut image = fixture_image();
    image.sequence = b"{\"sequence\":41}\n".to_vec();
    assert_eq!(
        image.manifest_bytes("g-42-abc", &clock()).unwrap_err(),
        GenerationError::InvalidPending
    );

    let mut image = fixture_image();
    image.sequence = b"{\"sequence\":50}\n".to_vec();
    let manifest = image.manifest_bytes("g-50-abc", &clock()).unwrap();
    assert_eq!(
        image
            .validate(&manifest, "g-50-abc", &clock())
            .unwrap()
            .highest_reserved,
        50
    );

    let mut image = fixture_image();
    image.sequence = b"{\"sequence\":42,\"private\":1}\n".to_vec();
    assert_eq!(
        image.manifest_bytes("g-42-abc", &clock()).unwrap_err(),
        GenerationError::InvalidSequence
    );

    let mut image = fixture_image();
    let mut archive: Value = serde_json::from_slice(&image.activity).unwrap();
    archive["sources"]["github"]["days"]
        .as_array_mut()
        .unwrap()
        .remove(0);
    image.activity = public_data_bytes(&normalize_activity(&archive).unwrap()).unwrap();
    assert_eq!(
        image.manifest_bytes("g-42-abc", &clock()).unwrap_err(),
        GenerationError::InvalidPending
    );

    let mut image = fixture_image();
    let mut archive: Value = serde_json::from_slice(&image.activity).unwrap();
    archive["sources"]["github"]["days"][0]["value"] = json!(8);
    image.activity = public_data_bytes(&normalize_activity(&archive).unwrap()).unwrap();
    assert_eq!(
        image.manifest_bytes("g-42-abc", &clock()).unwrap_err(),
        GenerationError::InvalidPending
    );

    let mut image = fixture_image();
    image.delivery = b"[]\n".to_vec();
    assert_eq!(
        image.manifest_bytes("g-42-abc", &clock()).unwrap_err(),
        GenerationError::InvalidDelivery
    );

    let mut image = fixture_image();
    image.delivery = b"{\"paused\":\"true\"}\n".to_vec();
    assert_eq!(
        image.manifest_bytes("g-42-abc", &clock()).unwrap_err(),
        GenerationError::InvalidDelivery
    );
}

#[test]
fn publication_receipt_has_a_strict_local_schema() {
    let receipt = json!({
        "origin": "https://public.example",
        "sequence": 41,
        "exactPendingSha256": "a".repeat(64),
        "manifestSha256": "b".repeat(64),
        "activitySha256": "c".repeat(64),
        "generatedAtMs": 1_790_409_601_000_i64,
        "publishedAtMs": 1_790_409_600_000_i64,
        "receivedAtMs": 1_790_409_599_000_i64,
    });
    let mut image = fixture_image();
    image.delivery = serde_json::to_vec(&json!({"publicationObserved": receipt})).unwrap();
    image.manifest_bytes("g-42-abc", &clock()).unwrap();

    let mut malformed: Value = serde_json::from_slice(&image.delivery).unwrap();
    malformed["publicationObserved"]["manifestSha256"] = json!("BAD");
    image.delivery = serde_json::to_vec(&malformed).unwrap();
    assert_eq!(
        image.manifest_bytes("g-42-abc", &clock()),
        Err(GenerationError::InvalidDelivery)
    );
    malformed["publicationObserved"]["manifestSha256"] = json!("b".repeat(64));
    malformed["publicationObserved"]["sequence"] = json!(43);
    image.delivery = serde_json::to_vec(&malformed).unwrap();
    assert_eq!(
        image.manifest_bytes("g-42-abc", &clock()),
        Err(GenerationError::InvalidDelivery)
    );
}

#[test]
fn pending_bytes_are_validated_without_rewriting_private_or_mismatched_fields() {
    let mut image = fixture_image();
    let mut pending: Value = serde_json::from_slice(image.pending.as_ref().unwrap()).unwrap();
    pending["private"] = json!("DO_NOT_EXPORT");
    image.pending = Some(serde_json::to_vec(&pending).unwrap());
    assert_eq!(
        image.manifest_bytes("g-42-abc", &clock()).unwrap_err(),
        GenerationError::InvalidPending
    );

    let mut image = fixture_image();
    let mut pending: Value = serde_json::from_slice(image.pending.as_ref().unwrap()).unwrap();
    pending["sources"]["github"]["succeededAt"] = json!("2000-01-01T00:00:00.000Z");
    image.pending = Some(serde_json::to_vec(&pending).unwrap());
    assert_eq!(
        image.manifest_bytes("g-42-abc", &clock()).unwrap_err(),
        GenerationError::InvalidPending
    );
}

#[test]
fn zero_sequence_is_only_a_blank_local_state() {
    let archive = normalize_activity(&json!({
        "version": 1,
        "sources": {"github": null, "codex": null, "claude": null}
    }))
    .unwrap();
    let image = GenerationImage {
        activity: public_data_bytes(&archive).unwrap(),
        sequence: b"{\"sequence\":0}\n".to_vec(),
        pending: None,
        delivery: b"{}\n".to_vec(),
    };
    let manifest = image.manifest_bytes("g-0-abc", &clock()).unwrap();
    assert_eq!(
        image
            .validate(&manifest, "g-0-abc", &clock())
            .unwrap()
            .highest_reserved,
        0
    );
    let mut image = fixture_image();
    image.sequence = b"{\"sequence\":0}\n".to_vec();
    assert_eq!(
        image.manifest_bytes("g-0-abc", &clock()).unwrap_err(),
        GenerationError::InvalidSequence
    );
}
