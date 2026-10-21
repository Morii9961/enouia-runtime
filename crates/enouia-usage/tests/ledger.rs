#![cfg(windows)]
use enouia_usage::{
    Error,
    adapter::Source,
    safety,
    scan::{Limits, Selection},
    store::Ledger,
};
use serde_json::json;
use std::{
    fs,
    path::{Path, PathBuf},
    sync::atomic::AtomicBool,
};
const AT: &str = "2026-10-21T12:00:00Z";
struct Temp(PathBuf);
impl Temp {
    fn new() -> Self {
        let p =
            std::env::temp_dir().join(format!("enouia-usage-fixture-{}", safety::uuid().unwrap()));
        fs::create_dir(&p).unwrap();
        Self(p)
    }
    fn ledger(&self) -> PathBuf {
        self.0.join("ledger")
    }
    fn source(&self) -> PathBuf {
        let p = self.0.join("source");
        fs::create_dir_all(&p).unwrap();
        p
    }
}
impl Drop for Temp {
    fn drop(&mut self) {
        assert_eq!(self.0.parent(), Some(std::env::temp_dir().as_path()));
        assert!(
            self.0
                .file_name()
                .unwrap()
                .to_str()
                .unwrap()
                .starts_with("enouia-usage-fixture-")
        );
        fs::remove_dir_all(&self.0).unwrap();
    }
}
fn selection(source: Source, root: &Path) -> Selection {
    Selection {
        source,
        roots: vec![root.into()],
        models: vec!["fictional-model".into()],
        limits: Limits::default(),
    }
}
fn message(id: &str, input: u64) -> String {
    json!({"type":"assistant","timestamp":"2026-10-20T23:59:00Z","requestId":"fictional-request","message":{"id":id,"model":"fictional-model","usage":{"input_tokens":input,"output_tokens":2,"cache_read_input_tokens":3,"cache_creation_input_tokens":0},"content":"PRIVATE_SENTINEL_NEVER_PERSIST"}}).to_string()+"\n"
}
fn scan(l: &mut Ledger, s: &Selection) -> enouia_usage::scan::ScanResult {
    l.scan(s, AT, &AtomicBool::new(false)).unwrap()
}
#[test]
fn persistence_noop_retention_replay_and_single_writer() {
    let t = Temp::new();
    let root = t.source();
    fs::write(root.join("a.jsonl"), message("fictional-a", 10)).unwrap();
    let s = selection(Source::ClaudeLocal, &root);
    let mut l = Ledger::init(&t.ledger()).unwrap();
    assert!(matches!(Ledger::open(&t.ledger()), Err(Error::Busy)));
    let first = scan(&mut l, &s);
    assert_eq!(first.new_observations, 1);
    assert_eq!(first.health.accepted_facts, 1);
    assert_eq!(first.health.revision, 1);
    let second = scan(&mut l, &s);
    assert_eq!(second.duplicate_observations, 1);
    assert_eq!(second.health.revision, 1);
    assert_eq!(l.replay(Source::ClaudeLocal, AT).unwrap().revision, 1);
    fs::remove_file(root.join("a.jsonl")).unwrap();
    let retained = scan(&mut l, &s);
    assert_eq!(retained.health.coverage.retained_files, 1);
    assert_eq!(retained.health.accepted_facts, 1);
    assert_eq!(retained.health.revision, 2);
    drop(l);
    let l = Ledger::open(&t.ledger()).unwrap();
    assert_eq!(l.health(Source::ClaudeLocal).unwrap().accepted_facts, 1);
    drop(l);
    assert!(
        !fs::read(t.ledger().join("usage.sqlite3"))
            .unwrap()
            .windows(29)
            .any(|v| v == b"PRIVATE_SENTINEL_NEVER_PERSIST")
    );
}
#[test]
fn conflict_retains_projection_and_review_can_revise_down() {
    let t = Temp::new();
    let root = t.source();
    let file = root.join("a.jsonl");
    fs::write(&file, message("fictional-a", 100)).unwrap();
    let s = selection(Source::ClaudeLocal, &root);
    let mut l = Ledger::init(&t.ledger()).unwrap();
    scan(&mut l, &s);
    fs::write(&file, message("fictional-a", 10)).unwrap();
    let conflict = scan(&mut l, &s).health;
    assert_eq!(conflict.conflicts, 1);
    assert_eq!(conflict.accepted_facts, 1);
    let c = l.candidates(Source::ClaudeLocal, 10).unwrap();
    assert_eq!(c.len(), 2);
    // Select each retained candidate in turn; both are real audited revisions, not additions.
    for (g, i, d) in c {
        let h = l
            .resolve(Source::ClaudeLocal, &g, &i, Some(&d), AT)
            .unwrap();
        assert_eq!(h.conflicts, 0);
        assert_eq!(h.accepted_facts, 1);
    }
    let h = scan(&mut l, &s).health;
    assert_eq!(h.conflicts, 0);
    assert_eq!(h.accepted_facts, 1);
}
fn codex(values: &[u64]) -> String {
    let mut s =
        json!({"type":"session_meta","payload":{"id":"fictional-session"}}).to_string() + "\n";
    s += &(json!({"type":"turn_context","payload":{"model":"fictional-model","effort":"high"}})
        .to_string()
        + "\n");
    for (i, n) in values.iter().enumerate() {
        s+=&(json!({"type":"event_msg","timestamp":format!("2026-10-20T12:00:{i:02}Z"),"payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":n,"cached_input_tokens":0,"cache_write_input_tokens":0,"output_tokens":0,"reasoning_output_tokens":0,"total_tokens":n}}}}).to_string()+"\n");
    }
    s
}
#[test]
fn codex_archive_prefix_merges_and_branch_conflict_retains() {
    let t = Temp::new();
    let root = t.source();
    fs::write(root.join("suffix.jsonl"), codex(&[10, 20])).unwrap();
    let s = selection(Source::CodexLocal, &root);
    let mut l = Ledger::init(&t.ledger()).unwrap();
    assert_eq!(scan(&mut l, &s).health.accepted_facts, 2);
    // Same observations need identical timestamps; the full copy below puts 10 at second zero.
    let full = codex(&[0, 10, 20])
        .replace("12:00:00Z", "11:59:59Z")
        .replace("12:00:01Z", "12:00:00Z")
        .replace("12:00:02Z", "12:00:01Z");
    fs::write(root.join("full.jsonl"), &full).unwrap();
    let h = scan(&mut l, &s).health;
    assert_eq!(h.conflicts, 0);
    assert_eq!(h.accepted_facts, 2);
    fs::write(root.join("branch.jsonl"), codex(&[0, 30])).unwrap();
    let h = scan(&mut l, &s).health;
    assert_eq!(h.conflicts, 1);
    assert_eq!(h.accepted_facts, 2);
}
#[test]
fn bounded_failure_cancel_tail_and_missing_root() {
    let t = Temp::new();
    let root = t.source();
    let file = root.join("a.jsonl");
    fs::write(&file, message("fictional-a", 10) + "{broken}\n{unfinished").unwrap();
    let mut s = selection(Source::ClaudeLocal, &root);
    let mut l = Ledger::init(&t.ledger()).unwrap();
    let h = scan(&mut l, &s).health;
    assert_eq!(h.coverage.incomplete_tails, 1);
    assert_eq!(h.coverage.rejected, 1);
    assert!(h.last_successful.is_none());
    let rev = h.revision;
    let flag = AtomicBool::new(true);
    assert!(matches!(l.scan(&s, AT, &flag), Err(Error::Cancelled)));
    assert_eq!(l.health(Source::ClaudeLocal).unwrap().revision, rev);
    s.limits.line_bytes = 8;
    assert!(matches!(
        l.scan(&s, AT, &AtomicBool::new(false)),
        Err(Error::BudgetExceeded)
    ));
    assert_eq!(l.health(Source::ClaudeLocal).unwrap().revision, rev);
    s.limits = Limits::default();
    s.limits.elapsed = std::time::Duration::ZERO;
    assert!(matches!(
        l.scan(&s, AT, &AtomicBool::new(false)),
        Err(Error::BudgetExceeded)
    ));
    s.limits = Limits::default();
    s.roots = vec![t.0.join("missing")];
    let h = scan(&mut l, &s).health;
    assert_eq!(h.accepted_facts, 1);
    assert_eq!(h.coverage.unreadable, 1);
    assert_eq!(h.coverage.retained_files, 1);
}
#[test]
fn hard_links_unsafe_grants_and_corruption_fail_closed() {
    let t = Temp::new();
    let root = t.source();
    let outside = t.0.join("outside.jsonl");
    fs::write(&outside, message("fictional-a", 10)).unwrap();
    fs::hard_link(&outside, root.join("link.jsonl")).unwrap();
    let mut l = Ledger::init(&t.ledger()).unwrap();
    let s = selection(Source::ClaudeLocal, &root);
    let h = scan(&mut l, &s).health;
    assert_eq!(h.accepted_facts, 0);
    assert_eq!(h.coverage.unreadable, 1);
    assert!(matches!(
        safety::directory(&root.join("..")),
        Err(Error::UnsafePath)
    ));
    assert!(matches!(
        safety::directory(Path::new("\\\\server\\share")),
        Err(Error::UnsafePath)
    ));
    assert!(
        safety::disjoint(&root, &PathBuf::from(root.to_string_lossy().to_uppercase())).is_err()
    );
    drop(l);
    let db = t.ledger().join("usage.sqlite3");
    let c = rusqlite::Connection::open(&db).unwrap();
    c.execute_batch("PRAGMA user_version=2;").unwrap();
    drop(c);
    assert!(matches!(
        Ledger::open(&t.ledger()),
        Err(Error::StorageFailed)
    ));
    fs::write(&db, b"corrupt-fictional-ledger").unwrap();
    assert!(matches!(
        Ledger::open(&t.ledger()),
        Err(Error::StorageFailed)
    ));
    assert_eq!(fs::read(db).unwrap(), b"corrupt-fictional-ledger");
}
#[test]
fn junction_escape_is_not_traversed() {
    use std::os::windows::process::CommandExt;
    let t = Temp::new();
    let root = t.source();
    let outside = t.0.join("outside");
    fs::create_dir(&outside).unwrap();
    fs::write(outside.join("a.jsonl"), message("fictional-junction", 10)).unwrap();
    let status=std::process::Command::new("powershell.exe").args(["-NoProfile","-NonInteractive","-Command","$ErrorActionPreference='Stop'; New-Item -ItemType Junction -Path $env:USAGE_FIXTURE_LINK -Target $env:USAGE_FIXTURE_TARGET | Out-Null"]).env("USAGE_FIXTURE_LINK",root.join("link")).env("USAGE_FIXTURE_TARGET",&outside).creation_flags(0x08000000).status().unwrap();
    assert!(status.success());
    let mut l = Ledger::init(&t.ledger()).unwrap();
    let h = scan(&mut l, &selection(Source::ClaudeLocal, &root)).health;
    assert_eq!(h.accepted_facts, 0);
    assert_eq!(h.coverage.unsafe_entries, 1);
    drop(l);
    // Remove only the owned junction entry; never recursively follow its target.
    fs::remove_dir(root.join("link")).unwrap();
}

