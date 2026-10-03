//! Selected pure-model continuity composition, never a durable Runtime flow.
use enouia_common::Cancellation;
use enouia_context::*;
use enouia_memory::*;
use enouia_provider::*;
use enouia_session::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Bundle {
    memory: MemorySnapshot,
    sessions: Vec<SessionRecord>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Input {
    session_id: String,
    user_turn_id: String,
    user_source_id: String,
    user_at: String,
    text: String,
    capsule_id: String,
    request_id: String,
    prepared_at: String,
    identity: Vec<IdentityEntry>,
    ranked: Vec<RankInput>,
    assistant_turn_id: String,
    assistant_source_id: String,
    completed_at: String,
    checkpoint_memory_id: String,
    checkpoint_source_id: String,
    checkpoint_at: String,
    checkpoint_content: String,
    checkpoint_last_state: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RankInput {
    memory_id: String,
    rank: u32,
    section: InclusionReason,
}

#[derive(Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Output {
    input: Bundle,
    capsule_bytes: String,
    request_bytes: String,
    response_bytes: String,
    completed: Bundle,
    checkpointed: Bundle,
    exclusions: Vec<ContextExclusion>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Corpus {
    schema_version: u32,
    evidence: String,
    config: Input,
    expected: Option<Output>,
}

struct Cancel(bool);
impl Cancellation for Cancel {
    fn is_cancelled(&self) -> bool {
        self.0
    }
}

fn graph(bundle: &Bundle) {
    MemoryLedger::from_snapshot(bundle.memory.clone()).unwrap();
    validate_sessions(&bundle.sessions, &bundle.memory).unwrap();
}

fn source(id: &str, at: &str, session_id: Option<&str>, turn: Option<&str>) -> SourceRecord {
    SourceRecord {
        schema_version: 1,
        source_id: id.into(),
        kind: if turn.is_some() {
            SourceKind::ConversationTurn
        } else {
            SourceKind::ManualSave
        },
        title: "Synthetic pure continuity source".into(),
        created_at: at.into(),
        session_id: session_id.map(str::to_string),
        turn_id: turn.map(str::to_string),
        importer_version: None,
        raw_sha256: None,
    }
}

fn append(before: &Bundle, config: &Input, assistant: bool, text: &str) -> Bundle {
    let (at, turn, src, role) = if assistant {
        (
            &config.completed_at,
            &config.assistant_turn_id,
            &config.assistant_source_id,
            TurnRole::Assistant,
        )
    } else {
        (
            &config.user_at,
            &config.user_turn_id,
            &config.user_source_id,
            TurnRole::User,
        )
    };
    let mut ledger = MemoryLedger::from_snapshot(before.memory.clone()).unwrap();
    ledger
        .add_source(source(src, at, Some(&config.session_id), Some(turn)))
        .unwrap();
    let mut sessions = before.sessions.clone();
    let session = sessions
        .iter_mut()
        .find(|s| s.session_id == config.session_id)
        .unwrap();
    session
        .append_turn(
            TurnInput {
                turn_id: turn.into(),
                role,
                content: text.into(),
                source_id: src.into(),
            },
            at,
            &ledger.snapshot(),
        )
        .unwrap();
    let next = Bundle {
        memory: ledger.snapshot(),
        sessions,
    };
    graph(&next);
    next
}

fn perform(before: &Bundle, config: &Input) -> Output {
    graph(before);
    let input = append(before, config, false, &config.text);
    let capture = input.clone();
    let current_session = input
        .sessions
        .iter()
        .find(|s| s.session_id == config.session_id)
        .unwrap();
    let event = current_session.events.last().unwrap();
    let EventContent::Turn {
        turn_id,
        role,
        content,
        source_id,
    } = &event.event
    else {
        panic!("input must end in triggering user")
    };
    assert_eq!(role, &TurnRole::User);
    assert_eq!(turn_id, &config.user_turn_id);
    let seed = ContextCapsule {
        schema_version: 1,
        capsule_id: config.capsule_id.clone(),
        generated_at: config.prepared_at.clone(),
        query: config.text.clone(),
        identity: config.identity.clone(),
        user_context: vec![],
        relationship_context: vec![],
        active_projects: vec![],
        relevant_memories: vec![],
        recent_session_checkpoints: vec![],
        recent_turns: vec![ContextTurn {
            turn_id: turn_id.clone(),
            session_id: config.session_id.clone(),
            role: *role,
            content: content.clone(),
            source_id: source_id.clone(),
            created_at: event.created_at.clone(),
        }],
        open_loops: vec![],
        provenance: config
            .identity
            .iter()
            .map(|i| ContextProvenance {
                entry_id: format!("identity:{}", i.name),
                source_id: None,
                reason: InclusionReason::Identity,
            })
            .chain([ContextProvenance {
                entry_id: turn_id.clone(),
                source_id: Some(source_id.clone()),
                reason: InclusionReason::RecentTurn,
            }])
            .collect(),
        budget: CapsuleBudget {
            max_tokens: 32768,
            estimated_tokens: 0,
            reserve_tokens: 256,
            policy: TokenPolicy::Utf8BytesV1,
        },
    };
    let ranked = config
        .ranked
        .iter()
        .map(|r| RankedMemory {
            memory_id: r.memory_id.clone(),
            rank: r.rank,
            section: r.section,
        })
        .collect();
    let compiled = compile_ranked(seed, ranked, &input.memory, &input.sessions).unwrap();
    assert_eq!(compiled.exclusions.len(), 2);
    assert_eq!(compiled.exclusions[0].reason, ExclusionReason::Inactive);
    assert_eq!(compiled.exclusions[1].reason, ExclusionReason::Duplicate);
    let request = ProviderRequest {
        schema_version: 1,
        request_id: config.request_id.clone(),
        capsule: compiled.capsule,
    };
    let request_bytes = serde_json::to_string(&request).unwrap() + "\n";
    let prepared = request
        .clone()
        .prepare(&input.memory, &input.sessions)
        .unwrap();
    let capsule_bytes = prepared.capsule_bytes().to_vec();
    assert!(!capsule_bytes.ends_with(b"\n"));
    assert!(capsule_bytes.len() as u64 + 256 <= 32768);
    let reply = MockProvider.respond(&prepared, &Cancel(false)).unwrap();
    reply
        .validate_against(&prepared, &MockProvider.capabilities())
        .unwrap();
    assert_eq!(
        input, capture,
        "Context/Mock cannot mutate the accepted input"
    );
    assert_eq!(reply.project_states.len(), 1);
    let restored_project = input
        .memory
        .memories
        .iter()
        .find(|m| m.memory_id == reply.project_states[0].memory_id)
        .unwrap();
    assert_eq!(reply.project_states[0].content, restored_project.content);
    assert_eq!(restored_project.status, MemoryStatus::Active);
    assert!(
        !reply
            .text
            .contains("Human-edited approved project meaning.")
    );
    assert!(reply.tool_requests.is_empty());
    let response_bytes = serde_json::to_string(&reply).unwrap() + "\n";
    let completed = append(&input, config, true, &reply.text);
    assert_eq!(
        completed.memory.memories.len(),
        input.memory.memories.len(),
        "answer adds no Memory or checkpoint"
    );
    assert_eq!(
        completed.sessions[0].checkpoints().count(),
        input.sessions[0].checkpoints().count()
    );
    assert!(
        completed.sessions[0]
            .events
            .starts_with(&input.sessions[0].events)
    );
    let mut ledger = MemoryLedger::from_snapshot(completed.memory.clone()).unwrap();
    ledger
        .add_source(source(
            &config.checkpoint_source_id,
            &config.checkpoint_at,
            None,
            None,
        ))
        .unwrap();
    let mut checkpoint = completed
        .memory
        .memories
        .iter()
        .find(|m| m.kind == MemoryKind::SessionCheckpoint)
        .unwrap()
        .clone();
    checkpoint
        .memory_id
        .clone_from(&config.checkpoint_memory_id);
    checkpoint
        .source_id
        .clone_from(&config.checkpoint_source_id);
    checkpoint.created_at.clone_from(&config.checkpoint_at);
    checkpoint.updated_at.clone_from(&config.checkpoint_at);
    checkpoint.content.clone_from(&config.checkpoint_content);
    checkpoint.last_state = Some(config.checkpoint_last_state.clone());
    checkpoint.covered_turns = Some(TurnRange {
        first_turn_id: config.user_turn_id.clone(),
        last_turn_id: config.assistant_turn_id.clone(),
    });
    checkpoint.supersedes = None;
    checkpoint.status = MemoryStatus::Active;
    ledger
        .commit_explicit(checkpoint, ExplicitSave::Inspector)
        .unwrap();
    let mut sessions = completed.sessions.clone();
    sessions
        .iter_mut()
        .find(|s| s.session_id == config.session_id)
        .unwrap()
        .append_checkpoint(
            config.checkpoint_memory_id.clone(),
            &config.checkpoint_at,
            &ledger.snapshot(),
        )
        .unwrap();
    let checkpointed = Bundle {
        memory: ledger.snapshot(),
        sessions,
    };
    graph(&checkpointed);
    assert!(
        checkpointed.sessions[0]
            .events
            .starts_with(&completed.sessions[0].events)
    );
    let reloaded: Bundle =
        serde_json::from_slice(&serde_json::to_vec(&checkpointed).unwrap()).unwrap();
    graph(&reloaded);
    assert_eq!(
        reloaded, checkpointed,
        "typed reload preserves complete pure model"
    );
    // Six selected refusal boundaries; no extra accepted answer is fabricated.
    assert_eq!(
        MockProvider.respond(&prepared, &Cancel(true)).unwrap_err(),
        ProviderError::Cancelled
    );
    let mut forged = reply.clone();
    forged.consumed_capsule_sha256 = "0".repeat(64);
    assert!(
        forged
            .validate_against(&prepared, &MockProvider.capabilities())
            .is_err()
    );
    let mut forged = reply.clone();
    forged.project_states[0].content = "Forged project".into();
    assert!(
        forged
            .validate_against(&prepared, &MockProvider.capabilities())
            .is_err()
    );
    let mut forged = reply;
    forged.request_id.push('f');
    assert!(
        forged
            .validate_against(&prepared, &MockProvider.capabilities())
            .is_err()
    );
    let mut forged = request.clone();
    forged.capsule.active_projects[0].content = "Hidden replacement".into();
    forged.capsule = forged.capsule.seal_budget().unwrap();
    assert!(forged.prepare(&input.memory, &input.sessions).is_err());
    let mut forged = request;
    forged.capsule.recent_turns[0].content = "Changed accepted input".into();
    forged.capsule = forged.capsule.seal_budget().unwrap();
    assert!(forged.prepare(&input.memory, &input.sessions).is_err());
    Output {
        input,
        capsule_bytes: String::from_utf8(capsule_bytes).unwrap(),
        request_bytes,
        response_bytes,
        completed,
        checkpointed,
        exclusions: compiled.exclusions,
    }
}

fn main() {
    let args: Vec<_> = std::env::args().collect();
    let corpus: Corpus = serde_json::from_slice(&std::fs::read(&args[1]).unwrap()).unwrap();
    assert_eq!(corpus.schema_version, 1);
    assert_eq!(corpus.evidence, "synthetic_pure_mock_continuity_only");
    let history: serde_json::Value =
        serde_json::from_slice(&std::fs::read(&args[2]).unwrap()).unwrap();
    let before: Bundle = serde_json::from_value(
        history["steps"].as_array().unwrap().last().unwrap()["expected"].clone(),
    )
    .unwrap();
    let output = perform(&before, &corpus.config);
    if let Some(path) = args.get(3) {
        std::fs::write(path, serde_json::to_vec(&output).unwrap()).unwrap();
        println!("EMIT DESIGN pure Mock corpus data; frozen expected comparison not claimed");
    } else {
        assert_eq!(
            output,
            corpus.expected.expect("frozen expected corpus required")
        );
        println!(
            "PASS DESIGN pure Mock continuity: exact accepted input/capsule/request/response; one assistant; explicit checkpoint; typed reload; 2 exclusions; 6 refusal boundaries"
        );
    }
    println!(
        "NOT VERIFIED: retrieval/index, invocation/receipts, Vault commit/lock/restart, IPC/human authorization or production"
    );
}
