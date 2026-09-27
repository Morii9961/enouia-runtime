use enouia_activity::codex::{CollectAbort, collect};
use enouia_activity::{SourceAttempt, SourceId};
use enouia_common::{Cancellation, ComponentId, ErrorCode, JsonLineSession, StructuredError};
use serde_json::{Value, json};
use std::cell::{Cell, RefCell};
use std::collections::VecDeque;
use std::rc::Rc;
use std::time::Duration;

const ATTEMPT: &str = "2026-09-26T08:00:00.000Z";
const FIXTURE: &str = include_str!("../../../tests/fixtures/activity/codex-usage-v1.json");

struct CancelFlag(Rc<Cell<bool>>);

impl Cancellation for CancelFlag {
    fn is_cancelled(&self) -> bool {
        self.0.get()
    }
}

struct FakeSession {
    incoming: RefCell<VecDeque<Result<Vec<u8>, StructuredError>>>,
    sent: RefCell<Vec<Value>>,
    cancel_after_read: Option<Rc<Cell<bool>>>,
}

impl FakeSession {
    fn messages(messages: impl IntoIterator<Item = Value>) -> Self {
        Self {
            incoming: RefCell::new(
                messages
                    .into_iter()
                    .map(|message| Ok(serde_json::to_vec(&message).unwrap()))
                    .collect(),
            ),
            sent: RefCell::new(Vec::new()),
            cancel_after_read: None,
        }
    }
}

impl JsonLineSession for FakeSession {
    fn write_line(&mut self, line: &[u8], _: &dyn Cancellation) -> Result<(), StructuredError> {
        assert!(line.ends_with(b"\n"));
        self.sent
            .borrow_mut()
            .push(serde_json::from_slice(line).unwrap());
        Ok(())
    }

    fn read_line(
        &mut self,
        timeout: Duration,
        max_bytes: usize,
        _: &dyn Cancellation,
    ) -> Result<Vec<u8>, StructuredError> {
        assert!(timeout > Duration::ZERO && timeout <= Duration::from_secs(90));
        assert!(max_bytes <= 4 * 1024 * 1024);
        if let Some(flag) = &self.cancel_after_read {
            flag.set(true);
        }
        self.incoming.borrow_mut().pop_front().unwrap_or({
            Err(StructuredError {
                code: ErrorCode::SourceInvalid,
                component: ComponentId::ActivityCollectorCodex,
                retryable: true,
            })
        })
    }
}

fn response() -> Value {
    json!({"id":2,"result":serde_json::from_str::<Value>(FIXTURE).unwrap()})
}

fn initialized() -> Value {
    json!({"id":1,"result":{"userAgent":"fixture"}})
}

fn flag() -> CancelFlag {
    CancelFlag(Rc::new(Cell::new(false)))
}

#[test]
fn handshake_ignores_notifications_then_reads_usage() {
    let mut session = FakeSession::messages([
        initialized(),
        json!({"method":"account/rateLimits/updated","params":{}}),
        response(),
    ]);
    let attempt = collect(&mut session, ATTEMPT, &flag()).unwrap();
    assert!(matches!(
        attempt,
        SourceAttempt::Success {
            source: SourceId::Codex,
            ..
        }
    ));
    let sent = session.sent.borrow();
    assert_eq!(sent.len(), 3);
    assert_eq!(sent[0]["method"], "initialize");
    assert_eq!(sent[0]["params"]["clientInfo"]["name"], "enouia_activity");
    assert_eq!(sent[1]["method"], "initialized");
    assert_eq!(sent[2]["method"], "account/usage/read");
    assert_eq!(sent[2]["id"], 2);
}

#[test]
fn unsupported_method_is_a_failed_codex_attempt() {
    let mut session = FakeSession::messages([
        initialized(),
        json!({"id":2,"error":{"code":-32600,"message":"unknown variant"}}),
    ]);
    let attempt = collect(&mut session, ATTEMPT, &flag()).unwrap();
    assert!(matches!(
        attempt,
        SourceAttempt::Failed {
            source: SourceId::Codex,
            error_code: ErrorCode::UnsupportedMethod,
            ..
        }
    ));
}

#[test]
fn invalid_handshake_or_response_cannot_advance() {
    for messages in [
        vec![json!({"id":1,"error":{"code":-1}})],
        vec![response()],
        vec![initialized(), json!({"id":1,"result":{}})],
        vec![initialized(), json!({"id":2,"result":null})],
    ] {
        let mut session = FakeSession::messages(messages);
        let attempt = collect(&mut session, ATTEMPT, &flag()).unwrap();
        assert!(matches!(
            attempt,
            SourceAttempt::Failed {
                source: SourceId::Codex,
                error_code: ErrorCode::SourceInvalid,
                ..
            }
        ));
    }
}

#[test]
fn oversized_or_malformed_lines_fail_without_exposing_contents() {
    for line in [
        vec![b' '; 4 * 1024 * 1024 + 1],
        b"private invalid json".to_vec(),
    ] {
        let mut session = FakeSession {
            incoming: RefCell::new(VecDeque::from([Ok(line)])),
            sent: RefCell::new(Vec::new()),
            cancel_after_read: None,
        };
        let attempt = collect(&mut session, ATTEMPT, &flag()).unwrap();
        assert!(matches!(
            attempt,
            SourceAttempt::Failed {
                error_code: ErrorCode::SourceInvalid,
                ..
            }
        ));
    }
}

#[test]
fn cancellation_before_or_during_read_aborts_whole_run() {
    let cancelled = CancelFlag(Rc::new(Cell::new(true)));
    let mut session = FakeSession::messages([initialized(), response()]);
    assert!(matches!(
        collect(&mut session, ATTEMPT, &cancelled),
        Err(CollectAbort::Cancelled)
    ));
    assert!(session.sent.borrow().is_empty());

    let active = flag();
    let mut session = FakeSession::messages([initialized(), response()]);
    session.cancel_after_read = Some(active.0.clone());
    assert!(matches!(
        collect(&mut session, ATTEMPT, &active),
        Err(CollectAbort::Cancelled)
    ));
    assert_eq!(session.sent.borrow().len(), 1);
}

#[test]
fn session_read_failure_is_a_codex_only_failure() {
    let mut session = FakeSession {
        incoming: RefCell::new(VecDeque::from([Err(StructuredError {
            code: ErrorCode::Unconfigured,
            component: ComponentId::ActivityCollectorCodex,
            retryable: true,
        })])),
        sent: RefCell::new(Vec::new()),
        cancel_after_read: None,
    };
    let attempt = collect(&mut session, ATTEMPT, &flag()).unwrap();
    assert!(matches!(
        attempt,
        SourceAttempt::Failed {
            source: SourceId::Codex,
            error_code: ErrorCode::Unconfigured,
            ..
        }
    ));
}

#[test]
fn cumulative_notification_output_cannot_exceed_limit() {
    let large = json!({"method":"notice","params":{"text":"x".repeat(4 * 1024 * 1024)}});
    let mut session = FakeSession::messages([initialized(), large, response()]);
    let attempt = collect(&mut session, ATTEMPT, &flag()).unwrap();
    assert!(matches!(
        attempt,
        SourceAttempt::Failed {
            source: SourceId::Codex,
            error_code: ErrorCode::SourceInvalid,
            ..
        }
    ));
}
