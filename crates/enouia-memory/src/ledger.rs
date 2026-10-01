use crate::{
    MemoryRecord, MemoryStatus, SourceKind, SourceRecord, ValidationError, require, valid_id,
    valid_timestamp,
};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "snake_case", deny_unknown_fields)]
pub enum CandidateDecision {
    Pending {},
    Approved { memory_id: String },
    Rejected { reason: String },
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CandidateRecord {
    pub schema_version: u32,
    pub candidate_id: String,
    pub created_at: String,
    pub updated_at: String,
    pub proposal: MemoryRecord,
    pub decision: CandidateDecision,
}

impl CandidateRecord {
    pub fn validate(&self) -> Result<(), ValidationError> {
        require(
            self.schema_version == 1,
            "unsupported_schema",
            "schema_version",
        )?;
        require(
            valid_id(&self.candidate_id, "cand_"),
            "invalid_id",
            "candidate_id",
        )?;
        require(
            valid_timestamp(&self.created_at) && self.created_at == self.proposal.created_at,
            "invalid_timestamp",
            "created_at",
        )?;
        require(
            valid_timestamp(&self.updated_at)
                && self.updated_at >= self.created_at
                && self.updated_at >= self.proposal.updated_at,
            "invalid_timestamp",
            "updated_at",
        )?;
        self.proposal.validate()?;
        require(
            self.proposal.status == MemoryStatus::Active,
            "invalid_candidate",
            "proposal.status",
        )?;
        match &self.decision {
            CandidateDecision::Pending {} => require(
                self.updated_at == self.created_at && self.proposal.updated_at == self.created_at,
                "invalid_candidate",
                "updated_at",
            )?,
            CandidateDecision::Approved { memory_id } => require(
                memory_id == &self.proposal.memory_id,
                "invalid_candidate",
                "decision.memory_id",
            )?,
            CandidateDecision::Rejected { reason } => {
                require(!reason.trim().is_empty(), "empty_text", "decision.reason")?
            }
        }
        Ok(())
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MemorySnapshot {
    pub schema_version: u32,
    pub sources: Vec<SourceRecord>,
    pub memories: Vec<MemoryRecord>,
    pub candidates: Vec<CandidateRecord>,
}

impl Default for MemorySnapshot {
    fn default() -> Self {
        Self {
            schema_version: 1,
            sources: Vec::new(),
            memories: Vec::new(),
            candidates: Vec::new(),
        }
    }
}

/// Caller must originate this operation from an explicit user action.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ExplicitSave {
    Inspector,
    Remember,
}

#[derive(Clone, Debug, Default)]
pub struct MemoryLedger {
    sources: BTreeMap<String, SourceRecord>,
    memories: BTreeMap<String, MemoryRecord>,
    candidates: BTreeMap<String, CandidateRecord>,
}

impl MemoryLedger {
    pub fn from_snapshot(snapshot: MemorySnapshot) -> Result<Self, ValidationError> {
        require(
            snapshot.schema_version == 1,
            "unsupported_schema",
            "schema_version",
        )?;
        let mut result = Self::default();
        for source in snapshot.sources {
            source.validate()?;
            require(
                !result.sources.contains_key(&source.source_id),
                "duplicate_id",
                "source_id",
            )?;
            result.sources.insert(source.source_id.clone(), source);
        }
        for memory in snapshot.memories {
            memory.validate()?;
            require(
                !result.memories.contains_key(&memory.memory_id),
                "duplicate_id",
                "memory_id",
            )?;
            result.memories.insert(memory.memory_id.clone(), memory);
        }
        for candidate in snapshot.candidates {
            candidate.validate()?;
            require(
                !result.candidates.contains_key(&candidate.candidate_id),
                "duplicate_id",
                "candidate_id",
            )?;
            result
                .candidates
                .insert(candidate.candidate_id.clone(), candidate);
        }
        result.validate()?;
        Ok(result)
    }

    pub fn snapshot(&self) -> MemorySnapshot {
        MemorySnapshot {
            schema_version: 1,
            sources: self.sources.values().cloned().collect(),
            memories: self.memories.values().cloned().collect(),
            candidates: self.candidates.values().cloned().collect(),
        }
    }

    pub fn active_memories(&self) -> impl Iterator<Item = &MemoryRecord> {
        self.memories
            .values()
            .filter(|m| m.status == MemoryStatus::Active)
    }

