use enouia_activity::claude::{ClaudeConfig, CollectAbort, collect};
use enouia_activity::{SourceAttempt, SourceId};
use enouia_common::{
    Cancellation, ComponentId, ErrorCode, ProcessOutput, ProcessRequest, ProcessRunner,
    StructuredError,
};
use serde_json::Value;
use std::cell::RefCell;
use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

const ATTEMPT: &str = "2026-09-26T08:00:00.000Z";
const FIXTURE: &str = include_str!("../../../tests/fixtures/activity/claude-stores-v1.json");

struct Flag(Arc<AtomicBool>);

impl Cancellation for Flag {
    fn is_cancelled(&self) -> bool {
        self.0.load(Ordering::Relaxed)
    }
}

struct FakeRunner {
    outputs: RefCell<VecDeque<Result<ProcessOutput, StructuredError>>>,
    seen: RefCell<Vec<(PathBuf, Vec<String>)>>,
    cancel_on_run: Option<Arc<AtomicBool>>,
}

impl FakeRunner {
    fn with_reports() -> Self {
        let reports: Vec<Value> = serde_json::from_str(FIXTURE).unwrap();
        Self {
            outputs: RefCell::new(
                reports
                    .into_iter()
                    .map(|report| {
                        Ok(ProcessOutput {
                            exit_code: Some(0),
                            stdout: serde_json::to_vec(&report).unwrap(),
                            stderr: Vec::new(),
                        })
                    })
                    .collect(),
            ),
            seen: RefCell::new(Vec::new()),
            cancel_on_run: None,
        }
    }
}

impl ProcessRunner for FakeRunner {
    fn run(
        &self,
        request: &ProcessRequest,
        _: &dyn Cancellation,
    ) -> Result<ProcessOutput, StructuredError> {
        assert_eq!(request.executable, Path::new("C:/tools/node.exe"));
        assert_eq!(request.timeout, Duration::from_secs(120));
        assert_eq!(request.max_output_bytes, 4 * 1024 * 1024);
        assert!(request.stdin.is_none());
        assert_eq!(request.environment.len(), 1);
        assert_eq!(request.environment[0].0, "CLAUDE_CONFIG_DIR");
        self.seen.borrow_mut().push((
            PathBuf::from(&request.environment[0].1),
            request
                .arguments
                .iter()
                .map(|arg| arg.to_string_lossy().into_owned())
                .collect(),
        ));
        if let Some(signal) = &self.cancel_on_run {
            signal.store(true, Ordering::Relaxed);
        }
        self.outputs.borrow_mut().pop_front().unwrap()
    }
}

fn stores() -> Vec<PathBuf> {
    vec![
        PathBuf::from("C:/claude/normal"),
        PathBuf::from("C:/claude/cowork"),
    ]
}

fn config(stores: &[PathBuf]) -> ClaudeConfig<'_> {
    ClaudeConfig {
        node_executable: Path::new("C:/tools/node.exe"),
        ccusage_cli: Path::new("C:/runtime/ccusage/cli.js"),
        stores,
    }
}

fn active() -> Flag {
    Flag(Arc::new(AtomicBool::new(false)))
}

#[test]
fn runs_each_store_with_scoped_environment_and_combines_only_complete_reports() {
    let runner = FakeRunner::with_reports();
    let stores = stores();
    let attempt = collect(&config(&stores), ATTEMPT, &runner, &active()).unwrap();
    let SourceAttempt::Success {
        source, snapshot, ..
    } = attempt
    else {
        panic!("expected complete Claude snapshot");
    };
    assert_eq!(source, SourceId::Claude);
    assert_eq!(snapshot.days[0].value, 40);
    assert_eq!(snapshot.days[1].value, 1);
    let seen = runner.seen.borrow();
    assert_eq!(seen.len(), 2);
    assert_eq!(seen[0].0, stores[0]);
    assert_eq!(seen[1].0, stores[1]);
    for (_, arguments) in seen.iter() {
        assert_eq!(
            arguments,
            &[
                "C:/runtime/ccusage/cli.js",
                "claude",
                "daily",
                "--json",
                "--offline",
                "--timezone",
                "Asia/Shanghai"
            ]
        );
    }
}

