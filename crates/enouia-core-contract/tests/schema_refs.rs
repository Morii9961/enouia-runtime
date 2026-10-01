use serde_json::Value;

fn schema(path: &str) -> Value {
    serde_json::from_str(match path {
        "core" => include_str!("../../../contracts/ipc/core-v1.schema.json"),
        "../memory/models-v1.schema.json" => {
            include_str!("../../../contracts/memory/models-v1.schema.json")
        }
        "../session/session-v1.schema.json" => {
            include_str!("../../../contracts/session/session-v1.schema.json")
        }
        "common-v1.schema.json" => include_str!("../../../contracts/ipc/common-v1.schema.json"),
        _ => panic!("unbundled schema: {path}"),
    })
    .unwrap()
}

fn references(value: &Value, owner: &Value) {
    match value {
        Value::Object(map) => {
            if let Some(Value::String(reference)) = map.get("$ref") {
                let (file, pointer) = reference.split_once('#').unwrap_or((reference, ""));
                let target = if file.is_empty() {
                    owner.clone()
                } else {
                    schema(file)
                };
                assert!(target.pointer(pointer).is_some(), "{reference}");
            }
            for child in map.values() {
                references(child, owner);
            }
        }
        Value::Array(array) => {
            for child in array {
                references(child, owner);
            }
        }
        _ => {}
    }
}

#[test]
fn core_schema_and_all_direct_contract_references_resolve_offline() {
    for path in [
        "core",
        "../memory/models-v1.schema.json",
        "../session/session-v1.schema.json",
        "common-v1.schema.json",
    ] {
        let root = schema(path);
        references(&root, &root);
    }
}

#[test]
fn closed_drafts_have_no_canonical_identity_or_commit_fields() {
    let root = schema("core");
    let draft = &root["$defs"]["memoryDraft"];
    assert_eq!(draft["additionalProperties"], false);
    for key in [
        "memoryId",
        "sourceId",
        "createdAt",
        "updatedAt",
        "status",
        "schemaVersion",
    ] {
        assert!(draft["properties"].get(key).is_none());
    }
    let requests = root["$defs"]["request"]["oneOf"].as_array().unwrap();
    assert_eq!(requests.len(), 8);
    for request in requests {
        assert_eq!(request["additionalProperties"], false);
    }
    let responses = root["$defs"]["response"]["oneOf"].as_array().unwrap();
    assert_eq!(responses.len(), 4);
    for response in responses {
        assert_eq!(response["properties"]["schemaVersion"]["const"], 1);
    }
    assert_eq!(
        responses[2]["properties"]["commitState"]["enum"],
        serde_json::json!(["model_only", "canonical_files_committed"])
    );
}