    pub fn add_source(&mut self, source: SourceRecord) -> Result<(), ValidationError> {
        source.validate()?;
        require(
            !self.sources.contains_key(&source.source_id),
            "duplicate_id",
            "source_id",
        )?;
        self.sources.insert(source.source_id.clone(), source);
        Ok(())
    }

    fn provenance(&self, record: &MemoryRecord) -> Result<(), ValidationError> {
        let source = self.sources.get(&record.source_id).ok_or(ValidationError {
            code: "missing_source",
            field: "source_id",
        })?;
        require(
            source.created_at <= record.created_at,
            "invalid_timestamp",
            "source.created_at",
        )
    }

    fn validate(&self) -> Result<(), ValidationError> {
        for record in self.memories.values() {
            self.provenance(record)?;
            let mut seen = BTreeSet::new();
            let mut current = record;
            while let Some(prior) = &current.supersedes {
                require(
                    seen.insert(current.memory_id.as_str()),
                    "relation_cycle",
                    "supersedes",
                )?;
                let older = self.memories.get(prior).ok_or(ValidationError {
                    code: "missing_memory",
                    field: "supersedes",
                })?;
                require(
                    current.status != MemoryStatus::Active
                        || older.status == MemoryStatus::Superseded,
                    "active_supersession",
                    "supersedes",
                )?;
                current = older;
            }
        }
        let mut reserved = BTreeSet::new();
        for candidate in self.candidates.values() {
            self.provenance(&candidate.proposal)?;
            if let Some(prior) = &candidate.proposal.supersedes {
                require(
                    self.memories.contains_key(prior),
                    "missing_memory",
                    "proposal.supersedes",
                )?;
            }
            require(
                reserved.insert(&candidate.proposal.memory_id),
                "duplicate_id",
                "proposal.memory_id",
            )?;
            match &candidate.decision {
                CandidateDecision::Approved { memory_id } => {
                    let memory = self.memories.get(memory_id).ok_or(ValidationError {
                        code: "missing_memory",
                        field: "decision.memory_id",
                    })?;
                    require(
                        memory.source_id == candidate.proposal.source_id
                            && memory.created_at == candidate.proposal.created_at
                            && memory.kind == candidate.proposal.kind,
                        "changed_provenance",
                        "decision.memory_id",
                    )?;
                }
                _ => require(
                    !self.memories.contains_key(&candidate.proposal.memory_id),
                    "unreviewed_memory",
                    "proposal.memory_id",
                )?,
            }
        }
        Ok(())
    }

    fn insert_memory(&mut self, record: MemoryRecord) -> Result<(), ValidationError> {
        record.validate()?;
        self.provenance(&record)?;
        require(
            record.status == MemoryStatus::Active,
            "invalid_commit_status",
            "status",
        )?;
        require(
            !self.memories.contains_key(&record.memory_id),
            "duplicate_id",
            "memory_id",
        )?;
        if let Some(id) = &record.supersedes {
            let prior = self.memories.get_mut(id).ok_or(ValidationError {
                code: "missing_memory",
                field: "supersedes",
            })?;
            require(
                prior.status == MemoryStatus::Active,
                "supersession_conflict",
                "supersedes",
            )?;
            require(
                record.updated_at >= prior.updated_at,
                "clock_regression",
                "updated_at",
            )?;
            prior.status = MemoryStatus::Superseded;
            prior.updated_at = record.updated_at.clone();
        }
        self.memories.insert(record.memory_id.clone(), record);
        Ok(())
    }

    pub fn commit_explicit(
        &mut self,
        record: MemoryRecord,
        action: ExplicitSave,
    ) -> Result<(), ValidationError> {
        let source = self.sources.get(&record.source_id).ok_or(ValidationError {
            code: "missing_source",
            field: "source_id",
        })?;
        require(
            matches!(
                (action, source.kind),
                (ExplicitSave::Inspector, SourceKind::ManualSave)
                    | (ExplicitSave::Remember, SourceKind::ExplicitRemember)
            ),
            "wrong_save_origin",
            "source.kind",
        )?;
        require(
            !self
                .candidates
                .values()
                .any(|c| c.proposal.memory_id == record.memory_id),
            "reserved_candidate_id",
            "memory_id",
        )?;
        let mut next = self.clone();
        next.insert_memory(record)?;
        next.validate()?;
        *self = next;
        Ok(())
    }

