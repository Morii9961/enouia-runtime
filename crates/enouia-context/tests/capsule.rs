use enouia_context::*;
use enouia_memory::{MemorySnapshot, MemoryStatus};
use enouia_session::SessionRecord;
use serde::Deserialize;

#[derive(Deserialize)]
struct Bundle {
    memory: MemorySnapshot,
    sessions: Vec<SessionRecord>,
}
fn fixture() -> Bundle {
    serde_json::from_str(include_str!(
        "../../../tests/fixtures/session/continuity-v1.json"
    ))
    .unwrap()
}
fn id(prefix: &str, n: u32) -> String {
    format!("{prefix}{n:032x}")
}
fn base(max_tokens: u64) -> ContextCapsule {
    ContextCapsule {
        schema_version: 1,
        capsule_id: id("cap_", 1),
        generated_at: "2026-10-01T09:00:06.000Z".into(),
        query: "合成项目下一步是什么？".into(),
        identity: vec![IdentityEntry {
            name: "core.md".into(),
            content: "Synthetic identity only".into(),
        }],
        user_context: vec![],
        relationship_context: vec![],
        active_projects: vec![],
        relevant_memories: vec![],
        recent_session_checkpoints: vec![],
        recent_turns: vec![],
        open_loops: vec![],
        provenance: vec![ContextProvenance {
            entry_id: "identity:core.md".into(),
            source_id: None,
            reason: InclusionReason::Identity,
        }],
        budget: CapsuleBudget {
            max_tokens,
            estimated_tokens: 0,
            reserve_tokens: 256,
            policy: TokenPolicy::Utf8BytesV1,
        },
    }
}
fn ranked(n: u32, rank: u32, section: InclusionReason) -> RankedMemory {
    RankedMemory {
        memory_id: id("mem_", n),
        rank,
        section,
    }
}

#[test]
fn actual_provider_bytes_include_exact_provenance_and_budget_covers_utf8() {
    let f = fixture();
    let compiled = compile_ranked(
        base(20_000),
        vec![
            ranked(4, 0, InclusionReason::ActiveProject),
            ranked(5, 1, InclusionReason::RecentCheckpoint),
        ],
        &f.memory,
        &f.sessions,
    )
    .unwrap();
    let c = compiled.capsule;
    let bytes = c.provider_bytes(&f.memory, &f.sessions).unwrap();
    assert_eq!(c.budget.estimated_tokens, bytes.len() as u64 + 256);
    assert_eq!(serde_json::from_slice::<ContextCapsule>(&bytes).unwrap(), c);
    assert_eq!(c.active_projects[0], f.memory.memories[3]);
    assert_eq!(c.recent_session_checkpoints[0], f.memory.memories[4]);
    assert_eq!(c.provenance.len(), 3);
    assert!(!c.open_loops.is_empty());
}

#[test]
fn equal_rank_ties_are_memory_id_sorted_independent_of_retrieval_order() {
    let f = fixture();
    let a = ranked(2, 1, InclusionReason::UserContext);
    let b = ranked(1, 1, InclusionReason::UserContext);
    let first = compile_ranked(
        base(20_000),
        vec![a.clone(), b.clone()],
        &f.memory,
        &f.sessions,
    )
    .unwrap();
    let second = compile_ranked(base(20_000), vec![b, a], &f.memory, &f.sessions).unwrap();
    assert_eq!(first, second);
    assert_eq!(first.capsule.user_context[0].memory_id, id("mem_", 1));
    assert!(
        compile_ranked(
            base(20_000),
            vec![
                ranked(1, 1, InclusionReason::UserContext),
                ranked(1, 1, InclusionReason::RelevantMemory)
            ],
            &f.memory,
            &f.sessions
        )
        .is_err()
    );
}

#[test]
fn overflow_excludes_whole_record_and_preserves_required_base_fields() {
    let f = fixture();
    let mut seed = base(20_000);
    let required = seed.estimate_tokens().unwrap();
    seed.budget.max_tokens = required + 100;
    let c = compile_ranked(
        seed,
        vec![ranked(4, 0, InclusionReason::ActiveProject)],
        &f.memory,
        &f.sessions,
    )
    .unwrap();
    assert!(c.capsule.active_projects.is_empty());
    assert_eq!(c.exclusions[0].reason, ExclusionReason::BudgetExceeded);
    assert_eq!(c.capsule.query, base(1).query);
    assert_eq!(c.capsule.identity, base(1).identity);
    assert!(base(256).seal_budget().is_err());
}

#[test]
fn unapproved_missing_inactive_and_duplicate_records_do_not_enter_context() {
    let mut f = fixture();
    f.memory.memories[0].status = MemoryStatus::Archived;
    let c = compile_ranked(
        base(20_000),
        vec![
            ranked(1, 0, InclusionReason::UserContext),
            ranked(2, 1, InclusionReason::UserContext),
            ranked(2, 2, InclusionReason::UserContext),
        ],
        &f.memory,
        &f.sessions,
    )
    .unwrap();
    assert_eq!(
        c.exclusions.iter().map(|e| e.reason).collect::<Vec<_>>(),
        vec![ExclusionReason::Inactive, ExclusionReason::Duplicate]
    );
    assert_eq!(c.capsule.user_context.len(), 1);
    assert!(
        compile_ranked(
            base(20_000),
            vec![ranked(99, 0, InclusionReason::RelevantMemory)],
            &f.memory,
            &f.sessions
        )
        .is_err()
    );
}

#[test]
fn changed_memory_turn_or_hidden_open_loop_fails_canonical_validation() {
    let f = fixture();
    let mut c = compile_ranked(
        base(20_000),
        vec![ranked(1, 0, InclusionReason::UserContext)],
        &f.memory,
        &f.sessions,
    )
    .unwrap()
    .capsule;
    c.user_context[0].content = "Forged memory".into();
    let c = c.seal_budget().unwrap();
    assert!(c.validate_with_snapshot(&f.memory, &f.sessions).is_err());
    let mut c = base(20_000);
    c.open_loops.push("unprovenanced instruction".into());
    assert!(c.seal_budget().is_err());
    let mut c = base(20_000);
    c.recent_turns.push(ContextTurn {
        turn_id: id("turn_", 1),
        session_id: id("ses_", 1),
        role: enouia_session::TurnRole::User,
        content: "Forged turn".into(),
        source_id: id("src_", 2),
        created_at: "2026-10-01T09:00:00.000Z".into(),
    });
    c.provenance.push(ContextProvenance {
        entry_id: id("turn_", 1),
        source_id: Some(id("src_", 2)),
        reason: InclusionReason::RecentTurn,
    });
    let c = c.seal_budget().unwrap();
    assert!(c.validate_with_snapshot(&f.memory, &f.sessions).is_err());
}

#[test]
fn omitted_provenance_forged_budget_wrong_section_and_activity_field_fail() {
    let f = fixture();
    let mut c = base(20_000);
    c.provenance.clear();
    assert!(c.seal_budget().is_err());
    let mut c = base(20_000).seal_budget().unwrap();
    c.budget.estimated_tokens -= 1;
    assert!(c.validate_shape().is_err());
    assert!(
        compile_ranked(
            base(20_000),
            vec![ranked(1, 0, InclusionReason::ActiveProject)],
            &f.memory,
            &f.sessions
        )
        .is_err()
    );
    let mut json = serde_json::to_value(base(20_000).seal_budget().unwrap()).unwrap();
    json["activity"] = serde_json::json!({"tokens":99});
    assert!(serde_json::from_value::<ContextCapsule>(json).is_err());
}
