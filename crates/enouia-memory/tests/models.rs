use enouia_memory::*;

const AT: &str = "2026-10-01T09:00:00.000Z";
const LATER: &str = "2026-10-01T09:01:00.000Z";
const LAST: &str = "2026-10-01T09:02:00.000Z";
fn id(prefix: &str, value: u32) -> String {
    format!("{prefix}{value:032x}")
}
fn fixture() -> MemorySnapshot {
    serde_json::from_str(include_str!(
        "../../../tests/fixtures/memory/models-v1.json"
    ))
    .unwrap()
}
fn ledger() -> MemoryLedger {
    MemoryLedger::from_snapshot(fixture()).unwrap()
}
fn record(n: u32) -> MemoryRecord {
    let mut r = fixture().memories.remove(0);
    r.memory_id = id("mem_", n);
    r
}
fn pending(n: u32) -> CandidateRecord {
    let mut c = fixture().candidates.remove(0);
    c.candidate_id = id("cand_", n);
    c.proposal.memory_id = id("mem_", n + 10);
    c
}
fn unchanged_on_error(
    mut ledger: MemoryLedger,
    change: impl FnOnce(&mut MemoryLedger) -> Result<(), ValidationError>,
) {
    let before = ledger.snapshot();
    assert!(change(&mut ledger).is_err());
    assert_eq!(before, ledger.snapshot());
}

#[test]
fn all_five_kinds_and_four_source_origins_round_trip() {
    let snapshot = fixture();
    assert_eq!(snapshot.memories.len(), 5);
    assert_eq!(snapshot.sources.len(), 4);
    let restored: MemorySnapshot =
        serde_json::from_str(&serde_json::to_string(&snapshot).unwrap()).unwrap();
    assert_eq!(snapshot, restored);
    assert_eq!(
        MemoryLedger::from_snapshot(restored)
            .unwrap()
            .active_memories()
            .count(),
        5
    );
}

#[test]
fn canonical_timestamps_check_calendar_precision_zone_and_clock_order() {
    for good in [AT, "2000-02-29T23:59:59.999Z", "0001-01-01T00:00:00.000Z"] {
        assert!(valid_timestamp(good));
    }
    for bad in [
        "1900-02-29T00:00:00.000Z",
        "2026-02-29T00:00:00.000Z",
        "0000-01-01T00:00:00.000Z",
        "2026-04-31T00:00:00.000Z",
        "2026-10-01T24:00:00.000Z",
        "2026-10-01T09:00:60.000Z",
        "2026-10-01T09:00:00Z",
        "2026-10-01T17:00:00.000+08:00",
        "２０２６-10-01T09:00:00.000Z",
    ] {
        assert!(!valid_timestamp(bad), "{bad}");
    }
    let mut r = record(7);
    r.updated_at = "2026-09-30T09:00:00.000Z".into();
    assert!(r.validate().is_err());
}

#[test]
fn invalid_ids_versions_statuses_and_unknown_fields_are_rejected() {
    for bad in [
        "../memory.json",
        "mem_1",
        "src_00000000000000000000000000000001",
        "mem_0000000000000000000000000000000A",
    ] {
        let mut r = record(7);
        r.memory_id = bad.into();
        assert!(r.validate().is_err());
    }
    let mut json = serde_json::to_value(record(7)).unwrap();
    json["status"] = "pending".into();
    assert!(serde_json::from_value::<MemoryRecord>(json.clone()).is_err());
    json["status"] = "active".into();
    json["hidden_provider_context"] = "private".into();
    assert!(serde_json::from_value::<MemoryRecord>(json).is_err());
    let mut r = record(7);
    r.schema_version = 2;
    assert!(r.validate().is_err());
}

#[test]
fn kind_fields_intervals_confidence_and_tags_are_semantically_checked() {
    let mut r = record(7);
    r.state = Some("wrong kind".into());
    assert!(r.validate().is_err());
    let mut r = fixture().memories.remove(3);
    r.project_id = None;
    assert!(r.validate().is_err());
    let mut r = fixture().memories.remove(4);
    r.covered_turns = None;
    assert!(r.validate().is_err());
    for value in [f64::NAN, f64::INFINITY, -0.1, 1.1] {
        let mut r = record(7);
        r.confidence = Some(value);
        assert!(r.validate().is_err());
    }
    let mut r = record(7);
    r.tags.push("synthetic".into());
    assert!(r.validate().is_err());
    let mut r = record(7);
    r.validity = Some(ValidityInterval {
        starts_at: LATER.into(),
        ends_at: Some(AT.into()),
    });
    assert!(r.validate().is_err());
}

