use enouia_activity::github::{CollectAbort, GithubConfig, collect, parse_calendar};
use enouia_activity::{SourceAttempt, SourceId};
use enouia_common::{
    Cancellation, ComponentId, ErrorCode, ProcessOutput, ProcessRequest, ProcessRunner,
    StructuredError,
};
use serde_json::{Value, json};
use std::cell::RefCell;
use std::path::Path;
use std::time::Duration;

const ATTEMPT: &str = "2026-09-26T08:00:00.000Z";
const FIXTURE: &str = include_str!("../../../tests/fixtures/activity/github-calendar-v1.json");

#[derive(Default)]
struct NeverCancelled(bool);

impl Cancellation for NeverCancelled {
    fn is_cancelled(&self) -> bool {
        self.0
    }
}

struct FakeRunner {
    result: Result<ProcessOutput, StructuredError>,
    requests: RefCell<Vec<Vec<String>>>,
}

impl FakeRunner {
    fn response(body: &str) -> Self {
        Self {
            result: Ok(ProcessOutput {
                exit_code: Some(0),
                stdout: body.as_bytes().to_vec(),
                stderr: Vec::new(),
            }),
            requests: RefCell::new(Vec::new()),
        }
    }
}

impl ProcessRunner for FakeRunner {
    fn run(
        &self,
        request: &ProcessRequest,
        _: &dyn Cancellation,
    ) -> Result<ProcessOutput, StructuredError> {
        assert_eq!(request.executable, Path::new("C:/tools/gh.exe"));
        assert_eq!(request.timeout, Duration::from_secs(40));
        assert_eq!(request.max_output_bytes, 4 * 1024 * 1024);
        assert!(request.environment.is_empty());
        assert!(request.stdin.is_none());
        self.requests.borrow_mut().push(
            request
                .arguments
                .iter()
                .map(|arg| arg.to_string_lossy().into_owned())
                .collect(),
        );
        match &self.result {
            Ok(output) => Ok(ProcessOutput {
                exit_code: output.exit_code,
                stdout: output.stdout.clone(),
                stderr: output.stderr.clone(),
            }),
            Err(error) => Err(error.clone()),
        }
    }
}

fn config() -> GithubConfig<'static> {
    GithubConfig {
        executable: Path::new("C:/tools/gh.exe"),
        login: "fixture-user",
    }
}

#[test]
fn request_uses_bounded_legacy_window_and_normalizes_private_fields() {
    let runner = FakeRunner::response(FIXTURE);
    let attempt = collect(&config(), ATTEMPT, &runner, &NeverCancelled::default()).unwrap();
    let SourceAttempt::Success {
        source, snapshot, ..
    } = attempt
    else {
        panic!("expected a valid GitHub snapshot");
    };
    assert_eq!(source, SourceId::Github);
    assert_eq!(snapshot.days[0].value, 2);
    assert_eq!(snapshot.days[1].value, 0);
    assert!(
        !serde_json::to_string(&snapshot)
            .unwrap()
            .contains("DO_NOT_EXPORT")
    );
    let requests = runner.requests.borrow();
    assert_eq!(requests.len(), 1);
    assert_eq!(requests[0][..3], ["api", "graphql", "-f"]);
    assert!(requests[0][3].starts_with("query=query($login:String!"));
    assert_eq!(requests[0][5], "login=fixture-user");
    assert_eq!(requests[0][7], "from=2025-09-27T00:00:00Z");
    assert_eq!(requests[0][9], "to=2026-09-26T23:59:59Z");
}

#[test]
fn malformed_graphql_reports_fail_without_partial_calendar() {
    let fixture: Value = serde_json::from_str(FIXTURE).unwrap();
    let invalid = [
        json!({"errors":[{"message":"no access"}],"data":fixture["data"]}),
        json!({"data":{"user":null}}),
        json!({"data":{"user":{"contributionsCollection":{"contributionCalendar":{"weeks":[]}}}}}),
        json!({"data":{"user":{"contributionsCollection":{"contributionCalendar":{"weeks":[{"contributionDays":[]}]}}}}}),
    ];
    for report in invalid {
        assert_eq!(
            parse_calendar(&report, ATTEMPT).unwrap_err(),
            ErrorCode::SourceInvalid
        );
    }
}

