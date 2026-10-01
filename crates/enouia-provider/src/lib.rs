//! Deterministic offline Provider. Only a prepared, exact recorded capsule enters invocation.
use enouia_common::{Cancellation, sha256_hex};
use enouia_context::{ContextCapsule, TokenPolicy};
use enouia_memory::{MemoryDraft, MemorySnapshot, ValidationError, valid_id};
use enouia_session::SessionRecord;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ProviderCapabilities {
    pub schema_version: u32,
    pub provider_id: String,
    pub max_input_units: u64,
    pub token_policy: TokenPolicy,
    pub supports_tools: bool,
    pub network_required: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ProviderRequest {
    pub schema_version: u32,
    pub request_id: String,
    pub capsule: ContextCapsule,
}

#[derive(Clone, Debug)]
pub struct PreparedRequest {
    request: ProviderRequest,
    capsule_bytes: Vec<u8>,
}

impl ProviderRequest {
    pub fn prepare(
        self,
        memory: &MemorySnapshot,
        sessions: &[SessionRecord],
    ) -> Result<PreparedRequest, ValidationError> {
        if self.schema_version != 1 || !valid_id(&self.request_id, "req_") {
            return Err(ValidationError {
                code: "invalid_provider_request",
                field: "schema_version/request_id",
            });
        }
        let capsule_bytes = self.capsule.provider_bytes(memory, sessions)?;
        Ok(PreparedRequest {
            request: self,
            capsule_bytes,
        })
    }
}

impl PreparedRequest {
    pub fn request(&self) -> &ProviderRequest {
        &self.request
    }
    pub fn capsule_bytes(&self) -> &[u8] {
        &self.capsule_bytes
    }
    pub fn capsule_sha256(&self) -> String {
        sha256_hex(&self.capsule_bytes)
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "tool", rename_all = "snake_case", deny_unknown_fields)]
pub enum ToolRequest {
    ProposeMemory {
        call_id: String,
        draft: Box<MemoryDraft>,
    },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "snake_case", deny_unknown_fields)]
pub enum ToolResult {
    CandidateQueued {
        call_id: String,
        candidate_id: String,
    },
    Unsupported {
        call_id: String,
    },
}

impl ToolRequest {
    pub fn validate(&self) -> Result<(), ValidationError> {
        match self {
            Self::ProposeMemory { call_id, draft } => {
                if !valid_id(call_id, "tool_") {
                    return Err(ValidationError {
                        code: "invalid_id",
                        field: "call_id",
                    });
                }
                draft.validate()
            }
        }
    }
}