#[test]
fn pinned_handles_deny_replacement_and_repository_data_roots() {
    let t = Temp::new();
    let root = t.source();
    let file = root.join("a.jsonl");
    fs::write(&file, message("fictional-pin", 10)).unwrap();
    let grant = safety::directory(&root).unwrap();
    let handle = safety::read_file(&file).unwrap();
    assert!(fs::rename(&file, root.join("moved.jsonl")).is_err());
    assert!(fs::OpenOptions::new().write(true).open(&file).is_err());
    assert!(fs::rename(&root, t.0.join("moved")).is_err());
    drop(handle);
    drop(grant);
    fs::rename(&file, root.join("moved.jsonl")).unwrap();
    fs::create_dir(t.0.join(".git")).unwrap();
    assert!(matches!(Ledger::init(&t.ledger()), Err(Error::UnsafePath)));
}

fn exported(l: &mut Ledger, source: Source) -> serde_json::Value {
    serde_json::from_slice(
        &l.export(source, "2026-10-19", "2026-10-26", AT)
            .unwrap()
            .bytes,
    )
    .unwrap()
}
#[test]
fn deterministic_allowlist_export_has_exact_decimals_and_dataset_wide_unallocated() {
    let t = Temp::new();
    let root = t.source();
    let n = 9_007_199_254_740_993;
    fs::write(
        root.join("a.jsonl"),
        message("fictional-a", n) + &message("fictional-b", n),
    )
    .unwrap();
    let s = selection(Source::ClaudeLocal, &root);
    let mut l = Ledger::init(&t.ledger()).unwrap();
    scan(&mut l, &s);
    let first = l
        .export(Source::ClaudeLocal, "2026-10-01", "2026-10-02", AT)
        .unwrap();
    scan(&mut l, &s);
    let second = l
        .export(Source::ClaudeLocal, "2026-10-01", "2026-10-02", AT)
        .unwrap();
    assert_eq!(first.bytes, second.bytes);
    let v: serde_json::Value = serde_json::from_slice(&first.bytes).unwrap();
    assert_eq!(v["rows"], json!([]));
    assert_eq!(v["days"][0]["state"], "not_collected");
    assert_eq!(v["unallocated"].as_array().unwrap().len(), 1);
    let row = &v["unallocated"][0];
    assert_eq!(row["observed_date"], "2026-10-21");
    assert_eq!(row["counts"]["input_total"], "18014398509481992");
    assert_eq!(row["counts"]["input_uncached"], "18014398509481986");
    assert!(row["counts"]["output_reasoning_subset"].is_null());
    let text = String::from_utf8(first.bytes).unwrap();
    for private in [
        "PRIVATE_SENTINEL_NEVER_PERSIST",
        "fictional-request",
        "fictional-a",
        "fictional-b",
        "source_file",
        "identity.json",
        "payload",
        "usage.sqlite3",
    ] {
        assert!(!text.contains(private));
    }
    assert!(!text.contains(t.0.to_str().unwrap()));
    let output = t.0.join("aggregate.json");
    l.export_file(Source::ClaudeLocal, "2026-10-19", "2026-10-26", AT, &output)
        .unwrap();
    let old = fs::read(&output).unwrap();
    assert!(
        l.export_file(Source::ClaudeLocal, "2026-10-19", "2026-10-26", AT, &output)
            .is_err()
    );
    assert_eq!(fs::read(output).unwrap(), old);
    // Each source has its own random alias and independent revision namespace.
    let codex_root = t.0.join("codex");
    fs::create_dir(&codex_root).unwrap();
    fs::write(codex_root.join("fictional.jsonl"), codex(&[0, 10])).unwrap();
    scan(&mut l, &selection(Source::CodexLocal, &codex_root));
    let c = exported(&mut l, Source::CodexLocal);
    assert_ne!(c["dataset_id"], v["dataset_id"]);
    assert!(matches!(
        l.export(
            Source::ClaudeLocal,
            "2026-10-01",
            "2026-10-02",
            "2026-10-01T00:00:00Z"
        ),
        Err(Error::InvalidDate)
    ));
}
#[test]
fn reviewed_revision_replaces_counts_downward_and_preserves_missing_history() {
    use enouia_usage::{
        adapter::{Models, claude},
        identity::IdentityKey,
    };
    let t = Temp::new();
    let root = t.source();
    let file = root.join("a.jsonl");
    fs::write(&file, message("fictional-a", 100)).unwrap();
    let s = selection(Source::ClaudeLocal, &root);
    let mut l = Ledger::init(&t.ledger()).unwrap();
    scan(&mut l, &s);
    let first = exported(&mut l, Source::ClaudeLocal);
    assert_eq!(first["unallocated"][0]["counts"]["input_total"], "103");
    fs::write(&file, message("fictional-a", 10)).unwrap();
    scan(&mut l, &s);
    let conflict = exported(&mut l, Source::ClaudeLocal);
    assert_eq!(conflict["unallocated"][0]["counts"]["input_total"], "103");
    assert!(
        conflict["quality"]["reasons"]
            .as_array()
            .unwrap()
            .iter()
            .any(|r| r["code"] == "session_copy_conflict")
    );
    let o = claude(
        &serde_json::from_str(message("fictional-a", 10).trim()).unwrap(),
        &IdentityKey::from_bytes([9; 32]),
        &Models::new(&["fictional-model".into()]).unwrap(),
    )
    .unwrap()
    .unwrap();
    let digest = enouia_common::sha256_hex(serde_json::to_string(&o.record).unwrap().as_bytes());
    let (g, i, d) = l
        .candidates(Source::ClaudeLocal, 10)
        .unwrap()
        .into_iter()
        .find(|v| v.2 == digest)
        .unwrap();
    l.resolve(Source::ClaudeLocal, &g, &i, Some(&d), AT)
        .unwrap();
    let preview = l.inspect(Source::ClaudeLocal, &g, &i, &d).unwrap();
    assert_eq!(preview["measurement"]["counts"]["input_total"], "13");
    assert!(!preview.to_string().contains("fictional-request"));
    let corrected = exported(&mut l, Source::ClaudeLocal);
    assert_eq!(corrected["unallocated"][0]["counts"]["input_total"], "13");
    assert_ne!(corrected["revision"], first["revision"]);
    let fixed = l
        .export(Source::ClaudeLocal, "2026-10-19", "2026-10-26", AT)
        .unwrap()
        .bytes;
    scan(&mut l, &s);
    assert_eq!(
        l.export(Source::ClaudeLocal, "2026-10-19", "2026-10-26", AT)
            .unwrap()
            .bytes,
        fixed
    );
    // A future different measurement must not silently inherit an earlier review decision.
    fs::write(&file, message("fictional-a", 5)).unwrap();
    let reopened = scan(&mut l, &s).health;
    assert_eq!(reopened.conflicts, 1);
    assert_eq!(
        exported(&mut l, Source::ClaudeLocal)["unallocated"][0]["counts"]["input_total"],
        "13"
    );
    l.resolve(Source::ClaudeLocal, &g, &i, Some(&d), AT)
        .unwrap();
    fs::remove_file(file).unwrap();
    scan(&mut l, &s);
    let retained = exported(&mut l, Source::ClaudeLocal);
    assert_eq!(retained["unallocated"][0]["counts"]["input_total"], "13");
    assert!(
        retained["quality"]["reasons"]
            .as_array()
            .unwrap()
            .iter()
            .any(|r| r["code"] == "retained_not_observed" && r["occurrences"].is_null())
    );
}
#[test]
fn codex_reset_does_not_bridge_and_undated_checkpoint_is_not_a_day() {
    let t = Temp::new();
    let root = t.source();
    fs::write(root.join("a.jsonl"), codex(&[5, 10, 2, 20])).unwrap();
    let mut l = Ledger::init(&t.ledger()).unwrap();
    let h = scan(&mut l, &selection(Source::CodexLocal, &root)).health;
    assert_eq!(h.coverage.counter_resets, 1);
    assert_eq!(h.accepted_facts, 2);
    let v = exported(&mut l, Source::CodexLocal);
    let rows = v["unallocated"].as_array().unwrap();
    assert_eq!(rows.len(), 2);
    let total: usize = rows
        .iter()
        .map(|r| {
            r["counts"]["input_total"]
                .as_str()
                .unwrap()
                .parse::<usize>()
                .unwrap()
        })
        .sum();
    assert_eq!(total, 10);
    assert!(
        rows.iter()
            .any(|r| r["time_basis"] == "checkpoint_unknown" && r["observed_date"].is_null())
    );
    assert!(
        v["quality"]["reasons"]
            .as_array()
            .unwrap()
            .iter()
            .any(|r| r["code"] == "counter_reset" && r["occurrences"] == "1")
    );
}