#[test]
fn invalid_duplicate_and_unsafe_days_fail_as_one_source() {
    for day in [
        json!({"date":"2026-02-30","contributionCount":1}),
        json!({"date":"2026-09-26","contributionCount":-1}),
        json!({"date":"2026-09-26","contributionCount":9007199254740992_u64}),
        json!({"date":"2026-09-26","contributionCount":"1"}),
    ] {
        let report = json!({"data":{"user":{"contributionsCollection":{"contributionCalendar":{"weeks":[{"contributionDays":[day]}]}}}}});
        assert_eq!(
            parse_calendar(&report, ATTEMPT).unwrap_err(),
            ErrorCode::SourceInvalid
        );
    }
    let duplicate = json!({"data":{"user":{"contributionsCollection":{"contributionCalendar":{"weeks":[
        {"contributionDays":[{"date":"2026-09-26","contributionCount":1}]},
        {"contributionDays":[{"date":"2026-09-26","contributionCount":2}]}
    ]}}}}});
    assert_eq!(
        parse_calendar(&duplicate, ATTEMPT).unwrap_err(),
        ErrorCode::SourceInvalid
    );
}

#[test]
fn unavailable_process_and_cancellation_affect_only_github() {
    let runner = FakeRunner {
        result: Err(StructuredError {
            code: ErrorCode::Unconfigured,
            component: ComponentId::ActivityCollectorGithub,
            retryable: true,
        }),
        requests: RefCell::new(Vec::new()),
    };
    let attempt = collect(&config(), ATTEMPT, &runner, &NeverCancelled::default()).unwrap();
    assert!(matches!(
        attempt,
        SourceAttempt::Failed {
            source: SourceId::Github,
            error_code: ErrorCode::Unconfigured,
            ..
        }
    ));
    assert_eq!(runner.requests.borrow().len(), 1);
    let cancelled = collect(&config(), ATTEMPT, &runner, &NeverCancelled(true));
    assert!(matches!(cancelled, Err(CollectAbort::Cancelled)));
    assert_eq!(runner.requests.borrow().len(), 1);
    let relative = GithubConfig {
        executable: Path::new("gh"),
        login: "fixture-user",
    };
    let unconfigured = collect(&relative, ATTEMPT, &runner, &NeverCancelled::default()).unwrap();
    assert!(matches!(
        unconfigured,
        SourceAttempt::Failed {
            source: SourceId::Github,
            error_code: ErrorCode::Unconfigured,
            ..
        }
    ));
    assert_eq!(runner.requests.borrow().len(), 1);
}

#[test]
fn nonzero_exit_bad_json_and_output_over_limit_fail() {
    for output in [
        ProcessOutput {
            exit_code: Some(1),
            stdout: FIXTURE.as_bytes().to_vec(),
            stderr: b"private".to_vec(),
        },
        ProcessOutput {
            exit_code: Some(0),
            stdout: b"not json".to_vec(),
            stderr: Vec::new(),
        },
        ProcessOutput {
            exit_code: Some(0),
            stdout: vec![b' '; 4 * 1024 * 1024 + 1],
            stderr: Vec::new(),
        },
        ProcessOutput {
            exit_code: Some(0),
            stdout: FIXTURE.as_bytes().to_vec(),
            stderr: vec![b'x'; 4 * 1024 * 1024],
        },
    ] {
        let runner = FakeRunner {
            result: Ok(output),
            requests: RefCell::new(Vec::new()),
        };
        let attempt = collect(&config(), ATTEMPT, &runner, &NeverCancelled::default()).unwrap();
        assert!(matches!(
            attempt,
            SourceAttempt::Failed {
                source: SourceId::Github,
                error_code: ErrorCode::SourceInvalid,
                ..
            }
        ));
    }
}
