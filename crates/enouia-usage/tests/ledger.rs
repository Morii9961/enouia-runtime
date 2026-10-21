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
