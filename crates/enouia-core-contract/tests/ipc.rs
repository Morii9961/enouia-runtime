use enouia_common::{ComponentId, ErrorCode, StructuredError};
use enouia_core_contract::*;
use enouia_memory::MemorySnapshot;
use enouia_session::SessionRecord;
use serde::Deserialize;
use serde_json::{Value, json};

#[derive(Deserialize)]
struct Bundle {
    memory: MemorySnapshot,
    sessions: Vec<SessionRecord>,
}
fn fixture() -> Bundle {
    serde_json::from_str(include_str!(
        "../../../tests/fixtures/session/continuity-v1.json"
    ))
    .unwrap()
}
fn draft() -> Value {
    json!({"type":"fact","content":"Synthetic IPC fact","projectId":null,"tags":[],"validity":null,"confidence":null,"supersedes":null,"state":null,"decisions":[],"openLoops":[],"sessionId":null,"coveredTurns":null,"lastState":null})
}
fn id(prefix: &str, n: u32) -> String {
    format!("{prefix}{n:032x}")
}

#[test]
fn all_eight_requests_round_trip_with_stable_operations() {
    for json in [
        json!({"operation":"core_get_snapshot"}),
        json!({"operation":"core_save_memory","saveMode":"inspector","draft":draft()}),
        json!({"operation":"core_review_candidate","candidateId":id("cand_",1),"review":{"action":"approve","edited":null}}),
        json!({"operation":"core_undo_supersession","memoryId":id("mem_",1)}),
        json!({"operation":"core_create_session","title":"Synthetic"}),
        json!({"operation":"core_get_session","sessionId":id("ses_",1)}),
        json!({"operation":"core_append_user_turn","sessionId":id("ses_",1),"content":"Synthetic question"}),
        json!({"operation":"core_create_checkpoint","sessionId":id("ses_",1),"coveredTurns":{"first_turn_id":id("turn_",1),"last_turn_id":id("turn_",2)},"lastState":"Synthetic state","openLoops":[]}),
    ] {
        let request: CoreRequest = serde_json::from_value(json.clone()).unwrap();
        request.validate().unwrap();
        assert_eq!(serde_json::to_value(request).unwrap(), json);
    }
}

#[test]
fn frontend_cannot_assign_canonical_ids_status_times_sources_or_assistant_role() {
    for field in [
        "memoryId",
        "sourceId",
        "status",
        "createdAt",
        "updatedAt",
        "schemaVersion",
    ] {
        let mut d = draft();
        d[field] = "forged".into();
        assert!(
            serde_json::from_value::<CoreRequest>(
                json!({"operation":"core_save_memory","saveMode":"inspector","draft":d})
            )
            .is_err()
        );
    }
    assert!(serde_json::from_value::<CoreRequest>(json!({"operation":"core_append_user_turn","sessionId":id("ses_",1),"content":"x","role":"assistant"})).is_err());
    assert!(
        serde_json::from_value::<CoreRequest>(
            json!({"operation":"core_get_snapshot","archivePath":"private"})
        )
        .is_err()
    );
    assert!(
        serde_json::from_value::<CoreRequest>(json!({"operation":"core_propose_candidate"}))
            .is_err()
    );
}

#[test]
fn invalid_review_memory_kind_and_path_ids_fail_semantic_validation() {
    let r: CoreRequest = serde_json::from_value(json!({"operation":"core_review_candidate","candidateId":id("cand_",1),"review":{"action":"reject","reason":"  "}})).unwrap();
    assert!(r.validate().is_err());
    let r: CoreRequest = serde_json::from_value(
        json!({"operation":"core_get_session","sessionId":"../private.json"}),
    )
    .unwrap();
    assert!(r.validate().is_err());
    let mut d = draft();
    d["type"] = "project_state".into();
    let r: MemoryDraft = serde_json::from_value(d).unwrap();
    assert!(r.validate().is_err());
    let mut d = draft();
    d["type"] = "session_checkpoint".into();
    d["sessionId"] = id("ses_", 1).into();
    d["coveredTurns"] = json!({"first_turn_id":id("turn_",1),"last_turn_id":id("turn_",2)});
    d["lastState"] = "checkpoint".into();
    let r: CoreRequest = serde_json::from_value(
        json!({"operation":"core_save_memory","saveMode":"inspector","draft":d.clone()}),
    )
    .unwrap();
    assert!(r.validate().is_err());
    let r: CoreRequest = serde_json::from_value(json!({"operation":"core_review_candidate","candidateId":id("cand_",1),"review":{"action":"approve","edited":d}})).unwrap();
    r.validate().unwrap();
}

#[test]
fn snapshot_response_preserves_provenance_and_distinguishes_model_only_commit() {
    let f = fixture();
    let response = CoreResponse::CoreSnapshot {
        schema_version: 1,
        memory: f.memory,
        sessions: f.sessions,
    };
    response.validate().unwrap();
    let json = serde_json::to_value(&response).unwrap();
    assert_eq!(json["schemaVersion"], 1);
    assert_eq!(json["kind"], "core_snapshot");
    assert_eq!(
        serde_json::from_value::<CoreResponse>(json).unwrap(),
        response
    );
    let response = CoreResponse::CoreMutationCompleted {
        schema_version: 1,
        commit_state: CommitState::ModelOnly,
        memory_id: Some(id("mem_", 1)),
        candidate_id: None,
        session_id: None,
        turn_id: None,
    };
    response.validate().unwrap();
    assert_eq!(
        serde_json::to_value(response).unwrap()["commitState"],
        "model_only"
    );
}

#[test]
fn invalid_response_versions_shapes_components_and_result_ids_fail() {
    let f = fixture();
    let mut session = f.sessions[0].clone();
    session.updated_at = session.created_at.clone();
    assert!(
        CoreResponse::CoreSession {
            schema_version: 1,
            session
        }
        .validate()
        .is_err()
    );
    assert!(
        CoreResponse::CoreMutationCompleted {
            schema_version: 1,
            commit_state: CommitState::ModelOnly,
            memory_id: None,
            candidate_id: None,
            session_id: None,
            turn_id: Some(id("turn_", 1))
        }
        .validate()
        .is_err()
    );
    assert!(
        CoreResponse::CoreError {
            schema_version: 2,
            error: StructuredError {
                code: ErrorCode::ContractInvalid,
                component: ComponentId::Core,
                retryable: false
            }
        }
        .validate()
        .is_err()
    );
    assert!(
        CoreResponse::CoreError {
            schema_version: 1,
            error: StructuredError {
                code: ErrorCode::ContractInvalid,
                component: ComponentId::ActivityScheduler,
                retryable: false
            }
        }
        .validate()
        .is_err()
    );
    let response = CoreResponse::CoreError {
        schema_version: 1,
        error: StructuredError {
            code: ErrorCode::ContractInvalid,
            component: ComponentId::Core,
            retryable: false,
        },
    };
    response.validate().unwrap();
    assert_eq!(
        serde_json::to_value(response).unwrap(),
        json!({"schemaVersion":1,"kind":"core_error","error":{"code":"contract_invalid","component":"core","retryable":false}})
    );
}