impl ToolResult {
    pub fn validate(&self) -> Result<(), ValidationError> {
        let (call_id, candidate) = match self {
            Self::CandidateQueued {
                call_id,
                candidate_id,
            } => (call_id, Some(candidate_id)),
            Self::Unsupported { call_id } => (call_id, None),
        };
        if !valid_id(call_id, "tool_") || candidate.is_some_and(|id| !valid_id(id, "cand_")) {
            return Err(ValidationError {
                code: "invalid_id",
                field: "tool_result",
            });
        }
        Ok(())
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ProjectReference {
    pub memory_id: String,
    pub content: String,
    pub state: String,
    pub open_loops: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ProviderResponse {
    pub schema_version: u32,
    pub request_id: String,
    pub capsule_id: String,
    pub consumed_capsule_sha256: String,
    pub consumed_bytes: u64,
    pub text: String,
    pub project_states: Vec<ProjectReference>,
    pub tool_requests: Vec<ToolRequest>,
}

impl ProviderResponse {
    pub fn validate_against(
        &self,
        prepared: &PreparedRequest,
        capabilities: &ProviderCapabilities,
    ) -> Result<(), ValidationError> {
        if self.schema_version != 1
            || self.request_id != prepared.request().request_id
            || self.capsule_id != prepared.request().capsule.capsule_id
            || self.consumed_capsule_sha256 != prepared.capsule_sha256()
            || self.consumed_bytes != prepared.capsule_bytes().len() as u64
            || self.text.trim().is_empty()
        {
            return Err(ValidationError {
                code: "invalid_provider_response",
                field: "identity/consumed_capsule/text",
            });
        }
        if !capabilities.supports_tools && !self.tool_requests.is_empty() {
            return Err(ValidationError {
                code: "unsupported_tools",
                field: "tool_requests",
            });
        }
        let mut seen = std::collections::BTreeSet::new();
        for project in &self.project_states {
            if !seen.insert(&project.memory_id)
                || !prepared.request().capsule.active_projects.iter().any(|p| {
                    p.memory_id == project.memory_id
                        && p.content == project.content
                        && p.state.as_deref() == Some(&project.state)
                        && p.open_loops == project.open_loops
                })
            {
                return Err(ValidationError {
                    code: "unprovenanced_project",
                    field: "project_states",
                });
            }
        }
        let mut calls = std::collections::BTreeSet::new();
        for tool in &self.tool_requests {
            tool.validate()?;
            let ToolRequest::ProposeMemory { call_id, .. } = tool;
            if !calls.insert(call_id) {
                return Err(ValidationError {
                    code: "duplicate_id",
                    field: "tool.call_id",
                });
            }
        }
        Ok(())
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ProviderError {
    Cancelled,
    ContextTooLarge,
}

pub trait Provider {
    fn capabilities(&self) -> ProviderCapabilities;
    fn respond(
        &self,
        request: &PreparedRequest,
        cancellation: &dyn Cancellation,
    ) -> Result<ProviderResponse, ProviderError>;
}

#[derive(Clone, Copy, Debug, Default)]
pub struct MockProvider;

impl Provider for MockProvider {
    fn capabilities(&self) -> ProviderCapabilities {
        ProviderCapabilities {
            schema_version: 1,
            provider_id: "mock-v1".into(),
            max_input_units: 32_768,
            token_policy: TokenPolicy::Utf8BytesV1,
            supports_tools: false,
            network_required: false,
        }
    }

    fn respond(
        &self,
        prepared: &PreparedRequest,
        cancellation: &dyn Cancellation,
    ) -> Result<ProviderResponse, ProviderError> {
        if cancellation.is_cancelled() {
            return Err(ProviderError::Cancelled);
        }
        let request = prepared.request();
        if request.capsule.budget.estimated_tokens > self.capabilities().max_input_units {
            return Err(ProviderError::ContextTooLarge);
        }
        let mut projects: Vec<_> = request
            .capsule
            .active_projects
            .iter()
            .map(|p| ProjectReference {
                memory_id: p.memory_id.clone(),
                content: p.content.clone(),
                state: p.state.clone().expect("prepared ProjectState"),
                open_loops: p.open_loops.clone(),
            })
            .collect();
        projects.sort_by(|a, b| a.memory_id.cmp(&b.memory_id));
        let mut text = if projects.is_empty() {
            "Mock: no ProjectState was included in this capsule.".to_owned()
        } else {
            "Mock: included ProjectState records:".to_owned()
        };
        for project in &projects {
            if cancellation.is_cancelled() {
                return Err(ProviderError::Cancelled);
            }
            use std::fmt::Write;
            write!(
                &mut text,
                "\n{}: {}\nState: {}",
                project.memory_id, project.content, project.state
            )
            .expect("String formatting");
            for item in &project.open_loops {
                write!(&mut text, "\nOpen loop: {item}").expect("String formatting");
            }
        }
        Ok(ProviderResponse {
            schema_version: 1,
            request_id: request.request_id.clone(),
            capsule_id: request.capsule.capsule_id.clone(),
            consumed_capsule_sha256: prepared.capsule_sha256(),
            consumed_bytes: prepared.capsule_bytes().len() as u64,
            text,
            project_states: projects,
            tool_requests: Vec::new(),
        })
    }
}
