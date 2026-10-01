use enouia_context::*;
use enouia_memory::MemorySnapshot;
use enouia_session::SessionRecord;
use serde::Deserialize;
use serde_json::Value;

#[derive(Deserialize)]
struct Bundle {
    memory: MemorySnapshot,
    sessions: Vec<SessionRecord>,
}

#[test]
fn frozen_capsule_matches_canonical_memory_and_exact_provider_bytes_budget() {
    let c: ContextCapsule = serde_json::from_str(include_str!(
        "../../../tests/fixtures/context/capsule-v1.json"
    ))
    .unwrap();
    let f: Bundle = serde_json::from_str(include_str!(
        "../../../tests/fixtures/session/continuity-v1.json"
    ))
    .unwrap();
    c.validate_with_snapshot(&f.memory, &f.sessions).unwrap();
    let bytes = c.provider_bytes(&f.memory, &f.sessions).unwrap();
    assert_eq!(c.budget.estimated_tokens, 2427);
    assert_eq!(c.budget.estimated_tokens, bytes.len() as u64 + 256);
}

fn refs(value: &Value, memory: &Value) {
    match value {
        Value::Object(map) => {
            if let Some(Value::String(reference)) = map.get("$ref") {
                let (file, pointer) = reference.split_once('#').unwrap();
                assert_eq!(file, "../memory/models-v1.schema.json");
                assert!(memory.pointer(pointer).is_some());
            }
            for child in map.values() {
                refs(child, memory);
            }
        }
        Value::Array(array) => {
            for child in array {
                refs(child, memory);
            }
        }
        _ => {}
    }
}

#[test]
fn context_schema_retains_architecture_fields_and_bundled_references() {
    let schema: Value = serde_json::from_str(include_str!(
        "../../../contracts/context/capsule-v1.schema.json"
    ))
    .unwrap();
    let memory: Value = serde_json::from_str(include_str!(
        "../../../contracts/memory/models-v1.schema.json"
    ))
    .unwrap();
    refs(&schema, &memory);
    assert_eq!(schema["additionalProperties"], false);
    let fixture: Value = serde_json::from_str(include_str!(
        "../../../tests/fixtures/context/capsule-v1.json"
    ))
    .unwrap();
    let fields = schema["properties"].as_object().unwrap();
    assert_eq!(fixture.as_object().unwrap().len(), fields.len());
    for key in fixture.as_object().unwrap().keys() {
        assert!(fields.contains_key(key));
    }
    assert_eq!(schema["required"].as_array().unwrap().len(), fields.len());
}
