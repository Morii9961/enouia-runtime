use crate::{ValidationError, require, valid_id, valid_timestamp};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MemoryKind {
    Fact,
    Preference,
    Episode,
    ProjectState,
    SessionCheckpoint,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MemoryStatus {
    Active,
    Superseded,
    Archived,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TurnRange {
    pub first_turn_id: String,
    pub last_turn_id: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ValidityInterval {
    pub starts_at: String,
    pub ends_at: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MemoryRecord {
    pub schema_version: u32,
    pub memory_id: String,
    #[serde(rename = "type")]
    pub kind: MemoryKind,
    pub content: String,
    pub source_id: String,
    pub created_at: String,
    pub updated_at: String,
    pub status: MemoryStatus,
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

impl MemoryRecord {
    pub fn validate(&self) -> Result<(), ValidationError> {
        require(
            self.schema_version == 1,
            "unsupported_schema",
            "schema_version",
        )?;
        require(valid_id(&self.memory_id, "mem_"), "invalid_id", "memory_id")?;
        require(valid_id(&self.source_id, "src_"), "invalid_id", "source_id")?;
        require(!self.content.trim().is_empty(), "empty_text", "content")?;
        require(
            valid_timestamp(&self.created_at),
            "invalid_timestamp",
            "created_at",
        )?;
        require(
            valid_timestamp(&self.updated_at) && self.updated_at >= self.created_at,
            "invalid_timestamp",
            "updated_at",
        )?;
        if let Some(id) = &self.project_id {
            require(valid_id(id, "prj_"), "invalid_id", "project_id")?;
        }
        if let Some(id) = &self.supersedes {
            require(
                valid_id(id, "mem_") && id != &self.memory_id,
                "invalid_relation",
                "supersedes",
            )?;
        }
        require(
            self.tags.iter().all(|s| !s.trim().is_empty())
                && self.tags.iter().collect::<BTreeSet<_>>().len() == self.tags.len(),
            "invalid_tags",
            "tags",
        )?;
        require(
            self.confidence
                .is_none_or(|v| v.is_finite() && (0.0..=1.0).contains(&v)),
            "invalid_confidence",
            "confidence",
        )?;
        if let Some(v) = &self.validity {
            require(
                valid_timestamp(&v.starts_at)
                    && v.ends_at
                        .as_ref()
                        .is_none_or(|end| valid_timestamp(end) && end >= &v.starts_at),
                "invalid_interval",
                "validity",
            )?;
        }
        require(
            self.decisions
                .iter()
                .chain(&self.open_loops)
                .all(|s| !s.trim().is_empty()),
            "empty_text",
            "decisions/open_loops",
        )?;
        match self.kind {
            MemoryKind::ProjectState => {
                require(
                    self.project_id.is_some()
                        && self.state.as_ref().is_some_and(|s| !s.trim().is_empty()),
                    "missing_project_state",
                    "project_id/state",
                )?;
                require(
                    self.session_id.is_none()
                        && self.covered_turns.is_none()
                        && self.last_state.is_none(),
                    "wrong_kind_fields",
                    "session",
                )?;
            }
            MemoryKind::SessionCheckpoint => {
                require(
                    self.state.is_none() && self.decisions.is_empty(),
                    "wrong_kind_fields",
                    "state/decisions",
                )?;
                require(
                    self.session_id
                        .as_ref()
                        .is_some_and(|id| valid_id(id, "ses_")),
                    "invalid_id",
                    "session_id",
                )?;
                require(
                    self.last_state
                        .as_ref()
                        .is_some_and(|s| !s.trim().is_empty()),
                    "empty_text",
                    "last_state",
                )?;
                require(
                    self.covered_turns.as_ref().is_some_and(|r| {
                        valid_id(&r.first_turn_id, "turn_") && valid_id(&r.last_turn_id, "turn_")
                    }),
                    "invalid_turn_range",
                    "covered_turns",
                )?;
            }
            _ => require(
                self.state.is_none()
                    && self.decisions.is_empty()
                    && self.open_loops.is_empty()
                    && self.session_id.is_none()
                    && self.covered_turns.is_none()
                    && self.last_state.is_none(),
                "wrong_kind_fields",
                "type",
            )?,
        }
        Ok(())
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SourceKind {
    ManualSave,
    ExplicitRemember,
    ConversationTurn,
    Import,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SourceRecord {
    pub schema_version: u32,
    pub source_id: String,
    pub kind: SourceKind,
    pub title: String,
    pub created_at: String,
    pub session_id: Option<String>,
    pub turn_id: Option<String>,
    pub importer_version: Option<String>,
    pub raw_sha256: Option<String>,
}

impl SourceRecord {
    pub fn validate(&self) -> Result<(), ValidationError> {
        require(
            self.schema_version == 1,
            "unsupported_schema",
            "schema_version",
        )?;
        require(valid_id(&self.source_id, "src_"), "invalid_id", "source_id")?;
        require(
            valid_timestamp(&self.created_at),
            "invalid_timestamp",
            "created_at",
        )?;
        require(!self.title.trim().is_empty(), "empty_text", "title")?;
        let conversation = self.kind == SourceKind::ConversationTurn;
        require(
            if conversation {
                self.session_id
                    .as_ref()
                    .is_some_and(|s| valid_id(s, "ses_"))
                    && self.turn_id.as_ref().is_some_and(|s| valid_id(s, "turn_"))
            } else {
                self.session_id.is_none() && self.turn_id.is_none()
            },
            "invalid_source_locator",
            "session_id/turn_id",
        )?;
        let import = self.kind == SourceKind::Import;
        require(
            if import {
                self.importer_version
                    .as_ref()
                    .is_some_and(|s| !s.trim().is_empty())
                    && self.raw_sha256.as_ref().is_some_and(|s| {
                        s.len() == 64
                            && s.bytes()
                                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
                    })
            } else {
                self.importer_version.is_none() && self.raw_sha256.is_none()
            },
            "invalid_import_provenance",
            "importer_version/raw_sha256",
        )?;
        Ok(())
    }
}