#[test]
fn independent_cli_only_exports_explicit_fictional_roots_and_errors_are_redacted() {
    let t = Temp::new();
    let root = t.source();
    fs::write(root.join("a.jsonl"), message("fictional-cli", 10)).unwrap();
    let cli = env!("CARGO_BIN_EXE_enouia-usage");
    let invoke = |args: Vec<std::ffi::OsString>| {
        std::process::Command::new(cli).args(args).output().unwrap()
    };
    let init = invoke(vec!["init".into(), t.ledger().into()]);
    assert!(init.status.success());
    let scan = invoke(vec![
        "scan".into(),
        t.ledger().into(),
        "claude_local".into(),
        root.as_os_str().into(),
        "--model".into(),
        "fictional-model".into(),
    ]);
    assert!(scan.status.success());
    let output = t.0.join("cli-export.json");
    let out = invoke(vec![
        "export".into(),
        t.ledger().into(),
        "claude_local".into(),
        "2026-10-19".into(),
        "2026-10-26".into(),
        output.as_os_str().into(),
    ]);
    assert!(out.status.success());
    assert!(
        String::from_utf8(out.stdout)
            .unwrap()
            .contains("导出只含聚合")
    );
    enouia_usage::contract::parse(&fs::read(output).unwrap()).unwrap();
    let error = invoke(vec![
        "health".into(),
        t.0.join("PRIVATE_SENTINEL_PATH").into(),
        "claude_local".into(),
    ]);
    assert!(!error.status.success());
    let text = String::from_utf8(error.stdout).unwrap();
    assert!(!text.contains("PRIVATE_SENTINEL"));
    assert!(error.stderr.is_empty());
}

