//! Local Core IPC DTOs only. Backend owns IDs, provenance, clocks, authorization and persistence.
use enouia_common::{ComponentId, StructuredError};
use enouia_memory::{
    MemoryKind, MemoryRecord, MemorySnapshot, MemoryStatus, TurnRange, ValidationError,
    ValidityInterval, valid_id,
};
use enouia_session::{SessionRecord, validate_sessions};
use serde::{Deserialize, Serialize};

fn require(ok: bool, code: &'static str, field: &'static str) -> Result<(), ValidationError> {
    if ok {
        Ok(())
    } else {
        Err(ValidationError { code, field })
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MemoryDraft {
    #[serde(rename = "type")]
    pub kind: MemoryKind,
    pub content: String,
    pub project_id: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    pub validity: Option<ValidityInterval>,
    pub confidence: Option<f64>,
    pub supersedes: Option<String>,
    pub state: Option<String>,
    #[serde(default)]
    pub decisions: Vec<String>,
    #[serde(default)]
    pub open_loops: Vec<String>,
    pub session_id: Option<String>,
    pub covered_turns: Option<TurnRange>,
    pub last_state: Option<String>,
}

impl MemoryDraft {
    pub fn validate(&self) -> Result<(), ValidationError> {
        // Check content/kind semantics through the canonical validator, without allocating a record.
        MemoryRecord {
            schema_version: 1,
            memory_id: "mem_00000000000000000000000000000000".into(),
            kind: self.kind,
            content: self.content.clone(),
            source_id: "src_00000000000000000000000000000000".into(),
            created_at: "0001-01-01T00:00:00.000Z".into(),
            updated_at: "0001-01-01T00:00:00.000Z".into(),
            status: MemoryStatus::Active,
            project_id: self.project_id.clone(),
            tags: self.tags.clone(),
            validity: self.validity.clone(),
            confidence: self.confidence,
            supersedes: None,
            state: self.state.clone(),
            decisions: self.decisions.clone(),
            open_loops: self.open_loops.clone(),
            session_id: self.session_id.clone(),
            covered_turns: self.covered_turns.clone(),
            last_state: self.last_state.clone(),
        }
        .validate()?;
        require(
            self.supersedes
                .as_ref()
                .is_none_or(|id| valid_id(id, "mem_")),
            "invalid_id",
            "supersedes",
        )
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SaveMode {
    Inspector,
    Remember,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "action", rename_all = "snake_case", deny_unknown_fields)]
pub enum CandidateReview {
    Approve { edited: Option<Box<MemoryDraft>> },
    Reject { reason: String },
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "operation",
    rename_all = "snake_case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum CoreRequest {
    CoreGetSnapshot {},
    CoreSaveMemory {
        save_mode: SaveMode,
        draft: Box<MemoryDraft>,
    },
    CoreReviewCandidate {
        candidate_id: String,
        review: CandidateReview,
    },
    CoreUndoSupersession {
        memory_id: String,
    },
    CoreCreateSession {
        title: String,
    },
    CoreGetSession {
        session_id: String,
    },
    CoreAppendUserTurn {
        session_id: String,
        content: String,
    },
    CoreCreateCheckpoint {
        session_id: String,
        covered_turns: TurnRange,
        last_state: String,
        open_loops: Vec<String>,
    },
}

impl CoreRequest {
    pub fn validate(&self) -> Result<(), ValidationError> {
        match self {
            Self::CoreGetSnapshot {} => Ok(()),
            Self::CoreSaveMemory { draft, .. } => {
                require(
                    draft.kind != MemoryKind::SessionCheckpoint,
                    "checkpoint_requires_session_command",
                    "type",
                )?;
                draft.validate()
            }
            Self::CoreReviewCandidate {
                candidate_id,
                review,
            } => {
                require(valid_id(candidate_id, "cand_"), "invalid_id", "candidateId")?;
                match review {
                    CandidateReview::Approve { edited } => {
                        edited.as_deref().map_or(Ok(()), MemoryDraft::validate)
                    }
                    CandidateReview::Reject { reason } => {
                        require(!reason.trim().is_empty(), "empty_text", "reason")
                    }
                }
            }
            Self::CoreUndoSupersession { memory_id } => {
                require(valid_id(memory_id, "mem_"), "invalid_id", "memoryId")
            }
            Self::CoreCreateSession { title } => {
                require(!title.trim().is_empty(), "empty_text", "title")
            }
            Self::CoreGetSession { session_id } => {
                require(valid_id(session_id, "ses_"), "invalid_id", "sessionId")
            }
            Self::CoreAppendUserTurn {
                session_id,
                content,
            } => {
                require(valid_id(session_id, "ses_"), "invalid_id", "sessionId")?;
                require(!content.trim().is_empty(), "empty_text", "content")
            }
            Self::CoreCreateCheckpoint {
                session_id,
                covered_turns,
                last_state,
                open_loops,
            } => {
                require(valid_id(session_id, "ses_"), "invalid_id", "sessionId")?;
                require(
                    valid_id(&covered_turns.first_turn_id, "turn_")
                        && valid_id(&covered_turns.last_turn_id, "turn_"),
                    "invalid_turn_range",
                    "coveredTurns",
                )?;
                require(
                    !last_state.trim().is_empty()
                        && open_loops.iter().all(|s| !s.trim().is_empty()),
                    "empty_text",
                    "lastState/openLoops",
                )
            }
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CommitState {
    ModelOnly,
    CanonicalFilesCommitted,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "snake_case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum CoreResponse {
    CoreSnapshot {
        schema_version: u32,
        memory: MemorySnapshot,
        sessions: Vec<SessionRecord>,
    },
    CoreSession {
        schema_version: u32,
        session: SessionRecord,
    },
    CoreMutationCompleted {
        schema_version: u32,
        commit_state: CommitState,
        memory_id: Option<String>,
        candidate_id: Option<String>,
        session_id: Option<String>,
        turn_id: Option<String>,
    },
    CoreError {
        schema_version: u32,
        error: StructuredError,
    },
}

impl CoreResponse {
    pub fn validate(&self) -> Result<(), ValidationError> {
        let version = match self {
            Self::CoreSnapshot { schema_version, .. }
            | Self::CoreSession { schema_version, .. }
            | Self::CoreMutationCompleted { schema_version, .. }
            | Self::CoreError { schema_version, .. } => *schema_version,
        };
        require(version == 1, "unsupported_schema", "schemaVersion")?;
        match self {
            Self::CoreSnapshot {
                memory, sessions, ..
            } => validate_sessions(sessions, memory),
            Self::CoreSession { session, .. } => {
                // Full provenance requires the read facade's validated snapshot, not this DTO alone.
                session.validate_shape()
            }
            Self::CoreMutationCompleted {
                memory_id,
                candidate_id,
                session_id,
                turn_id,
                ..
            } => {
                require(
                    [memory_id, candidate_id, session_id, turn_id]
                        .iter()
                        .any(|id| id.is_some()),
                    "missing_result_id",
                    "mutation",
                )?;
                for (id, prefix) in [
                    (memory_id, "mem_"),
                    (candidate_id, "cand_"),
                    (session_id, "ses_"),
                    (turn_id, "turn_"),
                ] {
                    require(
                        id.as_ref().is_none_or(|id| valid_id(id, prefix)),
                        "invalid_id",
                        "mutation",
                    )?;
                }
                require(
                    turn_id.is_none() || session_id.is_some(),
                    "missing_session",
                    "turnId",
                )
            }
            Self::CoreError { error, .. } => require(
                matches!(
                    error.component,
                    ComponentId::Core
                        | ComponentId::Vault
                        | ComponentId::MemoryIndex
                        | ComponentId::Provider
                        | ComponentId::Session
                ),
                "wrong_error_component",
                "error.component",
            ),
        }
    }
}
