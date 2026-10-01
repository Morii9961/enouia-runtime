use serde_json::Value;

fn references(value: &Value, session: &Value, memory: &Value) {
    match value {
        Value::Object(map) => {
            if let Some(Value::String(reference)) = map.get("$ref") {
                let (file, pointer) = reference.split_once('#').unwrap();
                let target = match file {
                    "" => session,
                    "../memory/models-v1.schema.json" => memory,
                    _ => panic!("unbundled reference"),
                };
                assert!(target.pointer(pointer).is_some(), "{reference}");
            }
            for child in map.values() {
                references(child, session, memory);
            }
        }
        Value::Array(array) => {
            for child in array {
                references(child, session, memory);
            }
        }
        _ => {}
    }
}

#[test]
fn session_schema_uses_only_bundled_closed_event_shapes() {
    let session: Value = serde_json::from_str(include_str!(
        "../../../contracts/session/session-v1.schema.json"
    ))
    .unwrap();
    let memory: Value = serde_json::from_str(include_str!(
        "../../../contracts/memory/models-v1.schema.json"
    ))
    .unwrap();
    references(&session, &session, &memory);
    assert_eq!(session["additionalProperties"], false);
    assert_eq!(session["$defs"]["event"]["additionalProperties"], false);
    let bundle: Value = serde_json::from_str(include_str!(
        "../../../tests/fixtures/session/continuity-v1.json"
    ))
    .unwrap();
    for s in bundle["sessions"].as_array().unwrap() {
        for key in s.as_object().unwrap().keys() {
            assert!(session["properties"].get(key).is_some());
        }
        for event in s["events"].as_array().unwrap() {
            let shape = &session["$defs"]["event"];
            for key in event.as_object().unwrap().keys() {
                assert!(shape["properties"].get(key).is_some());
            }
            let alternative = if event["event"]["kind"] == "turn" {
                0
            } else {
                1
            };
            let shape = &shape["properties"]["event"]["oneOf"][alternative];
            for key in event["event"].as_object().unwrap().keys() {
                assert!(shape["properties"].get(key).is_some());
            }
        }
    }
}
