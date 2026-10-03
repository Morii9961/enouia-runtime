//! Design corpus replay through existing pure models. No Vault or IPC adapter.
use enouia_memory::*;
use enouia_session::*;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Bundle {
    memory: MemorySnapshot,
    sessions: Vec<SessionRecord>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
enum Action {
    CreateSession {
        session_id: String,
        title: String,
    },
    Save {
        source: SourceRecord,
        record: Box<MemoryRecord>,
        origin: String,
    },
    AppendUser {
        source: SourceRecord,
        session_id: String,
        turn_id: String,
        content: String,
    },
    Checkpoint {
        source: SourceRecord,
        record: Box<MemoryRecord>,
        session_id: String,
        origin: String,
    },
    Propose {
        candidate: Box<CandidateRecord>,
    },
    Approve {
        candidate_id: String,
        edited: Box<MemoryRecord>,
    },
    Reject {
        candidate_id: String,
        reason: String,
    },
    Undo {
        memory_id: String,
    },
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Step {
    name: String,
    at: String,
    action: Action,
    expected: Bundle,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Negative {
    name: String,
    after: String,
    at: String,
    action: Action,
    error_code: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Corpus {
    schema_version: u32,
    evidence: String,
    initial: Bundle,
    steps: Vec<Step>,
    negatives: Vec<Negative>,
}

fn require(ok: bool, code: &'static str, field: &'static str) -> Result<(), ValidationError> {
    if ok {
        Ok(())
    } else {
        Err(ValidationError { code, field })
    }
}

fn graph(bundle: &Bundle) -> Result<(), ValidationError> {
    MemoryLedger::from_snapshot(bundle.memory.clone())?;
    validate_sessions(&bundle.sessions, &bundle.memory)
}

// Retention checks for this selected history; not a complete Vault transition validator.
fn retained(before: &Bundle, after: &Bundle) -> Result<(), ValidationError> {
    for old in &before.memory.sources {
        require(
            after.memory.sources.iter().any(|s| s == old),
            "changed_source_history",
            "source",
        )?;
    }
    for old in &before.memory.memories {
        let mut next = after
            .memory
            .memories
            .iter()
            .find(|m| m.memory_id == old.memory_id)
            .ok_or(ValidationError {
                code: "lost_memory_history",
                field: "memory_id",
            })?
            .clone();
        require(
            next.updated_at >= old.updated_at,
            "clock_regression",
            "memory.updated_at",
        )?;
        next.status = old.status;
        next.updated_at.clone_from(&old.updated_at);
        require(&next == old, "changed_memory_history", "memory")?;
    }
    for old in &before.memory.candidates {
        let next = after
            .memory
            .candidates
            .iter()
            .find(|c| c.candidate_id == old.candidate_id)
            .ok_or(ValidationError {
                code: "lost_candidate_history",
                field: "candidate_id",
            })?;
        require(
            next.proposal == old.proposal && next.created_at == old.created_at,
            "changed_proposal_history",
            "candidate.proposal",
        )?;
        require(
            next.updated_at >= old.updated_at,
            "clock_regression",
            "candidate.updated_at",
        )?;
        require(
            matches!(old.decision, CandidateDecision::Pending {}) || next == old,
            "changed_terminal_review",
            "candidate.decision",
        )?;
    }
    for old in &before.sessions {
        let next = after
            .sessions
            .iter()
            .find(|s| s.session_id == old.session_id)
            .ok_or(ValidationError {
                code: "lost_session_history",
                field: "session_id",
            })?;
        require(
            next.title == old.title
                && next.created_at == old.created_at
                && next.schema_version == old.schema_version
                && next.events.starts_with(&old.events),
            "changed_session_history",
            "session",
        )?;
    }
    Ok(())
}

fn origin(name: &str) -> Result<ExplicitSave, ValidationError> {
    match name {
        "inspector" => Ok(ExplicitSave::Inspector),
        "remember" => Ok(ExplicitSave::Remember),
        _ => Err(ValidationError {
            code: "unknown_fixture_origin",
            field: "origin",
        }),
    }
}

fn session<'a>(
    sessions: &'a mut [SessionRecord],
    id: &str,
) -> Result<&'a mut SessionRecord, ValidationError> {
    sessions
        .iter_mut()
        .find(|s| s.session_id == id)
        .ok_or(ValidationError {
            code: "missing_session",
            field: "session_id",
        })
}

fn apply(before: &Bundle, action: &Action, at: &str) -> Result<Bundle, ValidationError> {
    graph(before)?;
    let mut ledger = MemoryLedger::from_snapshot(before.memory.clone())?;
    let mut sessions = before.sessions.clone();
    match action {
        Action::CreateSession { session_id, title } => {
            require(
                !sessions.iter().any(|s| &s.session_id == session_id),
                "duplicate_id",
                "session_id",
            )?;
            sessions.push(SessionRecord::new(
                session_id.clone(),
                title.clone(),
                at.into(),
            )?);
            sessions.sort_by(|a, b| a.session_id.cmp(&b.session_id));
        }
        Action::Save {
            source,
            record,
            origin: name,
        } => {
            ledger.add_source(source.clone())?;
            ledger.commit_explicit((**record).clone(), origin(name)?)?;
        }
        Action::AppendUser {
            source,
            session_id,
            turn_id,
            content,
        } => {
            ledger.add_source(source.clone())?;
            session(&mut sessions, session_id)?.append_turn(
                TurnInput {
                    turn_id: turn_id.clone(),
                    role: TurnRole::User,
                    content: content.clone(),
                    source_id: source.source_id.clone(),
                },
                at,
                &ledger.snapshot(),
            )?;
        }
        Action::Checkpoint {
            source,
            record,
            session_id,
            origin: name,
        } => {
            ledger.add_source(source.clone())?;
            ledger.commit_explicit((**record).clone(), origin(name)?)?;
            session(&mut sessions, session_id)?.append_checkpoint(
                record.memory_id.clone(),
                at,
                &ledger.snapshot(),
            )?;
        }
        Action::Propose { candidate } => ledger.propose((**candidate).clone())?,
        Action::Approve {
            candidate_id,
            edited,
        } => {
            ledger.approve(candidate_id, (**edited).clone(), at)?;
            if edited.kind == MemoryKind::SessionCheckpoint {
                let id = edited.session_id.as_deref().ok_or(ValidationError {
                    code: "missing_session",
                    field: "session_id",
                })?;
                session(&mut sessions, id)?.append_checkpoint(
                    edited.memory_id.clone(),
                    at,
                    &ledger.snapshot(),
                )?;
            }
        }
        Action::Reject {
            candidate_id,
            reason,
        } => ledger.reject(candidate_id, reason, at)?,
        Action::Undo { memory_id } => ledger.undo_supersession(memory_id, at)?,
    }
    let result = Bundle {
        memory: ledger.snapshot(),
        sessions,
    };
    graph(&result)?;
    retained(before, &result)?;
    Ok(result)
}

fn main() {
    let path = std::env::args().nth(1).expect("design fixture path");
    let corpus: Corpus = serde_json::from_slice(&std::fs::read(path).expect("read design fixture"))
        .expect("closed fixture decode");
    assert_eq!(corpus.schema_version, 1);
    assert_eq!(corpus.evidence, "synthetic_pure_model_history_only");
    assert_eq!(corpus.initial.memory, MemorySnapshot::default());
    assert!(corpus.initial.sessions.is_empty());
    let mut states = BTreeMap::from([("initial".to_string(), corpus.initial.clone())]);
    let mut current = corpus.initial;
    let mut byte_records = 0;
    for step in &corpus.steps {
        assert!(!states.contains_key(&step.name), "duplicate step");
        let next = apply(&current, &step.action, &step.at)
            .unwrap_or_else(|e| panic!("{}: {e}", step.name));
        assert_eq!(next, step.expected, "frozen expected model: {}", step.name);
        // serde's declared field order is checked against a decode/re-encode,
        // while exact storage LF/hash fixtures remain a separate design pack.
        let raw = serde_json::to_vec(&next).unwrap();
        let restored: Bundle = serde_json::from_slice(&raw).unwrap();
        assert_eq!(raw, serde_json::to_vec(&restored).unwrap());
        byte_records += 1;
        states.insert(step.name.clone(), next.clone());
        current = next;
    }
    for case in &corpus.negatives {
        let before = states.get(&case.after).expect("negative starting state");
        let captured = before.clone();
        let error = apply(before, &case.action, &case.at).expect_err("negative action accepted");
        assert_eq!(error.code, case.error_code, "{}", case.name);
        assert_eq!(&captured, before, "negative changed original model");
    }
    // A valid current graph alone does not prove the retained history is unchanged.
    let mut rewritten = current.clone();
    rewritten.memory.sources[0].title.push_str(" rewritten");
    graph(&rewritten).unwrap();
    assert_eq!(
        retained(&current, &rewritten).unwrap_err().code,
        "changed_source_history"
    );
    let mut rewritten = current.clone();
    if let EventContent::Turn { content, .. } = &mut rewritten.sessions[0].events[0].event {
        content.push_str(" rewritten");
    }
    graph(&rewritten).unwrap();
    assert_eq!(
        retained(&current, &rewritten).unwrap_err().code,
        "changed_session_history"
    );
    println!(
        "PASS DESIGN pure Rust history: {} transitions; {} typed byte roundtrips; {} refused actions with retained input; 2 valid-graph history rewrites refused",
        corpus.steps.len(),
        byte_records,
        corpus.negatives.len()
    );
    println!(
        "NOT VERIFIED: Vault storage transitions/bytes, receipts, invocation/provider, IPC, OS entropy/locks, durable commit or restart"
    );
}
