use serde_json::Value;

#[test]
fn provider_contract_references_and_frozen_response_shape_are_bundled() {
    let schema: Value = serde_json::from_str(include_str!(
        "../../../contracts/provider/ports-v1.schema.json"
    ))
    .unwrap();
    let draft: Value = serde_json::from_str(include_str!(
        "../../../contracts/memory/draft-v1.schema.json"
    ))
    .unwrap();
    let context: Value = serde_json::from_str(include_str!(
        "../../../contracts/context/capsule-v1.schema.json"
    ))
    .unwrap();
    fn walk(value: &Value, owner: &Value, draft: &Value, context: &Value) {
        match value {
            Value::Object(map) => {
                if let Some(Value::String(reference)) = map.get("$ref") {
                    let (file, pointer) = reference.split_once('#').unwrap_or((reference, ""));
                    let target = match file {
                        "" => owner,
                        "../memory/draft-v1.schema.json" => draft,
                        "../context/capsule-v1.schema.json" => context,
                        _ => panic!("unbundled reference"),
                    };
                    assert!(target.pointer(pointer).is_some());
                }
                for child in map.values() {
                    walk(child, owner, draft, context);
                }
            }
            Value::Array(a) => {
                for child in a {
                    walk(child, owner, draft, context);
                }
            }
            _ => {}
        }
    }
    walk(&schema, &schema, &draft, &context);
    let expected: Value = serde_json::from_str(include_str!(
        "../../../tests/fixtures/provider/mock-response-v1.json"
    ))
    .unwrap();
    let shape = &schema["$defs"]["response"];
    assert_eq!(shape["additionalProperties"], false);
    for key in expected.as_object().unwrap().keys() {
        assert!(shape["properties"].get(key).is_some());
    }
    assert!(
        schema["$defs"]["toolResult"]["oneOf"][0]["properties"]
            .get("memory_id")
            .is_none()
    );
}
