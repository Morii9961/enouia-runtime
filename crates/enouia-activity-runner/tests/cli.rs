#![cfg(windows)]

use enouia_activity_contract::{normalize_batch, public_data_bytes};
use enouia_activity_runner::config::read_config;
use enouia_activity_store::WindowsActivityLock;
use enouia_activity_store::legacy_inspect::inspect_legacy_trio;
use enouia_common::{FakeClock, LockProvider};
use serde_json::{Value, json};
use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

const ORACLE: &str = include_str!("../../../tests/fixtures/activity/moriium-oracle-input.json");

struct Fixture {
    base: PathBuf,
    root: PathBuf,
    source: PathBuf,
    config: PathBuf,
    binary: PathBuf,
}
impl Fixture {
    fn new() -> Self {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let base = std::env::temp_dir().join(format!(
            "enouia-cli-PRIVATE_PATH-{}-{nonce}",
            std::process::id()
        ));
        let root = base.join("state");
        let source = base.join("legacy");
        fs::create_dir_all(&root).unwrap();
        fs::create_dir(&source).unwrap();
        let batch = normalize_batch(
            &serde_json::from_str::<Value>(ORACLE).unwrap(),
            &FakeClock::new(1_790_410_200_000),
        )
        .unwrap();
        fs::write(
            source.join("activity.json"),
            public_data_bytes(&batch.data).unwrap(),
        )
        .unwrap();
        fs::write(source.join("sequence.json"), b"{\"sequence\":42}\n").unwrap();
        let config = base.join("config.json");
        fs::write(
            &config,
            serde_json::to_vec(&json!({"version":1,"mode":"sandbox","dataRoot":root})).unwrap(),
        )
        .unwrap();
        let binary = base.join("enouia-activity.exe");
        fs::copy(env!("CARGO_BIN_EXE_enouia-activity"), &binary).unwrap();
        Self {
            base,
            root,
            source,
            config,
            binary,
        }
    }
    fn run(&self, command: &str, extras: &[(&str, &Path)]) -> (i32, Value) {
        let mut args = vec![OsString::from(command)];
        if command != "migration-inspect" {
            args.extend([
                OsString::from("--config"),
                self.config.as_os_str().to_owned(),
            ]);
        }
        for (key, value) in extras {
            args.extend([OsString::from(key), value.as_os_str().to_owned()]);
        }
        self.invoke(&args)
    }
    fn invoke(&self, args: &[OsString]) -> (i32, Value) {
        let output = Command::new(&self.binary)
            .args(args)
            .current_dir(&self.base)
            .output()
            .unwrap();
        assert!(output.stderr.is_empty(), "unexpected unredacted stderr");
        let text = String::from_utf8(output.stdout).unwrap();
        assert!(!text.contains("PRIVATE"));
        (
            output.status.code().unwrap(),
            serde_json::from_str(&text).unwrap(),
        )
    }
    fn import(&self) {
        let (code, result) = self.run(
            "migration-import",
            &[
                ("--bundle", &self.source),
                ("--high-water", Path::new("50")),
            ],
        );
        assert_eq!(code, 0, "{result}");
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        assert!(self.base.starts_with(std::env::temp_dir()));
        assert!(
            self.base
                .file_name()
                .unwrap()
                .to_string_lossy()
                .starts_with("enouia-cli-PRIVATE_PATH-")
        );
        fs::remove_dir_all(&self.base).unwrap();
    }
}