#[test]
fn provenance_must_resolve_and_import_requires_version_and_hash() {
    let mut s = fixture();
    s.memories[0].source_id = id("src_", 99);
    assert!(MemoryLedger::from_snapshot(s).is_err());
    let mut s = fixture();
    s.sources[0].created_at = LATER.into();
    assert!(MemoryLedger::from_snapshot(s).is_err());
    let mut s = fixture().sources.remove(3);
    s.importer_version = None;
    assert!(s.validate().is_err());
    let mut s = fixture().sources.remove(2);
    s.turn_id = None;
    assert!(s.validate().is_err());
}

#[test]
fn snapshot_duplicates_dangling_links_cycles_and_active_conflicts_fail() {
    let mut s = fixture();
    s.memories.push(s.memories[0].clone());
    assert!(MemoryLedger::from_snapshot(s).is_err());
    let mut s = fixture();
    s.sources.push(s.sources[0].clone());
    assert!(MemoryLedger::from_snapshot(s).is_err());
    let mut s = fixture();
    s.memories[0].supersedes = Some(id("mem_", 99));
    assert!(MemoryLedger::from_snapshot(s).is_err());
    let mut s = fixture();
    s.memories[0].supersedes = Some(id("mem_", 2));
    assert!(MemoryLedger::from_snapshot(s).is_err());
    let mut s = fixture();
    s.memories[0].status = MemoryStatus::Archived;
    s.memories[1].status = MemoryStatus::Archived;
    s.memories[0].supersedes = Some(id("mem_", 2));
    s.memories[1].supersedes = Some(id("mem_", 1));
    assert_eq!(
        MemoryLedger::from_snapshot(s).unwrap_err().code,
        "relation_cycle"
    );
}

#[test]
fn inferred_pending_and_rejected_proposals_never_enter_active_memory() {
    let mut l = ledger();
    assert_eq!(l.active_memories().count(), 5);
    l.reject(&id("cand_", 1), "not durable context", LATER)
        .unwrap();
    assert_eq!(l.active_memories().count(), 5);
    assert!(matches!(
        &l.snapshot().candidates[0].decision,
        CandidateDecision::Rejected { .. }
    ));
    assert_eq!(
        l.snapshot().candidates[0].proposal.content,
        fixture().candidates[0].proposal.content
    );
    let restored = MemoryLedger::from_snapshot(l.snapshot()).unwrap();
    assert_eq!(restored.active_memories().count(), 5);
}

#[test]
fn manual_actions_check_origin_and_cannot_bypass_candidate_review() {
    unchanged_on_error(ledger(), |l| {
        l.commit_explicit(record(8), ExplicitSave::Remember)
    });
    unchanged_on_error(ledger(), |l| {
        let r = fixture().candidates[0].proposal.clone();
        l.commit_explicit(r, ExplicitSave::Inspector)
    });
    let mut l = ledger();
    let mut r = record(8);
    r.source_id = id("src_", 2);
    l.commit_explicit(r, ExplicitSave::Remember).unwrap();
    assert_eq!(l.active_memories().count(), 6);
}

#[test]
fn reviewer_edit_is_committed_once_with_original_proposal_preserved() {
    let mut l = ledger();
    let original = fixture().candidates[0].proposal.clone();
    let mut edited = original.clone();
    edited.content = "Reviewed synthetic fact".into();
    edited.updated_at = LATER.into();
    l.approve(&id("cand_", 1), edited.clone(), LATER).unwrap();
    assert_eq!(l.active_memories().count(), 6);
    assert_eq!(l.snapshot().candidates[0].proposal, original);
    assert!(l.active_memories().any(|m| m == &edited));
    unchanged_on_error(l, |l| l.approve(&id("cand_", 1), edited, LATER));
}

#[test]
fn bad_review_edit_and_failed_supersession_are_atomic() {
    let mut edited = fixture().candidates[0].proposal.clone();
    edited.updated_at = LATER.into();
    edited.source_id = id("src_", 1);
    unchanged_on_error(ledger(), |l| l.approve(&id("cand_", 1), edited, LATER));
    let mut edited = fixture().candidates[0].proposal.clone();
    edited.updated_at = LATER.into();
    edited.supersedes = Some(id("mem_", 99));
    unchanged_on_error(ledger(), |l| l.approve(&id("cand_", 1), edited, LATER));
    unchanged_on_error(ledger(), |l| l.reject(&id("cand_", 1), "", LATER));
    unchanged_on_error(ledger(), |l| {
        l.reject(&id("cand_", 1), "reject", "2026-09-30T09:00:00.000Z")
    });
}