    pub fn propose(&mut self, candidate: CandidateRecord) -> Result<(), ValidationError> {
        candidate.validate()?;
        require(
            candidate.decision == CandidateDecision::Pending {},
            "already_reviewed",
            "decision",
        )?;
        require(
            !self.candidates.contains_key(&candidate.candidate_id),
            "duplicate_id",
            "candidate_id",
        )?;
        let mut next = self.clone();
        next.candidates
            .insert(candidate.candidate_id.clone(), candidate);
        next.validate()?;
        *self = next;
        Ok(())
    }

    /// The edited proposal must retain ID, provenance, kind and creation time.
    pub fn approve(
        &mut self,
        id: &str,
        edited: MemoryRecord,
        reviewed_at: &str,
    ) -> Result<(), ValidationError> {
        let mut next = self.clone();
        let candidate = next.candidates.get(id).ok_or(ValidationError {
            code: "missing_candidate",
            field: "candidate_id",
        })?;
        require(
            candidate.decision == CandidateDecision::Pending {},
            "already_reviewed",
            "decision",
        )?;
        require(
            valid_timestamp(reviewed_at)
                && reviewed_at >= candidate.updated_at.as_str()
                && edited.updated_at == reviewed_at,
            "clock_regression",
            "reviewed_at",
        )?;
        require(
            edited.memory_id == candidate.proposal.memory_id
                && edited.source_id == candidate.proposal.source_id
                && edited.created_at == candidate.proposal.created_at
                && edited.kind == candidate.proposal.kind,
            "changed_provenance",
            "proposal",
        )?;
        next.insert_memory(edited.clone())?;
        let candidate = next.candidates.get_mut(id).expect("existing candidate");
        candidate.decision = CandidateDecision::Approved {
            memory_id: edited.memory_id,
        };
        candidate.updated_at = reviewed_at.to_owned();
        candidate.validate()?;
        next.validate()?;
        *self = next;
        Ok(())
    }

    pub fn reject(
        &mut self,
        id: &str,
        reason: &str,
        reviewed_at: &str,
    ) -> Result<(), ValidationError> {
        let candidate = self.candidates.get(id).ok_or(ValidationError {
            code: "missing_candidate",
            field: "candidate_id",
        })?;
        require(
            candidate.decision == CandidateDecision::Pending {},
            "already_reviewed",
            "decision",
        )?;
        require(
            valid_timestamp(reviewed_at) && reviewed_at >= candidate.updated_at.as_str(),
            "clock_regression",
            "reviewed_at",
        )?;
        require(!reason.trim().is_empty(), "empty_text", "reason")?;
        let candidate = self.candidates.get_mut(id).expect("existing candidate");
        candidate.decision = CandidateDecision::Rejected {
            reason: reason.to_owned(),
        };
        candidate.updated_at = reviewed_at.to_owned();
        Ok(())
    }

    /// Undo only a current supersession. Both meanings and the historical link remain.
    pub fn undo_supersession(&mut self, id: &str, at: &str) -> Result<(), ValidationError> {
        let mut next = self.clone();
        let successor = next.memories.get(id).ok_or(ValidationError {
            code: "missing_memory",
            field: "memory_id",
        })?;
        require(
            successor.status == MemoryStatus::Active,
            "supersession_conflict",
            "status",
        )?;
        let prior_id = successor.supersedes.clone().ok_or(ValidationError {
            code: "missing_relation",
            field: "supersedes",
        })?;
        let prior = next.memories.get(&prior_id).expect("validated relation");
        require(
            prior.status == MemoryStatus::Superseded,
            "supersession_conflict",
            "supersedes",
        )?;
        require(
            valid_timestamp(at)
                && at >= successor.updated_at.as_str()
                && at >= prior.updated_at.as_str(),
            "clock_regression",
            "updated_at",
        )?;
        let successor = next.memories.get_mut(id).expect("existing successor");
        successor.status = MemoryStatus::Archived;
        successor.updated_at = at.to_owned();
        let prior = next.memories.get_mut(&prior_id).expect("existing prior");
        prior.status = MemoryStatus::Active;
        prior.updated_at = at.to_owned();
        next.validate()?;
        *self = next;
        Ok(())
    }
}