#[test]
fn one_failed_or_malformed_store_fails_claude_without_partial_success() {
    let runner = FakeRunner::with_reports();
    runner.outputs.borrow_mut()[1] = Err(StructuredError {
        code: ErrorCode::Unconfigured,
        component: ComponentId::ActivityCollectorClaude,
        retryable: true,
    });
    let stores = stores();
    assert!(matches!(
        collect(&config(&stores), ATTEMPT, &runner, &active()).unwrap(),
        SourceAttempt::Failed {
            source: SourceId::Claude,
            error_code: ErrorCode::Unconfigured,
            ..
        }
    ));
    let runner = FakeRunner::with_reports();
    runner.outputs.borrow_mut()[1] = Ok(ProcessOutput {
        exit_code: Some(0),
        stdout: b"{\"daily\":[]}".to_vec(),
        stderr: Vec::new(),
    });
    assert!(matches!(
        collect(&config(&stores), ATTEMPT, &runner, &active()).unwrap(),
        SourceAttempt::Failed {
            source: SourceId::Claude,
            error_code: ErrorCode::SourceInvalid,
            ..
        }
    ));
}

#[test]
fn nonzero_exit_and_oversized_output_fail_without_exposing_process_text() {
    let stores = stores();
    for output in [
        ProcessOutput {
            exit_code: Some(7),
            stdout: b"private report".to_vec(),
            stderr: b"private error".to_vec(),
        },
        ProcessOutput {
            exit_code: Some(0),
            stdout: vec![b'x'; 4 * 1024 * 1024 + 1],
            stderr: Vec::new(),
        },
        ProcessOutput {
            exit_code: Some(0),
            stdout: b"{}".to_vec(),
            stderr: vec![b'x'; 4 * 1024 * 1024],
        },
    ] {
        let runner = FakeRunner {
            outputs: RefCell::new([Ok(output)].into()),
            seen: RefCell::new(Vec::new()),
            cancel_on_run: None,
        };
        let result = collect(&config(&stores), ATTEMPT, &runner, &active()).unwrap();
        assert!(matches!(
            result,
            SourceAttempt::Failed {
                error_code: ErrorCode::SourceInvalid,
                ..
            }
        ));
        assert_eq!(runner.seen.borrow().len(), 1);
    }
}

#[test]
fn invalid_config_or_duplicate_inventory_does_not_run_a_tool() {
    let runner = FakeRunner::with_reports();
    let stores = vec![
        PathBuf::from("C:/claude/normal"),
        PathBuf::from("C:/claude/normal"),
    ];
    assert!(matches!(
        collect(&config(&stores), ATTEMPT, &runner, &active()).unwrap(),
        SourceAttempt::Failed {
            error_code: ErrorCode::Unconfigured,
            ..
        }
    ));
    assert!(runner.seen.borrow().is_empty());
    let empty: Vec<PathBuf> = Vec::new();
    assert!(matches!(
        collect(&config(&empty), ATTEMPT, &runner, &active()).unwrap(),
        SourceAttempt::Failed {
            error_code: ErrorCode::Unconfigured,
            ..
        }
    ));
}

#[test]
fn cancellation_aborts_the_candidate_batch() {
    let signal = Arc::new(AtomicBool::new(false));
    let mut runner = FakeRunner::with_reports();
    runner.cancel_on_run = Some(Arc::clone(&signal));
    let stores = stores();
    let result = collect(&config(&stores), ATTEMPT, &runner, &Flag(signal));
    assert!(matches!(result, Err(CollectAbort::Cancelled)));
    assert_eq!(runner.seen.borrow().len(), 1);
}