#[test]
fn candidate_snapshot_cannot_forge_approval_or_reuse_reserved_memory() {
    let mut s = fixture();
    s.candidates[0].decision = CandidateDecision::Approved {
        memory_id: id("mem_", 6),
    };
    assert!(MemoryLedger::from_snapshot(s).is_err());
    let mut s = fixture();
    s.memories.push(s.candidates[0].proposal.clone());
    assert!(MemoryLedger::from_snapshot(s).is_err());
    unchanged_on_error(ledger(), |l| {
        let mut c = pending(2);
        c.proposal.memory_id = id("mem_", 6);
        l.propose(c)
    });
    let mut l = ledger();
    l.propose(pending(2)).unwrap();
    assert_eq!(l.active_memories().count(), 5);
}

#[test]
fn supersession_and_undo_preserve_both_meanings_and_historical_link() {
    let mut l = ledger();
    let original = fixture().memories[0].clone();
    let mut replacement = record(8);
    replacement.content = "Corrected synthetic fact".into();
    replacement.supersedes = Some(original.memory_id.clone());
    replacement.updated_at = LATER.into();
    l.commit_explicit(replacement.clone(), ExplicitSave::Inspector)
        .unwrap();
    assert_eq!(l.active_memories().count(), 5);
    let old = l
        .snapshot()
        .memories
        .into_iter()
        .find(|m| m.memory_id == original.memory_id)
        .unwrap();
    assert_eq!(old.content, original.content);
    assert_eq!(old.source_id, original.source_id);
    assert_eq!(old.status, MemoryStatus::Superseded);
    l.undo_supersession(&replacement.memory_id, LAST).unwrap();
    let s = l.snapshot();
    let old = s
        .memories
        .iter()
        .find(|m| m.memory_id == original.memory_id)
        .unwrap();
    let new = s
        .memories
        .iter()
        .find(|m| m.memory_id == replacement.memory_id)
        .unwrap();
    assert_eq!(old.status, MemoryStatus::Active);
    assert_eq!(old.content, original.content);
    assert_eq!(new.status, MemoryStatus::Archived);
    assert_eq!(new.content, replacement.content);
    assert_eq!(new.supersedes, Some(original.memory_id));
    assert!(MemoryLedger::from_snapshot(s).is_ok());
}

#[test]
fn stale_supersession_undo_and_duplicate_source_never_change_state() {
    let mut l = ledger();
    let mut r = record(8);
    r.updated_at = LATER.into();
    r.supersedes = Some(id("mem_", 1));
    l.commit_explicit(r, ExplicitSave::Inspector).unwrap();
    unchanged_on_error(l.clone(), |l| l.undo_supersession(&id("mem_", 8), AT));
    unchanged_on_error(l.clone(), |l| {
        let mut r = record(9);
        r.supersedes = Some(id("mem_", 1));
        r.updated_at = LAST.into();
        l.commit_explicit(r, ExplicitSave::Inspector)
    });
    unchanged_on_error(l, |l| l.add_source(fixture().sources[0].clone()));
}

#[test]
fn id_allocation_is_opaque_namespaced_and_propagates_entropy_failure() {
    struct Entropy(bool);
    impl IdEntropy for Entropy {
        fn random_128(&mut self) -> Result<[u8; 16], ValidationError> {
            if self.0 {
                Ok([0xab; 16])
            } else {
                Err(ValidationError {
                    code: "entropy_failed",
                    field: "id",
                })
            }
        }
    }
    for (kind, prefix) in [
        (IdKind::Memory, "mem_"),
        (IdKind::Source, "src_"),
        (IdKind::Candidate, "cand_"),
        (IdKind::Session, "ses_"),
        (IdKind::Turn, "turn_"),
        (IdKind::Project, "prj_"),
    ] {
        assert_eq!(
            allocate_id(kind, &mut Entropy(true)).unwrap(),
            format!("{prefix}{}", "ab".repeat(16))
        );
        assert!(allocate_id(kind, &mut Entropy(false)).is_err());
    }
}
