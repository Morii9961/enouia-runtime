#![cfg(windows)]

use enouia_activity_contract::{normalize_activity, public_data_bytes};
use enouia_activity_store::generation::{GenerationError, GenerationImage};
use enouia_activity_store::reader::{ReadError, read_current};
use enouia_common::FakeClock;
use serde_json::json;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

fn clock() -> FakeClock {
    FakeClock::new(1_790_409_601_000)
}

fn root() -> PathBuf {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let root = std::env::temp_dir().join(format!(
        "enouia-generation-reader-{}-{nonce}",
        std::process::id()
    ));
    fs::create_dir(&root).unwrap();
    root
}

fn blank_image() -> GenerationImage {
    let archive = normalize_activity(&json!({
        "version": 1,
        "sources": {"github": null, "codex": null, "claude": null}
    }))
    .unwrap();
    GenerationImage {
        activity: public_data_bytes(&archive).unwrap(),
        sequence: b"{\"sequence\":0}\n".to_vec(),
        pending: None,
        delivery: b"{}\n".to_vec(),
    }
}

fn write_generation(root: &Path, id: &str, image: &GenerationImage) {
    let path = root.join("generations").join(id);
    fs::create_dir_all(&path).unwrap();
    fs::write(
        path.join("manifest.json"),
        image.manifest_bytes(id, &clock()).unwrap(),
    )
    .unwrap();
    fs::write(path.join("activity.json"), &image.activity).unwrap();
    fs::write(path.join("sequence.json"), &image.sequence).unwrap();
    fs::write(path.join("delivery.json"), &image.delivery).unwrap();
    if let Some(pending) = &image.pending {
        fs::write(path.join("pending.json"), pending).unwrap();
    }
}

fn clean_generation(root: &Path, id: &str) {
    let path = root.join("generations").join(id);
    for name in [
        "manifest.json",
        "activity.json",
        "sequence.json",
        "delivery.json",
    ] {
        fs::remove_file(path.join(name)).unwrap();
    }
    fs::remove_dir(path).unwrap();
}

fn clean_root(root: &Path) {
    fs::remove_file(root.join("CURRENT")).unwrap();
    fs::remove_dir(root.join("generations")).unwrap();
    fs::remove_dir(root).unwrap();
}

#[test]
fn reads_only_the_pinned_valid_generation() {
    let root = root();
    write_generation(&root, "g-0-a", &blank_image());
    fs::write(root.join("CURRENT"), b"g-0-a\n").unwrap();
    let loaded = read_current(&root, &clock()).unwrap();
    assert_eq!(loaded.id, "g-0-a");
    assert_eq!(loaded.validated.highest_reserved, 0);
    assert!(loaded.image.pending.is_none());
    clean_generation(&root, "g-0-a");
    clean_root(&root);
}

#[test]
fn missing_current_is_not_an_implicit_first_run() {
    let root = root();
    assert!(matches!(
        read_current(&root, &clock()),
        Err(ReadError::MissingCurrent)
    ));
    fs::remove_dir(&root).unwrap();
}

#[test]
fn missing_or_corrupt_selected_generation_never_falls_back() {
    let root = root();
    write_generation(&root, "g-0-old", &blank_image());
    fs::write(root.join("CURRENT"), b"g-0-new\n").unwrap();
    assert!(matches!(
        read_current(&root, &clock()),
        Err(ReadError::MissingGeneration)
    ));
    write_generation(&root, "g-0-new", &blank_image());
    fs::write(root.join("generations/g-0-new/activity.json"), b"{}\n").unwrap();
    assert!(matches!(
        read_current(&root, &clock()),
        Err(ReadError::InvalidGeneration(GenerationError::HashMismatch))
    ));
    clean_generation(&root, "g-0-old");
    clean_generation(&root, "g-0-new");
    clean_root(&root);
}

#[test]
fn rejects_bad_pointer_missing_file_and_oversize_pointer() {
    let root = root();
    write_generation(&root, "g-0-a", &blank_image());
    fs::write(root.join("CURRENT"), b"../escape\n").unwrap();
    assert!(matches!(
        read_current(&root, &clock()),
        Err(ReadError::InvalidCurrent)
    ));
    fs::write(root.join("CURRENT"), b"g-0-a\n").unwrap();
    fs::remove_file(root.join("generations/g-0-a/delivery.json")).unwrap();
    assert!(matches!(
        read_current(&root, &clock()),
        Err(ReadError::MissingFile)
    ));
    fs::write(root.join("generations/g-0-a/delivery.json"), b"{}\n").unwrap();
    fs::write(root.join("CURRENT"), vec![b'g'; 67]).unwrap();
    assert!(matches!(
        read_current(&root, &clock()),
        Err(ReadError::TooLarge)
    ));
    clean_generation(&root, "g-0-a");
    clean_root(&root);
}