#[test]
#[ignore = "explicit read-only Dashboard checkout required; no dependency from Runtime builds"]
fn dashboard_consumer_accepts_runtime_exports() {
    let dashboard =
        std::env::var_os("USAGE_DASHBOARD_CHECKOUT").expect("explicit publisher checkout");
    let t = Temp::new();
    let root = t.source();
    let file = root.join("a.jsonl");
    fs::write(&file, message("fictional-a", 10)).unwrap();
    let mut l = Ledger::init(&t.ledger()).unwrap();
    let s = selection(Source::ClaudeLocal, &root);
    scan(&mut l, &s);
    let mut files = Vec::new();
    for (state, source) in [
        ("normal", Source::ClaudeLocal),
        ("conflict", Source::ClaudeLocal),
        ("retained", Source::ClaudeLocal),
        ("reset", Source::CodexLocal),
    ] {
        if state == "conflict" {
            fs::write(&file, message("fictional-a", 100)).unwrap();
            scan(&mut l, &s);
        }
        if state == "retained" {
            fs::remove_file(&file).unwrap();
            scan(&mut l, &s);
        }
        if state == "reset" {
            fs::write(root.join("codex.jsonl"), codex(&[5, 10, 2])).unwrap();
            scan(&mut l, &selection(Source::CodexLocal, &root));
        }
        let output = t.0.join(format!("{state}.json"));
        l.export_file(source, "2026-10-19", "2026-10-26", AT, &output)
            .unwrap();
        files.push(output);
    }
    let script =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../scripts/check-usage-conformance.mjs");
    let result = std::process::Command::new("node")
        .arg(script)
        .arg(dashboard)
        .args(files)
        .output()
        .unwrap();
    assert!(
        result.status.success(),
        "{}",
        String::from_utf8_lossy(&result.stderr)
    );
    println!("{}", String::from_utf8_lossy(&result.stdout));
}

