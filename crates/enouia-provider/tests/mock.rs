use enouia_common::{Cancellation, sha256_hex};
use enouia_context::ContextCapsule;
use enouia_memory::MemorySnapshot;
use enouia_provider::*;
use enouia_session::SessionRecord;
use serde::Deserialize;

#[derive(Deserialize)]
struct Bundle {
    memory: MemorySnapshot,
    sessions: Vec<SessionRecord>,
}
struct Cancel(bool);
impl Cancellation for Cancel {
    fn is_cancelled(&self) -> bool {
        self.0
    }
}
fn id(prefix: &str, n: u32) -> String {
    format!("{prefix}{n:032x}")
}
fn fixture() -> (ProviderRequest, Bundle) {
    let capsule = serde_json::from_str(include_str!(
        "../../../tests/fixtures/context/capsule-v1.json"
    ))
    .unwrap();
    let f = serde_json::from_str(include_str!(
        "../../../tests/fixtures/session/continuity-v1.json"
    ))
    .unwrap();
    (
        ProviderRequest {
            schema_version: 1,
            request_id: id("req_", 1),
            capsule,
        },
        f,
    )
}

#[test]
fn mock_reads_exact_prepared_capsule_and_returns_only_included_project() {
    let (r, f) = fixture();
    let prepared = r.prepare(&f.memory, &f.sessions).unwrap();
    let bytes = prepared.capsule_bytes().to_vec();
    let reply = MockProvider.respond(&prepared, &Cancel(false)).unwrap();
    reply
        .validate_against(&prepared, &MockProvider.capabilities())
        .unwrap();
    assert_eq!(reply.consumed_capsule_sha256, sha256_hex(&bytes));
    assert_eq!(reply.consumed_bytes, bytes.len() as u64);
    assert_eq!(reply.project_states.len(), 1);
    assert_eq!(reply.project_states[0].memory_id, id("mem_", 4));
    assert_eq!(
        reply.project_states[0].content,
        f.memory.memories[3].content
    );
    assert!(reply.text.contains(&f.memory.memories[3].open_loops[0]));
    assert!(!reply.text.contains(&f.memory.memories[0].content));
    assert!(reply.tool_requests.is_empty());
    assert_eq!(bytes, prepared.capsule_bytes());
    assert_eq!(
        MockProvider.respond(&prepared, &Cancel(false)).unwrap(),
        reply
    );
    assert_eq!(
        serde_json::from_str::<ProviderResponse>(&serde_json::to_string(&reply).unwrap()).unwrap(),
        reply
    );
}

#[test]
fn frozen_mock_reply_has_independently_calculated_capsule_hash() {
    let (r, f) = fixture();
    let prepared = r.prepare(&f.memory, &f.sessions).unwrap();
    let expected: ProviderResponse = serde_json::from_str(include_str!(
        "../../../tests/fixtures/provider/mock-response-v1.json"
    ))
    .unwrap();
    assert_eq!(
        MockProvider.respond(&prepared, &Cancel(false)).unwrap(),
        expected
    );
    let mut forged = expected.clone();
    forged.project_states[0].content = "forged".into();
    assert!(
        forged
            .validate_against(&prepared, &MockProvider.capabilities())
            .is_err()
    );
    let mut forged = expected;
    forged.consumed_capsule_sha256 = "0".repeat(64);
    assert!(
        forged
            .validate_against(&prepared, &MockProvider.capabilities())
            .is_err()
    );
}

#[test]
fn no_project_reply_does_not_pull_project_from_canonical_registry() {
    let (mut r, f) = fixture();
    r.capsule.active_projects.clear();
    r.capsule.recent_session_checkpoints.clear();
    r.capsule.open_loops.clear();
    r.capsule
        .provenance
        .retain(|p| p.reason == enouia_context::InclusionReason::Identity);
    r.capsule = r.capsule.seal_budget().unwrap();
    let prepared = r.prepare(&f.memory, &f.sessions).unwrap();
    let reply = MockProvider.respond(&prepared, &Cancel(false)).unwrap();
    assert!(reply.project_states.is_empty());
    assert!(!reply.text.contains(&id("mem_", 4)));
}

#[test]
fn invalid_unverified_or_changed_capsule_never_becomes_prepared_request() {
    let (mut r, f) = fixture();
    r.request_id = "../request.json".into();
    assert!(r.prepare(&f.memory, &f.sessions).is_err());
    let (mut r, f) = fixture();
    r.capsule.active_projects[0].content = "invented".into();
    r.capsule = r.capsule.seal_budget().unwrap();
    assert!(r.prepare(&f.memory, &f.sessions).is_err());
    let (mut r, f) = fixture();
    r.schema_version = 2;
    assert!(r.prepare(&f.memory, &f.sessions).is_err());
}

#[test]
fn cancelled_and_oversized_requests_refuse_without_response() {
    let (r, f) = fixture();
    let prepared = r.prepare(&f.memory, &f.sessions).unwrap();
    assert_eq!(
        MockProvider.respond(&prepared, &Cancel(true)).unwrap_err(),
        ProviderError::Cancelled
    );
    let (mut r, f) = fixture();
    r.capsule.query = "x".repeat(40_000);
    r.capsule.budget.max_tokens = 50_000;
    r.capsule = r.capsule.seal_budget().unwrap();
    let prepared = r.prepare(&f.memory, &f.sessions).unwrap();
    assert_eq!(
        MockProvider.respond(&prepared, &Cancel(false)).unwrap_err(),
        ProviderError::ContextTooLarge
    );
    let capabilities = MockProvider.capabilities();
    assert!(!capabilities.network_required && !capabilities.supports_tools);
    assert_eq!(capabilities.provider_id, "mock-v1");
}

#[test]
fn tool_contract_queues_candidate_instead_of_canonical_memory_commit() {
    let result = ToolResult::CandidateQueued {
        call_id: id("tool_", 1),
        candidate_id: id("cand_", 1),
    };
    result.validate().unwrap();
    assert_eq!(
        serde_json::from_str::<ToolResult>(&serde_json::to_string(&result).unwrap()).unwrap(),
        result
    );
    let json = serde_json::json!({"status":"candidate_queued","call_id":id("tool_",1),"candidate_id":id("cand_",1),"memory_id":id("mem_",1)});
    assert!(serde_json::from_value::<ToolResult>(json).is_err());
    assert!(
        ToolResult::Unsupported {
            call_id: "invalid".into()
        }
        .validate()
        .is_err()
    );
    let json =
        serde_json::json!({"tool":"execute_shell","call_id":id("tool_",1),"command":"private"});
    assert!(serde_json::from_value::<ToolRequest>(json).is_err());
}

#[test]
fn request_dto_has_no_hidden_messages_auth_or_endpoint() {
    let (r, _) = fixture();
    let mut json = serde_json::to_value(r).unwrap();
    json["extra_messages"] = serde_json::json!(["hidden"]);
    assert!(serde_json::from_value::<ProviderRequest>(json).is_err());
    let _: ContextCapsule = serde_json::from_str(include_str!(
        "../../../tests/fixtures/context/capsule-v1.json"
    ))
    .unwrap();
}
