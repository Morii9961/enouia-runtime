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

const IPC: &str = include_str!("../../../contracts/ipc/activity-v1.schema.json");
const COMMON: &str = include_str!("../../../contracts/ipc/common-v1.schema.json");
const DATA: &str = include_str!("../../../contracts/activity/activity-data-v1.schema.json");

/// Structural JSON Schema subset used by the Activity contracts: refs, types,
/// enum/const, oneOf/allOf, objects and arrays. Patterns and formats are not
/// interpreted; the Rust DTO builders own those.
fn conforms(value: &Value, schema: &Value, document: &str) -> bool {
    if let Some(reference) = schema.get("$ref").and_then(Value::as_str) {
        let (file, pointer) = reference.split_once('#').unwrap_or((reference, ""));
        let name = if file.is_empty() {
            document
        } else {
            file.rsplit('/').next().unwrap()
        };
        let text = match name {
            "activity-v1.schema.json" => IPC,
            "common-v1.schema.json" => COMMON,
            "activity-data-v1.schema.json" => DATA,
            other => panic!("unexpected schema {other}"),
        };
        let root: Value = serde_json::from_str(text).unwrap();
        let target = if pointer.is_empty() {
            &root
        } else {
            root.pointer(pointer).unwrap()
        };
        return conforms(value, target, name);
    }
    let one_of = schema
        .get("oneOf")
        .and_then(Value::as_array)
        .is_none_or(|options| {
            options
                .iter()
                .filter(|s| conforms(value, s, document))
                .count()
                == 1
        });
    let all_of = schema
        .get("allOf")
        .and_then(Value::as_array)
        .is_none_or(|all| all.iter().all(|s| conforms(value, s, document)));
    let constant = schema.get("const").is_none_or(|expected| value == expected);
    let listed = schema
        .get("enum")
        .and_then(Value::as_array)
        .is_none_or(|options| options.contains(value));
    let typed = match schema.get("type").and_then(Value::as_str) {
        None => true,
        Some("object") => value.is_object(),
        Some("array") => value.is_array(),
        Some("string") => value.is_string(),
        Some("integer") => value.is_u64() || value.is_i64(),
        Some("boolean") => value.is_boolean(),
        Some("null") => value.is_null(),
        Some(other) => panic!("unsupported type {other}"),
    };
    let bounded = schema
        .get("minimum")
        .and_then(Value::as_i64)
        .is_none_or(|minimum| value.as_i64().is_none_or(|v| v >= minimum));
    if !(one_of && all_of && constant && listed && typed && bounded) {
        return false;
    }
    if let Some(object) = value.as_object() {
        let properties = schema.get("properties").and_then(Value::as_object);
        let closed = schema.get("additionalProperties") == Some(&Value::Bool(false));
        let required = schema
            .get("required")
            .and_then(Value::as_array)
            .is_none_or(|keys| {
                keys.iter()
                    .all(|key| object.contains_key(key.as_str().unwrap()))
            });
        let members = object
            .iter()
            .all(|(key, child)| match properties.and_then(|p| p.get(key)) {
                Some(child_schema) => conforms(child, child_schema, document),
                None => !closed,
            });
        if !(required && members) {
            return false;
        }
    }
    match (value.as_array(), schema.get("items")) {
        (Some(items), Some(schema)) => items.iter().all(|item| conforms(item, schema, document)),
        _ => true,
    }
}

fn ipc_conforms(value: &Value, definition: &str) -> bool {
    let reference = json!({ "$ref": format!("#/$defs/{definition}") });
    conforms(value, &reference, "activity-v1.schema.json")
}

#[test]
fn overview_and_preview_are_lock_free_ipc_v1_reads() {
    let fixture = Fixture::new();
    let (code, missing) = fixture.run("overview", &[]);
    assert_eq!(code, 6);
    assert!(ipc_conforms(&missing, "failure"), "{missing}");
    assert_eq!(missing["error"]["code"], "storage_failed");
    fixture.import();
    fixture.invoke(&[
        "set-paused".into(),
        "false".into(),
        "--config".into(),
        fixture.config.as_os_str().to_owned(),
    ]);
    let (code, _) = fixture.run("sync", &[]);
    assert_eq!(code, 4);

    // A held writer lock makes sync busy but never blocks a status read.
    let guard = WindowsActivityLock
        .try_acquire(&fixture.root.join("sync.lock"))
        .unwrap();
    assert_eq!(fixture.run("sync", &[]).0, 3);
    let (code, overview) = fixture.run("overview", &[]);
    assert_eq!(code, 0);
    let (code, preview) = fixture.run("preview", &[]);
    assert_eq!(code, 0);
    drop(guard);

    assert!(ipc_conforms(&overview, "overview"), "{overview}");
    for mutate in [
        (|v: &mut Value| v["unexpected"] = json!(1)) as fn(&mut Value),
        |v| v["sources"]["codex"]["timezone"] = json!("Asia/Shanghai"),
        |v| v["delivery"]["state"] = json!("published"),
        |v| {
            v["sources"]
                .as_object_mut()
                .unwrap()
                .remove("claude")
                .map(drop)
                .unwrap()
        },
        |v| v["health"][0]["state"] = json!("fine"),
    ] {
        let mut changed = overview.clone();
        mutate(&mut changed);
        assert!(!ipc_conforms(&changed, "overview"), "{changed}");
    }
    assert_eq!(overview["delivery"]["pendingSequence"], 51);
    assert_eq!(overview["delivery"]["state"], "unconfigured");
    assert_eq!(overview["pending"]["sequence"], 51);
    assert_eq!(overview["producer"]["highestReserved"], 51);
    assert_eq!(overview["producer"]["deliveryEnabled"], false);
    let archive: Value =
        serde_json::from_slice(&fs::read(fixture.source.join("activity.json")).unwrap()).unwrap();
    for (id, timezone) in [
        ("github", "GitHub"),
        ("codex", "Codex"),
        ("claude", "Asia/Shanghai"),
    ] {
        let source = &overview["sources"][id];
        assert_eq!(source["timezone"], timezone);
        // Unconfigured collectors failed: data and success time are retained.
        assert_eq!(source["lastResult"], "failed");
        assert_eq!(source["freshness"], "failed");
        assert_eq!(source["lastSuccessAt"], archive["sources"][id]["updatedAt"]);
        let total: u64 = archive["sources"][id]["days"]
            .as_array()
            .unwrap()
            .iter()
            .map(|d| d["value"].as_u64().unwrap())
            .sum();
        assert_eq!(source["total"], total.to_string());
    }
    let health = overview["health"].as_array().unwrap();
    assert_eq!(health.len(), 5);
    assert!(
        health
            .iter()
            .all(|c| c["state"] != "healthy" || c["id"] == "activity_archive")
    );

    assert!(ipc_conforms(&preview, "preview"), "{preview}");
    assert_eq!(preview["data"], archive);
    let bytes = public_data_bytes(&enouia_activity_contract::normalize_activity(&archive).unwrap())
        .unwrap();
    assert_eq!(
        preview["sha256"],
        enouia_activity_contract::sha256_hex(&bytes)
    );
    assert!(!overview.to_string().contains("PRIVATE"));
}