#[test]
fn copied_executable_imports_diagnoses_syncs_and_exports_from_unrelated_directory() {
    let fixture = Fixture::new();
    let report = fixture.base.join("inspection.json");
    let (code, _) = fixture.run(
        "migration-inspect",
        &[("--input", &fixture.source), ("--output", &report)],
    );
    assert_eq!(code, 0);
    assert!(report.is_file());
    fixture.import();
    let (code, result) = fixture.run("diagnostics", &[]);
    assert_eq!(code, 0);
    assert_eq!(result["paused"], true);
    assert_eq!(result["deliveryEnabled"], false);
    let (code, result) = fixture.run("sync", &[]);
    assert_eq!(code, 3);
    assert_eq!(result["state"], "paused");
    let (code, _) = fixture.invoke(&[
        "set-paused".into(),
        "false".into(),
        "--config".into(),
        fixture.config.as_os_str().to_owned(),
    ]);
    assert_eq!(code, 0);
    let (code, result) = fixture.run("sync", &[]);
    assert_eq!(code, 4);
    assert_eq!(result["state"], "delivery_disabled");
    assert_eq!(result["sequence"], 51);
    assert_eq!(result["sourceFailures"], 3);
    assert_eq!(result["transportAttempted"], false);
    let (code, result) = fixture.run("sync", &[]);
    assert_eq!(code, 4);
    assert_eq!(result["collectionAttempted"], false);
    assert_eq!(result["sequence"], 51);
    let bundle = fixture.base.join("rollback");
    let (code, result) = fixture.run("migration-export-legacy", &[("--output", &bundle)]);
    assert_eq!(code, 0);
    assert_eq!(result["highestReserved"], 51);
    let inspection = inspect_legacy_trio(&bundle, &FakeClock::new(4_102_444_800_000)).unwrap();
    assert_eq!(inspection.highest_reserved, 51);
    assert_eq!(inspection.pending.as_ref().unwrap().sequence, 51);
    assert_eq!(
        inspection.archive,
        inspect_legacy_trio(&fixture.source, &FakeClock::new(4_102_444_800_000))
            .unwrap()
            .archive
    );
    let (code, result) = fixture.run("diagnostics", &[]);
    assert_eq!(code, 0);
    assert_eq!(result["pending"]["sequence"], 51);
}

#[test]
fn busy_lock_and_bad_current_block_the_copied_executable() {
    let fixture = Fixture::new();
    fixture.import();
    let guard = WindowsActivityLock
        .try_acquire(&fixture.root.join("sync.lock"))
        .unwrap();
    let (code, result) = fixture.run("sync", &[]);
    assert_eq!(code, 3);
    assert_eq!(result["state"], "busy");
    drop(guard);
    fs::write(fixture.root.join("CURRENT"), b"invalid").unwrap();
    let (code, _) = fixture.run("diagnostics", &[]);
    assert_eq!(code, 6);
    let (code, _) = fixture.run(
        "migration-import",
        &[
            ("--bundle", &fixture.source),
            ("--high-water", Path::new("99")),
        ],
    );
    assert_eq!(code, 6);
    assert_eq!(fs::read(fixture.root.join("CURRENT")).unwrap(), b"invalid");
}

#[test]
fn malformed_private_relative_or_duplicate_config_is_rejected_without_output_leaks() {
    let fixture = Fixture::new();
    for config in [
        json!({"version":1,"mode":"sandbox","dataRoot":fixture.root,"token":"PRIVATE_SECRET"}),
        json!({"version":1,"mode":"sandbox","dataRoot":"relative"}),
        json!({"version":1,"mode":"sandbox","dataRoot":fixture.root,"deliveryEnabled":true}),
    ] {
        fs::write(&fixture.config, serde_json::to_vec(&config).unwrap()).unwrap();
        let (code, result) = fixture.run("sync", &[]);
        assert_eq!(code, 5);
        assert_eq!(result["state"], "invalid_config");
        assert!(!fixture.root.join("sync.lock").exists());
    }
    let (code, _) = fixture.invoke(&[
        "sync".into(),
        "--config".into(),
        fixture.config.as_os_str().to_owned(),
        "--config".into(),
        "PRIVATE_UNKNOWN".into(),
    ]);
    assert_eq!(code, 5);
}

#[test]
fn config_bounds_reject_redirect_origins_shell_aliases_and_unbounded_waits() {
    let fixture = Fixture::new();
    let base = json!({"version":1,"mode":"sandbox","dataRoot":fixture.root,
        "delivery":{"sshExecutable":fixture.base.join("ssh.exe"),"curlExecutable":fixture.base.join("curl.exe"),
            "restrictedAlias":"sandbox","publicOrigin":"http://127.0.0.1:9000"}});
    fs::write(&fixture.config, serde_json::to_vec(&base).unwrap()).unwrap();
    let config = read_config(&fixture.config).unwrap();
    assert!(!config.delivery_enabled);
    assert_eq!(config.max_run_seconds, 900);
    for (field, value) in [
        ("publicOrigin", json!("http://localhost.evil")),
        ("publicOrigin", json!("https://production.example")),
        ("publicOrigin", json!("http://user:PRIVATE@127.0.0.1")),
        ("restrictedAlias", json!("bad;command")),
        ("observationSeconds", json!(61)),
        ("retrySeconds", json!(0)),
        ("retrySeconds", json!(86401)),
        ("sshExecutable", json!("relative")),
    ] {
        let mut invalid = base.clone();
        invalid["delivery"][field] = value;
        fs::write(&fixture.config, serde_json::to_vec(&invalid).unwrap()).unwrap();
        assert!(read_config(&fixture.config).is_err());
    }
    fs::write(&fixture.config, vec![b' '; 65537]).unwrap();
    assert!(read_config(&fixture.config).is_err());
}

