use serde_json::Value;

fn schema(name: &str) -> Value {
    let text = match name {
        "activity-data-v1.schema.json" => {
            include_str!("../../../contracts/activity/activity-data-v1.schema.json")
        }
        "batch-v1.schema.json" => include_str!("../../../contracts/activity/batch-v1.schema.json"),
        "common-v1.schema.json" => include_str!("../../../contracts/ipc/common-v1.schema.json"),
        "activity-v1.schema.json" => include_str!("../../../contracts/ipc/activity-v1.schema.json"),
        _ => panic!("unexpected schema reference: {name}"),
    };
    serde_json::from_str(text).expect("schema must be JSON")
}

fn walk(value: &Value, current: &str) {
    match value {
        Value::Object(map) => {
            if let Some(reference) = map.get("$ref").and_then(Value::as_str) {
                let (path, fragment) = reference.split_once('#').unwrap_or((reference, ""));
                let target_name = if path.is_empty() {
                    current
                } else {
                    path.rsplit('/').next().expect("schema filename")
                };
                let target = schema(target_name);
                assert!(
                    target.pointer(fragment).is_some(),
                    "unresolved {reference} in {current}"
                );
            }
            for child in map.values() {
                walk(child, current);
            }
        }
        Value::Array(items) => {
            for item in items {
                walk(item, current);
            }
        }
        _ => {}
    }
}

#[test]
fn all_schema_refs_resolve_to_bundled_contracts() {
    for name in [
        "activity-data-v1.schema.json",
        "batch-v1.schema.json",
        "common-v1.schema.json",
        "activity-v1.schema.json",
    ] {
        let value = schema(name);
        assert_eq!(
            value["$schema"],
            "https://json-schema.org/draft/2020-12/schema"
        );
        walk(&value, name);
    }
}
