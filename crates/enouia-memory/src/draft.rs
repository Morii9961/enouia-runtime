use crate::{
    MemoryKind, MemoryRecord, MemoryStatus, TurnRange, ValidationError, ValidityInterval, require,
    valid_id,
};
use serde::{Deserialize, Serialize};

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
