use enouia_memory::MemorySnapshot;
use serde_json::Value;

fn schema(name: &str) -> Value {
    serde_json::from_str(match name {
        "models-v1.schema.json" => include_str!("../../../contracts/memory/models-v1.schema.json"),
        "memory-v1.schema.json" => include_str!("../../../contracts/memory/memory-v1.schema.json"),
        "source-v1.schema.json" => include_str!("../../../contracts/memory/source-v1.schema.json"),
        "candidate-v1.schema.json" => {
            include_str!("../../../contracts/memory/candidate-v1.schema.json")
        }
        _ => panic!("unknown bundled schema"),
    })
    .unwrap()
}

fn references(value: &Value, owner: &Value) {
    match value {
        Value::Object(map) => {
            if let Some(Value::String(reference)) = map.get("$ref") {
                let (file, pointer) = reference.split_once('#').unwrap();
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
fn bundled_schema_references_resolve_without_network() {
    for name in [
        "models-v1.schema.json",
        "memory-v1.schema.json",
        "source-v1.schema.json",
        "candidate-v1.schema.json",
    ] {
        let schema = schema(name);
        assert_eq!(
            schema["$schema"],
            "https://json-schema.org/draft/2020-12/schema"
        );
        references(&schema, &schema);
    }
}

#[test]
fn serialized_fixture_fields_match_closed_model_schema_shapes() {
    let fixture: MemorySnapshot = serde_json::from_str(include_str!(
        "../../../tests/fixtures/memory/models-v1.json"
    ))
    .unwrap();
    let json = serde_json::to_value(fixture).unwrap();
    let root = schema("models-v1.schema.json");
    let check = |value: &Value, shape: &Value| {
        assert_eq!(shape["additionalProperties"], false);
        let properties = shape["properties"].as_object().unwrap();
        for key in value.as_object().unwrap().keys() {
            assert!(properties.contains_key(key), "{key}");
        }
        for key in shape["required"].as_array().unwrap() {
            assert!(value.get(key.as_str().unwrap()).is_some());
        }
    };
    check(&json, &root);
    for (key, definition) in [
        ("memories", "memory"),
        ("sources", "source"),
        ("candidates", "candidate"),
    ] {
        for value in json[key].as_array().unwrap() {
            check(value, &root["$defs"][definition]);
        }
    }
    assert_eq!(
        root["$defs"]["memory"]["properties"]["type"]["enum"],
        serde_json::json!([
            "fact",
            "preference",
            "episode",
            "project_state",
            "session_checkpoint"
        ])
    );
}
