//! Pure append-only conversation model. Checkpoints reference canonical Memory, never replace turns.
use enouia_memory::{
    MemoryKind, MemoryLedger, MemorySnapshot, MemoryStatus, SourceKind, ValidationError, valid_id,
    valid_timestamp,
};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

const MAX_SEQUENCE: u64 = 9_007_199_254_740_991;

fn require(ok: bool, code: &'static str, field: &'static str) -> Result<(), ValidationError> {
    if ok {
        Ok(())
    } else {
        Err(ValidationError { code, field })
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TurnRole {
    User,
    Assistant,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TurnInput {
    pub turn_id: String,
    pub role: TurnRole,
    pub content: String,
    pub source_id: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum EventContent {
    Turn {
        turn_id: String,
        role: TurnRole,
        content: String,
        source_id: String,
    },
    Checkpoint {
        memory_id: String,
    },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SessionEvent {
    pub sequence: u64,
    pub created_at: String,
    pub event: EventContent,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SessionRecord {
    pub schema_version: u32,
    pub session_id: String,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
    pub events: Vec<SessionEvent>,
}

impl SessionRecord {
    pub fn new(session_id: String, title: String, at: String) -> Result<Self, ValidationError> {
        let result = Self {
            schema_version: 1,
            session_id,
            title,
            created_at: at.clone(),
            updated_at: at,
            events: Vec::new(),
        };
        result.validate_shape()?;
        Ok(result)
    }

    fn validate_shape(&self) -> Result<(), ValidationError> {
        require(
            self.schema_version == 1,
            "unsupported_schema",
            "schema_version",
        )?;
        require(
            valid_id(&self.session_id, "ses_"),
            "invalid_id",
            "session_id",
        )?;
        require(!self.title.trim().is_empty(), "empty_text", "title")?;
        require(
            valid_timestamp(&self.created_at)
                && valid_timestamp(&self.updated_at)
                && self.updated_at >= self.created_at,
            "invalid_timestamp",
            "created_at/updated_at",
        )?;
        let mut time = self.created_at.as_str();
        let mut turns = BTreeSet::new();
        let mut checkpoints = BTreeSet::new();
        for (index, event) in self.events.iter().enumerate() {
            let expected = u64::try_from(index).ok().and_then(|n| n.checked_add(1));
            require(
                expected == Some(event.sequence) && event.sequence <= MAX_SEQUENCE,
                "invalid_sequence",
                "events.sequence",
            )?;
            require(
                valid_timestamp(&event.created_at) && event.created_at.as_str() >= time,
                "clock_regression",
                "events.created_at",
            )?;
            time = &event.created_at;
            match &event.event {
                EventContent::Turn {
                    turn_id,
                    content,
                    source_id,
                    ..
                } => {
                    require(
                        valid_id(turn_id, "turn_") && valid_id(source_id, "src_"),
                        "invalid_id",
                        "turn_id/source_id",
                    )?;
                    require(turns.insert(turn_id), "duplicate_id", "turn_id")?;
                    require(!content.trim().is_empty(), "empty_text", "content")?;
                }
                EventContent::Checkpoint { memory_id } => {
                    require(valid_id(memory_id, "mem_"), "invalid_id", "memory_id")?;
                    require(
                        checkpoints.insert(memory_id),
                        "duplicate_id",
                        "checkpoint.memory_id",
                    )?;
                }
            }
        }
        require(time == self.updated_at, "invalid_timestamp", "updated_at")
    }

    /// Validates canonical provenance and already-covered turns in chronological event order.
    pub fn validate_with_memory(&self, memory: &MemorySnapshot) -> Result<(), ValidationError> {
        self.validate_shape()?;
        MemoryLedger::from_snapshot(memory.clone())?;
        let sources: BTreeMap<_, _> = memory
            .sources
            .iter()
            .map(|s| (s.source_id.as_str(), s))
            .collect();
        let records: BTreeMap<_, _> = memory
            .memories
            .iter()
            .map(|m| (m.memory_id.as_str(), m))
            .collect();
        let mut turns = BTreeMap::new();
        for event in &self.events {
            match &event.event {
                EventContent::Turn {
                    turn_id, source_id, ..
                } => {
                    let source = sources.get(source_id.as_str()).ok_or(ValidationError {
                        code: "missing_source",
                        field: "turn.source_id",
                    })?;
                    require(
                        source.kind == SourceKind::ConversationTurn
                            && source.session_id.as_deref() == Some(&self.session_id)
                            && source.turn_id.as_deref() == Some(turn_id)
                            && source.created_at == event.created_at,
                        "wrong_turn_provenance",
                        "turn.source_id",
                    )?;
                    turns.insert(
                        turn_id.as_str(),
                        (event.sequence, event.created_at.as_str()),
                    );
                }
                EventContent::Checkpoint { memory_id } => {
                    let record = records.get(memory_id.as_str()).ok_or(ValidationError {
                        code: "missing_memory",
                        field: "checkpoint.memory_id",
                    })?;
                    require(
                        record.kind == MemoryKind::SessionCheckpoint
                            && record.session_id.as_deref() == Some(&self.session_id),
                        "wrong_checkpoint_session",
                        "checkpoint.memory_id",
                    )?;
                    let range = record
                        .covered_turns
                        .as_ref()
                        .expect("validated checkpoint shape");
                    let first = turns
                        .get(range.first_turn_id.as_str())
                        .ok_or(ValidationError {
                            code: "missing_turn",
                            field: "covered_turns.first_turn_id",
                        })?;
                    let last = turns
                        .get(range.last_turn_id.as_str())
                        .ok_or(ValidationError {
                            code: "missing_turn",
                            field: "covered_turns.last_turn_id",
                        })?;
                    require(first.0 <= last.0, "reversed_turn_range", "covered_turns")?;
                    require(
                        record.created_at.as_str() >= last.1
                            && record.created_at <= event.created_at,
                        "invalid_timestamp",
                        "checkpoint.created_at",
                    )?;
                }
            }
        }
        Ok(())
    }

    fn append(
        &mut self,
        event: EventContent,
        at: &str,
        memory: &MemorySnapshot,
    ) -> Result<(), ValidationError> {
        let sequence = u64::try_from(self.events.len())
            .ok()
            .and_then(|n| n.checked_add(1))
            .filter(|n| *n <= MAX_SEQUENCE)
            .ok_or(ValidationError {
                code: "sequence_exhausted",
                field: "events.sequence",
            })?;
        let mut next = self.clone();
        next.events.push(SessionEvent {
            sequence,
            created_at: at.to_owned(),
            event,
        });
        next.updated_at = at.to_owned();
        next.validate_with_memory(memory)?;
        *self = next;
        Ok(())
    }

    pub fn append_turn(
        &mut self,
        input: TurnInput,
        at: &str,
        memory: &MemorySnapshot,
    ) -> Result<(), ValidationError> {
        self.append(
            EventContent::Turn {
                turn_id: input.turn_id,
                role: input.role,
                content: input.content,
                source_id: input.source_id,
            },
            at,
            memory,
        )
    }

    pub fn append_checkpoint(
        &mut self,
        memory_id: String,
        at: &str,
        memory: &MemorySnapshot,
    ) -> Result<(), ValidationError> {
        require(
            memory
                .memories
                .iter()
                .any(|m| m.memory_id == memory_id && m.status == MemoryStatus::Active),
            "inactive_checkpoint",
            "checkpoint.memory_id",
        )?;
        self.append(EventContent::Checkpoint { memory_id }, at, memory)
    }

    pub fn turns(&self) -> impl Iterator<Item = &SessionEvent> {
        self.events
            .iter()
            .filter(|e| matches!(e.event, EventContent::Turn { .. }))
    }
    pub fn checkpoints(&self) -> impl Iterator<Item = &SessionEvent> {
        self.events
            .iter()
            .filter(|e| matches!(e.event, EventContent::Checkpoint { .. }))
    }
}

/// Complete-bundle consistency for storage/orchestration callers, including unreferenced records.
pub fn validate_sessions(
    sessions: &[SessionRecord],
    memory: &MemorySnapshot,
) -> Result<(), ValidationError> {
    MemoryLedger::from_snapshot(memory.clone())?;
    let mut session_ids = BTreeSet::new();
    let mut turn_sources = BTreeMap::new();
    let mut checkpoint_ids = BTreeSet::new();
    for session in sessions {
        require(
            session_ids.insert(session.session_id.as_str()),
            "duplicate_id",
            "session_id",
        )?;
        session.validate_with_memory(memory)?;
        for event in &session.events {
            match &event.event {
                EventContent::Turn {
                    turn_id, source_id, ..
                } => {
                    require(
                        turn_sources
                            .insert(
                                turn_id.as_str(),
                                (session.session_id.as_str(), source_id.as_str()),
                            )
                            .is_none(),
                        "duplicate_id",
                        "turn_id",
                    )?;
                }
                EventContent::Checkpoint { memory_id } => {
                    require(
                        checkpoint_ids.insert(memory_id.as_str()),
                        "duplicate_id",
                        "checkpoint.memory_id",
                    )?;
                }
            }
        }
    }
    for source in &memory.sources {
        if source.kind == SourceKind::ConversationTurn {
            let turn = source
                .turn_id
                .as_deref()
                .expect("validated conversation source");
            require(
                turn_sources.get(turn)
                    == Some(&(
                        source.session_id.as_deref().expect("validated source"),
                        source.source_id.as_str(),
                    )),
                "missing_turn",
                "source.turn_id",
            )?;
        }
    }
    for record in &memory.memories {
        if record.kind == MemoryKind::SessionCheckpoint {
            require(
                checkpoint_ids.contains(record.memory_id.as_str()),
                "missing_checkpoint_event",
                "memory_id",
            )?;
        }
    }
    Ok(())
}
