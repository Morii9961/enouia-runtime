//! Inspectable provider-neutral capsule contract and conservative local budget policy.
//! Retrieval, provider calls, Identity/Vault reads and persistence are outside this crate.
use enouia_memory::{
    MemoryKind, MemoryRecord, MemorySnapshot, MemoryStatus, ValidationError, valid_id,
    valid_timestamp,
};
use enouia_session::{EventContent, SessionRecord, TurnRole, validate_sessions};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

const RESERVE: u64 = 256;
const MAX_SAFE: u64 = 9_007_199_254_740_991;

fn require(ok: bool, code: &'static str, field: &'static str) -> Result<(), ValidationError> {
    if ok {
        Ok(())
    } else {
        Err(ValidationError { code, field })
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TokenPolicy {
    Utf8BytesV1,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CapsuleBudget {
    pub max_tokens: u64,
    pub estimated_tokens: u64,
    pub reserve_tokens: u64,
    pub policy: TokenPolicy,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct IdentityEntry {
    pub name: String,
    pub content: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ContextTurn {
    pub turn_id: String,
    pub session_id: String,
    pub role: TurnRole,
    pub content: String,
    pub source_id: String,
    pub created_at: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InclusionReason {
    Identity,
    UserContext,
    RelationshipContext,
    ActiveProject,
    RelevantMemory,
    RecentCheckpoint,
    RecentTurn,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ContextProvenance {
    pub entry_id: String,
    pub source_id: Option<String>,
    pub reason: InclusionReason,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ContextCapsule {
    pub schema_version: u32,
    pub capsule_id: String,
    pub generated_at: String,
    pub query: String,
    pub identity: Vec<IdentityEntry>,
    pub user_context: Vec<MemoryRecord>,
    pub relationship_context: Vec<MemoryRecord>,
    pub active_projects: Vec<MemoryRecord>,
    pub relevant_memories: Vec<MemoryRecord>,
    pub recent_session_checkpoints: Vec<MemoryRecord>,
    pub recent_turns: Vec<ContextTurn>,
    pub open_loops: Vec<String>,
    pub provenance: Vec<ContextProvenance>,
    pub budget: CapsuleBudget,
}

impl ContextCapsule {
    fn sections(&self) -> [(InclusionReason, &[MemoryRecord]); 5] {
        [
            (InclusionReason::UserContext, &self.user_context),
            (
                InclusionReason::RelationshipContext,
                &self.relationship_context,
            ),
            (InclusionReason::ActiveProject, &self.active_projects),
            (InclusionReason::RelevantMemory, &self.relevant_memories),
            (
                InclusionReason::RecentCheckpoint,
                &self.recent_session_checkpoints,
            ),
        ]
    }

    /// Counts compact serialized UTF-8 bytes plus a fixed reserve; no provider-token claim.
    pub fn estimate_tokens(&self) -> Result<u64, ValidationError> {
        let mut draft = self.clone();
        draft.budget.estimated_tokens = 0;
        for _ in 0..32 {
            let bytes = serde_json::to_vec(&draft).map_err(|_| ValidationError {
                code: "serialization_failed",
                field: "capsule",
            })?;
            let estimate = u64::try_from(bytes.len())
                .ok()
                .and_then(|n| n.checked_add(RESERVE))
                .filter(|n| *n <= MAX_SAFE)
                .ok_or(ValidationError {
                    code: "budget_overflow",
                    field: "estimated_tokens",
                })?;
            if estimate == draft.budget.estimated_tokens {
                return Ok(estimate);
            }
            draft.budget.estimated_tokens = estimate;
        }
        Err(ValidationError {
            code: "budget_unstable",
            field: "estimated_tokens",
        })
    }

    /// Returns a complete capsule or explicit refusal. Never truncates content or Identity.
    pub fn seal_budget(mut self) -> Result<Self, ValidationError> {
        self.budget.estimated_tokens = self.estimate_tokens()?;
        self.validate_shape()?;
        Ok(self)
    }

    pub fn validate_shape(&self) -> Result<(), ValidationError> {
        require(
            self.schema_version == 1,
            "unsupported_schema",
            "schema_version",
        )?;
        require(
            valid_id(&self.capsule_id, "cap_"),
            "invalid_id",
            "capsule_id",
        )?;
        require(
            valid_timestamp(&self.generated_at),
            "invalid_timestamp",
            "generated_at",
        )?;
        require(!self.query.trim().is_empty(), "empty_text", "query")?;
        require(
            self.budget.reserve_tokens == RESERVE
                && self.budget.max_tokens <= MAX_SAFE
                && self.budget.max_tokens >= RESERVE,
            "invalid_budget",
            "budget",
        )?;
        require(
            self.budget.estimated_tokens == self.estimate_tokens()?,
            "invalid_estimate",
            "estimated_tokens",
        )?;
        require(
            self.budget.estimated_tokens <= self.budget.max_tokens,
            "budget_exceeded",
            "max_tokens",
        )?;
        let mut expected = BTreeMap::new();
        for identity in &self.identity {
            require(
                matches!(identity.name.as_str(), "core.md" | "runtime_rules.md")
                    && !identity.content.trim().is_empty(),
                "invalid_identity",
                "identity",
            )?;
            require(
                expected
                    .insert(
                        format!("identity:{}", identity.name),
                        (None, InclusionReason::Identity),
                    )
                    .is_none(),
                "duplicate_id",
                "identity.name",
            )?;
        }
        for (reason, records) in self.sections() {
            for record in records {
                record.validate()?;
                require(
                    record.status == MemoryStatus::Active && record.updated_at <= self.generated_at,
                    "inactive_or_future_memory",
                    "memory",
                )?;
                let kind_ok = match reason {
                    InclusionReason::ActiveProject => record.kind == MemoryKind::ProjectState,
                    InclusionReason::RecentCheckpoint => {
                        record.kind == MemoryKind::SessionCheckpoint
                    }
                    InclusionReason::UserContext => {
                        matches!(record.kind, MemoryKind::Fact | MemoryKind::Preference)
                    }
                    _ => matches!(
                        record.kind,
                        MemoryKind::Fact | MemoryKind::Preference | MemoryKind::Episode
                    ),
                };
                require(kind_ok, "wrong_context_section", "memory.type")?;
                require(
                    expected
                        .insert(
                            record.memory_id.clone(),
                            (Some(record.source_id.clone()), reason),
                        )
                        .is_none(),
                    "duplicate_id",
                    "memory_id",
                )?;
            }
        }
        for turn in &self.recent_turns {
            require(
                valid_id(&turn.turn_id, "turn_")
                    && valid_id(&turn.session_id, "ses_")
                    && valid_id(&turn.source_id, "src_"),
                "invalid_id",
                "turn",
            )?;
            require(
                valid_timestamp(&turn.created_at)
                    && turn.created_at <= self.generated_at
                    && !turn.content.trim().is_empty(),
                "invalid_turn",
                "turn",
            )?;
            require(
                expected
                    .insert(
                        turn.turn_id.clone(),
                        (Some(turn.source_id.clone()), InclusionReason::RecentTurn),
                    )
                    .is_none(),
                "duplicate_id",
                "turn_id",
            )?;
        }
        let mut actual = BTreeMap::new();
        for item in &self.provenance {
            require(
                actual
                    .insert(item.entry_id.clone(), (item.source_id.clone(), item.reason))
                    .is_none(),
                "duplicate_id",
                "provenance.entry_id",
            )?;
        }
        require(actual == expected, "invalid_provenance", "provenance")?;
        let mut seen = BTreeSet::new();
        let loops: Vec<_> = self
            .active_projects
            .iter()
            .chain(&self.recent_session_checkpoints)
            .flat_map(|r| r.open_loops.iter())
            .filter(|text| seen.insert((*text).clone()))
            .cloned()
            .collect();
        require(self.open_loops == loops, "invalid_open_loops", "open_loops")
    }

    /// Verifies the actual selected bytes against a complete validated canonical bundle.
    pub fn validate_with_snapshot(
        &self,
        memory: &MemorySnapshot,
        sessions: &[SessionRecord],
    ) -> Result<(), ValidationError> {
        self.validate_shape()?;
        validate_sessions(sessions, memory)?;
        let records: BTreeMap<_, _> = memory
            .memories
            .iter()
            .map(|r| (r.memory_id.as_str(), r))
            .collect();
        for (_, section) in self.sections() {
            for record in section {
                require(
                    records
                        .get(record.memory_id.as_str())
                        .is_some_and(|stored| *stored == record),
                    "changed_memory",
                    "memory_id",
                )?;
            }
        }
        for turn in &self.recent_turns {
            let matched = sessions.iter().filter(|s| s.session_id == turn.session_id).flat_map(|s| &s.events).any(|event| {
                event.created_at == turn.created_at && matches!(&event.event, EventContent::Turn { turn_id, role, content, source_id } if turn_id == &turn.turn_id && role == &turn.role && content == &turn.content && source_id == &turn.source_id)
            });
            require(matched, "changed_turn", "turn_id")?;
        }
        Ok(())
    }

    pub fn provider_bytes(
        &self,
        memory: &MemorySnapshot,
        sessions: &[SessionRecord],
    ) -> Result<Vec<u8>, ValidationError> {
        self.validate_with_snapshot(memory, sessions)?;
        serde_json::to_vec(self).map_err(|_| ValidationError {
            code: "serialization_failed",
            field: "capsule",
        })
    }
}

/// A retrieval port supplies rank; equal ranks use memory ID for deterministic ties.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RankedMemory {
    pub memory_id: String,
    pub rank: u32,
    pub section: InclusionReason,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExclusionReason {
    Inactive,
    Duplicate,
    BudgetExceeded,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ContextExclusion {
    pub entry_id: String,
    pub reason: ExclusionReason,
}

#[derive(Clone, Debug, PartialEq)]
pub struct CapsuleCompilation {
    pub capsule: ContextCapsule,
    pub exclusions: Vec<ContextExclusion>,
}

/// Admit whole canonical records in deterministic rank order. Mandatory base fields must fit.
pub fn compile_ranked(
    base: ContextCapsule,
    mut ranked: Vec<RankedMemory>,
    memory: &MemorySnapshot,
    sessions: &[SessionRecord],
) -> Result<CapsuleCompilation, ValidationError> {
    require(
        base.sections()
            .iter()
            .all(|(_, records)| records.is_empty()),
        "nonempty_base",
        "memory_sections",
    )?;
    let mut capsule = base.seal_budget()?;
    capsule.validate_with_snapshot(memory, sessions)?;
    ranked.sort_by(|a, b| {
        a.rank
            .cmp(&b.rank)
            .then_with(|| a.memory_id.cmp(&b.memory_id))
    });
    let mut classifications = BTreeMap::new();
    for item in &ranked {
        if let Some(previous) = classifications.insert(&item.memory_id, item.section) {
            require(
                previous == item.section,
                "ambiguous_context_section",
                "ranked.section",
            )?;
        }
    }
    let records: BTreeMap<_, _> = memory
        .memories
        .iter()
        .map(|r| (r.memory_id.as_str(), r))
        .collect();
    let mut seen = BTreeSet::new();
    let mut exclusions = Vec::new();
    for item in ranked {
        require(
            !matches!(
                item.section,
                InclusionReason::Identity | InclusionReason::RecentTurn
            ),
            "wrong_context_section",
            "ranked.section",
        )?;
        let record = records
            .get(item.memory_id.as_str())
            .ok_or(ValidationError {
                code: "missing_memory",
                field: "ranked.memory_id",
            })?;
        let reason = if !seen.insert(item.memory_id.clone()) {
            Some(ExclusionReason::Duplicate)
        } else if record.status != MemoryStatus::Active {
            Some(ExclusionReason::Inactive)
        } else {
            None
        };
        if let Some(reason) = reason {
            exclusions.push(ContextExclusion {
                entry_id: item.memory_id,
                reason,
            });
            continue;
        }
        let mut next = capsule.clone();
        let section = match item.section {
            InclusionReason::UserContext => &mut next.user_context,
            InclusionReason::RelationshipContext => &mut next.relationship_context,
            InclusionReason::ActiveProject => &mut next.active_projects,
            InclusionReason::RelevantMemory => &mut next.relevant_memories,
            InclusionReason::RecentCheckpoint => &mut next.recent_session_checkpoints,
            _ => unreachable!("checked section"),
        };
        section.push((*record).clone());
        next.provenance.push(ContextProvenance {
            entry_id: record.memory_id.clone(),
            source_id: Some(record.source_id.clone()),
            reason: item.section,
        });
        let mut loops = BTreeSet::new();
        next.open_loops = next
            .active_projects
            .iter()
            .chain(&next.recent_session_checkpoints)
            .flat_map(|r| r.open_loops.iter())
            .filter(|s| loops.insert((*s).clone()))
            .cloned()
            .collect();
        match next.seal_budget() {
            Ok(next) => {
                next.validate_with_snapshot(memory, sessions)?;
                capsule = next;
            }
            Err(error) if error.code == "budget_exceeded" => exclusions.push(ContextExclusion {
                entry_id: item.memory_id,
                reason: ExclusionReason::BudgetExceeded,
            }),
            Err(error) => return Err(error),
        }
    }
    Ok(CapsuleCompilation {
        capsule,
        exclusions,
    })
}
