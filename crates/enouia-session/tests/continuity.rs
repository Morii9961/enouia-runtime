use enouia_memory::{MemorySnapshot, MemoryStatus, ValidationError};
use enouia_session::*;
use serde::Deserialize;

#[derive(Deserialize)]
struct Bundle {
    schema_version: u32,
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
fn unchanged_on_error(
    mut session: SessionRecord,
    operation: impl FnOnce(&mut SessionRecord) -> Result<(), ValidationError>,
) {
    let before = session.clone();
    assert!(operation(&mut session).is_err());
    assert_eq!(session, before);
}

#[test]
fn two_checkpoints_preserve_four_original_turns_and_semantic_restart() {
    let f = fixture();
    assert_eq!(f.schema_version, 1);
    validate_sessions(&f.sessions, &f.memory).unwrap();
    let s = &f.sessions[0];
    assert_eq!(s.turns().count(), 4);
    assert_eq!(s.checkpoints().count(), 2);
    let restarted: SessionRecord =
        serde_json::from_str(&serde_json::to_string(s).unwrap()).unwrap();
    assert_eq!(&restarted, s);
    restarted.validate_with_memory(&f.memory).unwrap();
}

#[test]
fn replay_append_uses_same_order_and_retains_raw_content() {
    let f = fixture();
    let old = &f.sessions[0];
    let mut s = SessionRecord::new(
        old.session_id.clone(),
        old.title.clone(),
        old.created_at.clone(),
    )
    .unwrap();
    for event in &old.events {
        match &event.event {
            EventContent::Turn {
                turn_id,
                role,
                content,
                source_id,
            } => s
                .append_turn(
                    TurnInput {
                        turn_id: turn_id.clone(),
                        role: *role,
                        content: content.clone(),
                        source_id: source_id.clone(),
                    },
                    &event.created_at,
                    &f.memory,
                )
                .unwrap(),
            EventContent::Checkpoint { memory_id } => s
                .append_checkpoint(memory_id.clone(), &event.created_at, &f.memory)
                .unwrap(),
        }
    }
    assert_eq!(&s, old);
}

#[test]
fn missing_future_and_reversed_turn_ranges_fail() {
    for first in [id("turn_", 99), id("turn_", 4), id("turn_", 2)] {
        let mut f = fixture();
        f.memory.memories[4]
            .covered_turns
            .as_mut()
            .unwrap()
            .first_turn_id = first;
        f.memory.memories[4]
            .covered_turns
            .as_mut()
            .unwrap()
            .last_turn_id = id("turn_", 1);
        assert!(validate_sessions(&f.sessions, &f.memory).is_err());
    }
}

#[test]
fn wrong_session_kind_or_unapproved_checkpoint_fails() {
    let mut f = fixture();
    f.memory.memories[4].session_id = Some(id("ses_", 99));
    assert!(validate_sessions(&f.sessions, &f.memory).is_err());
    let mut f = fixture();
    f.sessions[0].events[2].event = EventContent::Checkpoint {
        memory_id: id("mem_", 1),
    };
    assert!(validate_sessions(&f.sessions, &f.memory).is_err());
    let f = fixture();
    unchanged_on_error(f.sessions[0].clone(), |s| {
        s.append_checkpoint(id("mem_", 99), "2026-10-01T09:00:06.000Z", &f.memory)
    });
}

#[test]
fn sequence_gaps_duplicate_turns_and_checkpoint_ids_fail() {
    let mut f = fixture();
    f.sessions[0].events[1].sequence = 3;
    assert!(validate_sessions(&f.sessions, &f.memory).is_err());
    let mut f = fixture();
    if let EventContent::Turn { turn_id, .. } = &mut f.sessions[0].events[1].event {
        *turn_id = id("turn_", 1);
    }
    assert!(validate_sessions(&f.sessions, &f.memory).is_err());
    let mut f = fixture();
    f.sessions[0].events[5].event = f.sessions[0].events[2].event.clone();
    assert!(validate_sessions(&f.sessions, &f.memory).is_err());
}

#[test]
fn clocks_header_tail_and_checkpoint_creation_are_checked() {
    let mut f = fixture();
    f.sessions[0].updated_at = f.sessions[0].created_at.clone();
    assert!(validate_sessions(&f.sessions, &f.memory).is_err());
    let mut f = fixture();
    f.sessions[0].events[1].created_at = "2026-09-30T09:00:00.000Z".into();
    assert!(validate_sessions(&f.sessions, &f.memory).is_err());
    let mut f = fixture();
    f.memory.memories[4].created_at = "2026-10-01T09:00:03.000Z".into();
    f.memory.memories[4].updated_at = "2026-10-01T09:00:03.000Z".into();
    assert!(validate_sessions(&f.sessions, &f.memory).is_err());
    let f = fixture();
    unchanged_on_error(f.sessions[0].clone(), |s| {
        s.append_checkpoint(id("mem_", 5), "2026-10-01T09:00:04.000Z", &f.memory)
    });
}

#[test]
fn turn_provenance_binds_exact_session_turn_and_time() {
    for which in 0..3 {
        let mut f = fixture();
        let source = &mut f.memory.sources[1];
        match which {
            0 => source.session_id = Some(id("ses_", 99)),
            1 => source.turn_id = Some(id("turn_", 99)),
            _ => source.created_at = "2026-10-01T08:59:59.000Z".into(),
        }
        assert!(validate_sessions(&f.sessions, &f.memory).is_err());
    }
}

#[test]
fn complete_bundle_rejects_orphan_sources_checkpoints_and_duplicate_sessions() {
    let mut f = fixture();
    f.sessions.push(f.sessions[0].clone());
    assert!(validate_sessions(&f.sessions, &f.memory).is_err());
    let mut f = fixture();
    f.sessions[0].events.pop();
    f.sessions[0].updated_at = "2026-10-01T09:00:04.000Z".into();
    assert_eq!(
        validate_sessions(&f.sessions, &f.memory).unwrap_err().code,
        "missing_checkpoint_event"
    );
    let mut f = fixture();
    let mut source = f.memory.sources[1].clone();
    source.source_id = id("src_", 99);
    source.turn_id = Some(id("turn_", 99));
    f.memory.sources.push(source);
    assert!(validate_sessions(&f.sessions, &f.memory).is_err());
}

#[test]
fn append_failure_is_atomic_and_history_may_reference_archived_checkpoint() {
    let f = fixture();
    unchanged_on_error(f.sessions[0].clone(), |s| {
        s.append_turn(
            TurnInput {
                turn_id: id("turn_", 1),
                role: TurnRole::User,
                content: "duplicate".into(),
                source_id: id("src_", 2),
            },
            "2026-10-01T09:00:06.000Z",
            &f.memory,
        )
    });
    let mut f = fixture();
    f.memory.memories[4].status = MemoryStatus::Archived;
    validate_sessions(&f.sessions, &f.memory).unwrap();
    unchanged_on_error(f.sessions[0].clone(), |s| {
        s.append_checkpoint(id("mem_", 5), "2026-10-01T09:00:06.000Z", &f.memory)
    });
}

#[test]
fn unknown_event_fields_roles_and_schema_versions_fail() {
    let f = fixture();
    let mut json = serde_json::to_value(&f.sessions[0]).unwrap();
    json["events"][0]["event"]["role"] = "system".into();
    assert!(serde_json::from_value::<SessionRecord>(json).is_err());
    let mut json = serde_json::to_value(&f.sessions[0]).unwrap();
    json["events"][2]["event"]["hidden_context"] = "extra".into();
    assert!(serde_json::from_value::<SessionRecord>(json).is_err());
    let mut s = f.sessions[0].clone();
    s.schema_version = 2;
    assert!(s.validate_with_memory(&f.memory).is_err());
    assert!(
        SessionRecord::new(
            "../session.json".into(),
            "x".into(),
            f.sessions[0].created_at.clone()
        )
        .is_err()
    );
}
