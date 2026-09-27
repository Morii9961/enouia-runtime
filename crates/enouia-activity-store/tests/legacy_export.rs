#![cfg(windows)]

use enouia_activity_contract::{normalize_batch, public_data_bytes, sha256_hex};
use enouia_activity_store::WindowsActivityLock;
use enouia_activity_store::generation::GenerationImage;
use enouia_activity_store::legacy_export::{ExportError, export_legacy_trio};
use enouia_activity_store::recovery::RecoveryError;
use enouia_common::{FakeClock, LockProvider};
use serde_json::{Value, json};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const ORACLE: &str = include_str!("../../../tests/fixtures/activity/moriium-oracle-input.json");

fn clock() -> FakeClock {
    FakeClock::new(1_790_409_601_000)
}

fn root() -> PathBuf {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let root = std::env::temp_dir().join(format!(
        "enouia-legacy-export-{}-{nonce}",
        std::process::id()
    ));
    fs::create_dir(&root).unwrap();
    root
}

fn clean(root: &Path) {
    assert!(root.starts_with(std::env::temp_dir()));
    assert!(
        root.file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with("enouia-legacy-export-")
    );
    fs::remove_dir_all(root).unwrap();
}

fn seed(root: &Path, sequence: u64, with_pending: bool) -> GenerationImage {
    let mut raw: Value = serde_json::from_str(ORACLE).unwrap();
    raw["sequence"] = json!(1);
    let batch = normalize_batch(&raw, &clock()).unwrap();
    let mut pending = serde_json::to_vec(&batch).unwrap();
    pending.push(b'\n');
    let image = GenerationImage {
        activity: public_data_bytes(&batch.data).unwrap(),
        sequence: format!("{{\"sequence\":{sequence}}}\n").into_bytes(),
        pending: with_pending.then_some(pending),
        delivery: b"{}\n".to_vec(),
    };
    let path = root.join("generations/g-export");
    fs::create_dir_all(&path).unwrap();
    fs::write(path.join("activity.json"), &image.activity).unwrap();
    fs::write(path.join("sequence.json"), &image.sequence).unwrap();
    if let Some(bytes) = &image.pending {
        fs::write(path.join("pending.json"), bytes).unwrap();
    }
    fs::write(path.join("delivery.json"), &image.delivery).unwrap();
    fs::write(
        path.join("manifest.json"),
        image.manifest_bytes("g-export", &clock()).unwrap(),
    )
    .unwrap();
    fs::write(root.join("CURRENT"), b"g-export\n").unwrap();
    image
}

#[test]
fn exports_exact_trio_and_skipped_high_water_without_delivery_metadata() {
    let root = root();
    let image = seed(&root, 5, true);
    let guard = WindowsActivityLock
        .try_acquire(&root.join("sync.lock"))
        .unwrap();
    let destination = root.parent().unwrap().join(format!(
        "{}-bundle",
        root.file_name().unwrap().to_string_lossy()
    ));
    let summary = export_legacy_trio(&guard, &destination, &clock()).unwrap();
    assert_eq!(summary.generation_id, "g-export");
    assert_eq!(summary.highest_reserved, 5);
    assert_eq!(summary.activity_sha256, sha256_hex(&image.activity));
    assert_eq!(summary.sequence_sha256, sha256_hex(&image.sequence));
    assert_eq!(
        summary.pending_sha256,
        image.pending.as_ref().map(|bytes| sha256_hex(bytes))
    );
    assert_eq!(
        fs::read(destination.join("activity.json")).unwrap(),
        image.activity
    );
    assert_eq!(
        fs::read(destination.join("sequence.json")).unwrap(),
        image.sequence
    );
    assert_eq!(
        fs::read(destination.join("pending.json")).unwrap(),
        image.pending.unwrap()
    );
    assert!(!destination.join("delivery.json").exists());
    drop(guard);
    clean(&destination);
    clean(&root);
}

#[test]
fn absent_pending_stays_absent_and_existing_destination_is_untouched() {
    let root = root();
    seed(&root, 5, false);
    let guard = WindowsActivityLock
        .try_acquire(&root.join("sync.lock"))
        .unwrap();
    let destination = root.parent().unwrap().join(format!(
        "{}-bundle",
        root.file_name().unwrap().to_string_lossy()
    ));
    let summary = export_legacy_trio(&guard, &destination, &clock()).unwrap();
    assert_eq!(summary.pending_sha256, None);
    assert!(!destination.join("pending.json").exists());
    assert_eq!(
        export_legacy_trio(&guard, &destination, &clock()).unwrap_err(),
        ExportError::DestinationExists
    );
    assert_eq!(
        export_legacy_trio(&guard, &root.join("bundle"), &clock()).unwrap_err(),
        ExportError::InvalidDestination
    );
    drop(guard);
    clean(&destination);
    clean(&root);
}

#[test]
fn corrupt_current_blocks_export_without_creating_destination() {
    let root = root();
    seed(&root, 5, true);
    fs::write(root.join("generations/g-export/manifest.json"), b"{}\n").unwrap();
    let guard = WindowsActivityLock
        .try_acquire(&root.join("sync.lock"))
        .unwrap();
    let destination = root.parent().unwrap().join(format!(
        "{}-bundle",
        root.file_name().unwrap().to_string_lossy()
    ));
    assert!(matches!(
        export_legacy_trio(&guard, &destination, &clock()),
        Err(ExportError::Recovery(RecoveryError::Current(_)))
    ));
    assert!(!destination.exists());
    drop(guard);
    clean(&root);
}