#[test]
#[ignore = "explicit 100k/1m fictional scale trial; never a default test"]
fn synthetic_scale() {
    use std::io::Write;
    use windows_sys::Win32::System::{
        ProcessStatus::{GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS},
        Threading::GetCurrentProcess,
    };
    let n: usize = std::env::var("USAGE_SCALE_EVENTS")
        .unwrap()
        .parse()
        .unwrap();
    assert!([100_000, 1_000_000].contains(&n));
    let t = Temp::new();
    let root = t.source();
    let mut bytes = 0;
    for file in 0..n / 10_000 {
        let mut f = std::io::BufWriter::new(
            fs::File::create(root.join(format!("fictional-{file:03}.jsonl"))).unwrap(),
        );
        for i in file * 10_000..(file + 1) * 10_000 {
            let line = message(&format!("fictional-scale-{}", i % 100_000), 10);
            bytes += line.len();
            f.write_all(line.as_bytes()).unwrap();
        }
        f.flush().unwrap();
    }
    let mut s = selection(Source::ClaudeLocal, &root);
    s.limits.elapsed = std::time::Duration::from_secs(600);
    let mut l = Ledger::init(&t.ledger()).unwrap();
    let start = std::time::Instant::now();
    let r = scan(&mut l, &s);
    let elapsed = start.elapsed();
    assert_eq!(r.health.accepted_facts, 100_000);
    assert_eq!(r.health.coverage.records, n as u64);
    assert!(r.health.coverage.complete());
    assert_eq!(r.health.conflicts, 0);
    let mut memory = std::mem::MaybeUninit::<PROCESS_MEMORY_COUNTERS>::zeroed();
    let size = std::mem::size_of::<PROCESS_MEMORY_COUNTERS>() as u32;
    assert_ne!(
        unsafe { GetProcessMemoryInfo(GetCurrentProcess(), memory.as_mut_ptr(), size) },
        0
    );
    let memory = unsafe { memory.assume_init() };
    println!(
        "scale events={n} unique=100000 bytes={bytes} elapsed_ms={} peak_working_set_bytes={} peak_pagefile_bytes={} new={} duplicates={}",
        elapsed.as_millis(),
        memory.PeakWorkingSetSize,
        memory.PeakPagefileUsage,
        r.new_observations,
        r.duplicate_observations
    );
    assert!(
        memory.PeakWorkingSetSize < 256 * 1024 * 1024,
        "bounded-memory trial exceeded 256 MiB"
    );
    drop(l);
}

#[test]
fn export_row_budget_refuses_without_truncation_or_output_file() {
    let t = Temp::new();
    let root = t.source();
    let mut input = String::new();
    let start = enouia_usage::time::date_days("2010-01-01").unwrap();
    for i in 0..2001 {
        let date = enouia_usage::time::format_day(start + i);
        input += &message(&format!("fictional-budget-{i}"), 1)
            .replace("2026-10-20T23:59:00Z", &format!("{date}T00:00:00Z"));
    }
    fs::write(root.join("a.jsonl"), input).unwrap();
    let mut l = Ledger::init(&t.ledger()).unwrap();
    scan(&mut l, &selection(Source::ClaudeLocal, &root));
    let path = t.0.join("refused.json");
    assert!(matches!(
        l.export_file(Source::ClaudeLocal, "2026-10-19", "2026-10-26", AT, &path),
        Err(Error::BudgetExceeded)
    ));
    assert!(!path.exists());
    assert_eq!(l.health(Source::ClaudeLocal).unwrap().accepted_facts, 2001);
}