#[test]
fn inspection_report_never_overwrites_an_existing_file_or_modifies_input() {
    let fixture = Fixture::new();
    let output = fixture.base.join("report.json");
    fs::write(&output, b"keep-existing").unwrap();
    let original = fs::read(fixture.source.join("activity.json")).unwrap();
    let (code, _) = fixture.run(
        "migration-inspect",
        &[("--input", &fixture.source), ("--output", &output)],
    );
    assert_eq!(code, 6);
    assert_eq!(fs::read(&output).unwrap(), b"keep-existing");
    assert_eq!(
        fs::read(fixture.source.join("activity.json")).unwrap(),
        original
    );
    let (code, _) = fixture.run(
        "migration-inspect",
        &[
            ("--input", &fixture.source),
            ("--output", &fixture.source.join("report.json")),
        ],
    );
    assert_eq!(code, 6);
    assert!(!fixture.source.join("report.json").exists());
}

#[test]
fn comparison_reports_downward_corrections_and_missing_dates_without_choosing_a_seed() {
    let fixture = Fixture::new();
    let candidate = fixture.base.join("candidate");
    fs::create_dir(&candidate).unwrap();
    let mut archive: Value =
        serde_json::from_slice(&fs::read(fixture.source.join("activity.json")).unwrap()).unwrap();
    archive["sources"]["github"]["days"][0]["value"] = json!(1);
    archive["sources"]["github"]["days"]
        .as_array_mut()
        .unwrap()
        .pop();
    fs::write(
        candidate.join("activity.json"),
        serde_json::to_vec(&archive).unwrap(),
    )
    .unwrap();
    fs::write(candidate.join("sequence.json"), b"{\"sequence\":42}\n").unwrap();
    let output = fixture.base.join("comparison.json");
    let (code, report) = fixture.run(
        "migration-inspect",
        &[
            ("--input", &candidate),
            ("--against", &fixture.source),
            ("--output", &output),
        ],
    );
    assert_eq!(code, 0);
    assert_eq!(
        report["comparison"]["github"]["requiresReconciliation"],
        true
    );
    assert_eq!(
        report["comparison"]["github"]["changedValues"][0]["current"],
        7
    );
    assert_eq!(
        report["comparison"]["github"]["changedValues"][0]["candidate"],
        1
    );
    assert_eq!(
        report["comparison"]["github"]["currentOnlyDates"][0],
        "2026-09-26"
    );
    assert_eq!(report["sources"]["github"]["recordedDays"], 1);
    assert_eq!(report["sources"]["github"]["total"], 1);
    assert!(!fixture.root.join("CURRENT").exists());
}

#[test]
fn unpublishable_retained_success_time_is_flagged_and_blocks_import() {
    let fixture = Fixture::new();
    let mut archive: Value =
        serde_json::from_slice(&fs::read(fixture.source.join("activity.json")).unwrap()).unwrap();
    archive["sources"]["codex"]["updatedAt"] = json!("2026-09-25");
    fs::write(
        fixture.source.join("activity.json"),
        serde_json::to_vec(&archive).unwrap(),
    )
    .unwrap();
    let output = fixture.base.join("inspection.json");
    let (code, report) = fixture.run(
        "migration-inspect",
        &[("--input", &fixture.source), ("--output", &output)],
    );
    assert_eq!(code, 0);
    assert_eq!(report["unpublishableSuccessTimes"], json!(["codex"]));
    assert_eq!(report["sources"]["codex"]["updatedAt"], "2026-09-25");
    let (code, result) = fixture.run(
        "migration-import",
        &[
            ("--bundle", &fixture.source),
            ("--high-water", Path::new("50")),
        ],
    );
    assert_eq!(code, 6);
    assert_eq!(result["state"], "unpublishable_history");
    assert!(!fixture.root.join("CURRENT").exists());
}
