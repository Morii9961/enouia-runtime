#![cfg(windows)]

use enouia_common::{ComponentId, ErrorCode};
use enouia_windows_process::discover_claude_stores;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

static NEXT: AtomicU64 = AtomicU64::new(0);

fn sandbox() -> PathBuf {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../target/cowork-discovery-tests")
        .join(format!(
            "{}_{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
    fs::create_dir_all(&root).unwrap();
    root
}

fn transcript(store: &Path) {
    let project = store.join("projects/project-a");
    fs::create_dir_all(&project).unwrap();
    fs::write(project.join("fixture.jsonl"), b"{}\n").unwrap();
}

#[test]
fn discovers_both_cowork_names_and_microsoft_store_redirect() {
    let root = sandbox();
    let normal = root.join("normal");
    fs::create_dir_all(&normal).unwrap();
    let roaming = root.join("roaming/Claude");
    let local = roaming.join("local-agent-mode-sessions/task-1/.claude");
    transcript(&local);
    let packages = root.join("packages");
    let redirected = packages
        .join("Claude_ABC123/LocalCache/Roaming/Claude/claude-code-sessions/task-2/.claude");
    transcript(&redirected);
    let found = discover_claude_stores(&normal, &roaming, &packages, &[]).unwrap();
    assert_eq!(found.len(), 3);
    assert_eq!(found[0], fs::canonicalize(normal).unwrap());
    assert!(found.contains(&fs::canonicalize(local).unwrap()));
    assert!(found.contains(&fs::canonicalize(redirected).unwrap()));
}

#[test]
fn absent_optional_roots_are_normal_and_default_overlap_is_deduplicated() {
    let root = sandbox();
    let normal = root.join("roaming/Claude/claude-code-sessions/task/.claude");
    transcript(&normal);
    let roaming = root.join("roaming/Claude");
    let found =
        discover_claude_stores(&normal, &roaming, &root.join("absent-packages"), &[]).unwrap();
    assert_eq!(found, vec![fs::canonicalize(normal).unwrap()]);
    let plain = root.join("plain-normal");
    fs::create_dir_all(&plain).unwrap();
    let found = discover_claude_stores(
        &plain,
        &root.join("absent-roaming"),
        &root.join("absent-packages"),
        &[],
    )
    .unwrap();
    assert_eq!(found, vec![fs::canonicalize(plain).unwrap()]);
}

#[test]
fn missing_expected_store_or_unreadable_root_fails_instead_of_shrinking_inventory() {
    let root = sandbox();
    let normal = root.join("normal");
    fs::create_dir_all(&normal).unwrap();
    let missing = root.join("missing/.claude");
    let error = discover_claude_stores(
        &normal,
        &root.join("absent-roaming"),
        &root.join("absent-packages"),
        &[missing],
    )
    .unwrap_err();
    assert_eq!(error.code, ErrorCode::SourceInvalid);
    assert_eq!(error.component, ComponentId::ActivityCollectorClaude);
    let broken_packages = root.join("packages-file");
    fs::write(&broken_packages, b"not a directory").unwrap();
    assert_eq!(
        discover_claude_stores(&normal, &root.join("absent-roaming"), &broken_packages, &[])
            .unwrap_err()
            .code,
        ErrorCode::SourceInvalid
    );
}

#[test]
fn traversal_past_depth_six_is_an_incomplete_discovery_error() {
    let root = sandbox();
    let normal = root.join("normal");
    fs::create_dir_all(&normal).unwrap();
    let roaming = root.join("roaming/Claude");
    let mut deep = roaming.join("local-agent-mode-sessions");
    for index in 0..7 {
        deep = deep.join(format!("d{index}"));
    }
    fs::create_dir_all(deep).unwrap();
    assert_eq!(
        discover_claude_stores(&normal, &roaming, &root.join("absent-packages"), &[])
            .unwrap_err()
            .code,
        ErrorCode::SourceInvalid
    );
}

#[test]
fn ignores_empty_tasks_and_unrelated_packages_but_detects_lost_transcript_inventory() {
    let root = sandbox();
    let normal = root.join("normal");
    fs::create_dir_all(&normal).unwrap();
    let roaming = root.join("roaming/Claude");
    let empty_task = roaming.join("local-agent-mode-sessions/task-empty/.claude");
    fs::create_dir_all(empty_task.join("projects/project-a")).unwrap();
    let packages = root.join("packages");
    let unrelated =
        packages.join("Other_ABC/LocalCache/Roaming/Claude/claude-code-sessions/task/.claude");
    transcript(&unrelated);
    let found = discover_claude_stores(&normal, &roaming, &packages, &[]).unwrap();
    assert_eq!(found, vec![fs::canonicalize(&normal).unwrap()]);
    assert_eq!(
        discover_claude_stores(&normal, &roaming, &packages, &[empty_task])
            .unwrap_err()
            .code,
        ErrorCode::SourceInvalid
    );
}
