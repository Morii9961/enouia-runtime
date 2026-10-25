use enouia_usage::adapter::{Codex, Models, Record, Vector, claude, unique};
use enouia_usage::identity::IdentityKey;
use serde_json::{Value, json};

fn models() -> Models {
    Models::new(&[
        "synthetic-sol".into(),
        "synthetic-claude".into(),
        "codex-auto-review".into(),
    ])
    .unwrap()
}
fn vector(input: u64, cached: u64, output: u64, reasoning: u64) -> Value {
    json!({"input_tokens":input,"cached_input_tokens":cached,"output_tokens":output,"reasoning_output_tokens":reasoning,"total_tokens":input+output})
}
fn event(v: Value, second: u8) -> Value {
    json!({"timestamp":format!("2030-02-03T16:00:{second:02}Z"),"type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":v.clone(),"last_token_usage":v}}})
}
fn meta(id: &str) -> Value {
    json!({"type":"session_meta","payload":{"id":id,"cli_version":"0.158.0-alpha.2","cwd":"FICTIONAL_PRIVATE_PATH","body":"DO_NOT_EXPORT_BODY"}})
}
fn context(effort: &str) -> Value {
    json!({"type":"turn_context","payload":{"model":"synthetic-sol","effort":effort,"cwd":"FICTIONAL_PRIVATE_PATH"}})
}

#[test]
fn cumulative_only_copies_are_one_chain_and_subsets_are_not_added() {
    let key = IdentityKey::from_bytes([7; 32]);
    let m = models();
    let lines = [
        meta("fictional-session"),
        context("high"),
        event(vector(0, 0, 0, 0), 0),
        event(vector(100, 60, 20, 5), 1),
        event(vector(150, 80, 30, 8), 2),
    ];
    let scan = || {
        let mut a = Codex::new(&key, &m);
        lines
            .iter()
            .filter_map(|l| a.push(l).unwrap())
            .collect::<Vec<_>>()
    };
    let a = scan();
    let archive = scan();
    let all = unique(a.iter().chain(&archive)).unwrap();
    assert_eq!(all.len(), 3);
    let mut total = 0_u64;
    for item in all {
        if let Record::Step {
            before,
            after,
            fact,
        } = item.record
        {
            total += after
                .total
                .sub(&before.total)
                .unwrap()
                .as_str()
                .parse::<u64>()
                .unwrap();
            assert!(fact.counts.get("input_uncached").is_none());
            assert!(fact.counts.get("input_cache_write_unknown").is_none());
            assert_eq!(fact.observed_date.as_deref(), Some("2030-02-04"));
        }
    }
    assert_eq!(total, 180);
    let public = serde_json::to_string(&a).unwrap();
    for sentinel in [
        "fictional-session",
        "FICTIONAL_PRIVATE_PATH",
        "DO_NOT_EXPORT_BODY",
    ] {
        assert!(!public.contains(sentinel));
    }
}

#[test]
fn last_snapshot_is_diagnostic_only_and_model_switch_is_conservative() {
    let key = IdentityKey::from_bytes([1; 32]);
    let m = models();
    let mut a = Codex::new(&key, &m);
    for l in [
        meta("switch"),
        context("high"),
        event(vector(0, 0, 0, 0), 0),
    ] {
        a.push(&l).unwrap();
    }
    let first = a.push(&event(vector(100, 50, 10, 3), 1)).unwrap().unwrap();
    if let Record::Step { fact, .. } = first.record {
        assert_eq!(fact.effort, "high");
        assert_eq!(fact.effort_evidence, "inferred");
    } else {
        panic!("expected step");
    }
    a.push(&context("xhigh")).unwrap();
    let switched = a.push(&event(vector(150, 60, 20, 6), 2)).unwrap().unwrap();
    if let Record::Step { fact, .. } = switched.record {
        assert_eq!(fact.model, "unknown");
        assert_eq!(fact.effort, "unknown");
        assert!(a.last_mismatch);
    } else {
        panic!("expected step");
    }
    let stable = a.push(&event(vector(200, 70, 30, 8), 3)).unwrap().unwrap();
    if let Record::Step { fact, .. } = stable.record {
        assert_eq!(fact.effort, "xhigh");
        assert_eq!(fact.counts.get("input_total").unwrap().as_str(), "50");
    }
    let mut other = Codex::new(&key, &m);
    other.push(&meta("other-session")).unwrap();
    let first = other
        .push(&event(vector(100, 50, 10, 3), 1))
        .unwrap()
        .unwrap();
    assert!(matches!(first.record, Record::Checkpoint { .. }));
}

#[test]
fn count_rollback_disorder_and_conflicting_copy_fail_explicitly() {
    let key = IdentityKey::from_bytes([2; 32]);
    let m = models();
    let mut a = Codex::new(&key, &m);
    a.push(&meta("rollback")).unwrap();
    a.push(&event(vector(100, 50, 10, 3), 1)).unwrap();
    assert!(a.push(&event(vector(20, 0, 1, 0), 2)).is_err());
    assert!(a.push(&event(vector(200, 60, 20, 4), 0)).is_err());
    let mut bad = vector(100, 101, 10, 3);
    assert!(Vector::read(&bad).is_err());
    bad["cached_input_tokens"] = json!(1);
    bad["reasoning_output_tokens"] = json!(11);
    assert!(Vector::read(&bad).is_err());
    let mut a = Codex::new(&key, &m);
    a.push(&meta("fork")).unwrap();
    let item = a.push(&event(vector(0, 0, 0, 0), 0)).unwrap().unwrap();
    let mut conflict = item.clone();
    conflict.record = Record::Checkpoint {
        vector: Vector::read(&vector(1, 0, 0, 0)).unwrap(),
    };
    assert!(unique([&item, &conflict]).is_err());
}

fn message(usage: Value) -> Value {
    json!({"type":"assistant","timestamp":"2030-02-03T15:59:59Z","sessionId":"private-session","requestId":"fictional-request","message":{"id":"fictional-message","model":"synthetic-claude","usage":usage,"content":[{"text":"DO_NOT_EXPORT_BODY"}]}})
}
#[test]
fn claude_counts_have_their_own_semantics_and_ttl_is_not_guessed() {
    let key = IdentityKey::from_bytes([3; 32]);
    let m = models();
    let raw = json!({"input_tokens":11,"cache_read_input_tokens":13,"cache_creation_input_tokens":12,"cache_creation":{"ephemeral_5m_input_tokens":5,"ephemeral_1h_input_tokens":7},"output_tokens":17});
    let item = claude(&message(raw.clone()), &key, &m).unwrap().unwrap();
    let Record::Message { fact, .. } = &item.record else {
        panic!("expected message");
    };
    assert_eq!(fact.counts.get("input_total").unwrap().as_str(), "36");
    assert_eq!(fact.counts.get("input_uncached").unwrap().as_str(), "11");
    assert_eq!(
        fact.counts.get("input_cache_write_1h").unwrap().as_str(),
        "7"
    );
    assert!(fact.counts.get("output_reasoning_subset").is_none());
    let mut unknown = raw.clone();
    unknown.as_object_mut().unwrap().remove("cache_creation");
    let item = claude(&message(unknown), &key, &m).unwrap().unwrap();
    let Record::Message { fact, .. } = item.record else {
        panic!("expected message");
    };
    assert_eq!(
        fact.counts
            .get("input_cache_write_unknown")
            .unwrap()
            .as_str(),
        "12"
    );
    assert!(fact.counts.get("input_cache_write_5m").is_none());
    let mut bad = raw;
    bad["cache_creation"]["ephemeral_1h_input_tokens"] = json!(8);
    assert!(claude(&message(bad), &key, &m).is_err());
}

#[test]
fn missing_is_not_zero_and_cross_store_message_identity_is_stable() {
    let key = IdentityKey::from_bytes([4; 32]);
    let m = models();
    let missing = message(json!({"input_tokens":11,"output_tokens":17}));
    let a = claude(&missing, &key, &m).unwrap().unwrap();
    let mut copy = missing.clone();
    copy["sessionId"] = json!("different-cowork-path-copy");
    let b = claude(&copy, &key, &m).unwrap().unwrap();
    assert_eq!(unique([&a, &b]).unwrap().len(), 1);
    let Record::Message { fact, .. } = &a.record else {
        panic!("expected message");
    };
    assert!(fact.counts.get("input_total").is_none());
    assert!(fact.counts.get("input_cache_read").is_none());
    let zero=claude(&message(json!({"input_tokens":11,"output_tokens":17,"cache_read_input_tokens":0,"cache_creation_input_tokens":0})),&key,&m).unwrap().unwrap();
    let Record::Message { fact, .. } = &zero.record else {
        panic!("expected message");
    };
    assert_eq!(fact.counts.get("input_total").unwrap().as_str(), "11");
    assert!(fact.counts.get("input_cache_read").unwrap().is_zero());
    assert!(unique([&a, &zero]).is_err());
    let encoded = serde_json::to_string(&a).unwrap();
    for text in [
        "fictional-request",
        "fictional-message",
        "private-session",
        "DO_NOT_EXPORT_BODY",
    ] {
        assert!(!encoded.contains(text));
    }
}

#[test]
fn unsupported_identity_and_private_model_never_become_public_labels() {
    let key = IdentityKey::from_bytes([5; 32]);
    let m = models();
    let mut value = message(json!({"input_tokens":1,"output_tokens":2}));
    value["message"]["model"] = json!("private-personal-name");
    let item = claude(&value, &key, &m).unwrap().unwrap();
    assert!(
        !serde_json::to_string(&item)
            .unwrap()
            .contains("private-personal-name")
    );
    value["message"].as_object_mut().unwrap().remove("id");
    assert!(claude(&value, &key, &m).is_err());
    let mut a = Codex::new(&key, &m);
    assert!(a.push(&event(vector(0, 0, 0, 0), 0)).is_err());
    let mut fork = meta("inherited");
    fork["payload"]["forked_from_id"] = json!("parent");
    assert!(a.push(&fork).is_err());
}

#[test]
fn synthetic_ccusage_daily_reference_is_comparison_only() {
    // ccusage's pinned report adds ordinary/read/create/output; never Codex subtraction.
    let report = json!({"inputTokens":11,"cacheReadTokens":13,"cacheCreationTokens":12,"outputTokens":17,"totalTokens":53});
    let calculated = [
        "inputTokens",
        "cacheReadTokens",
        "cacheCreationTokens",
        "outputTokens",
    ]
    .iter()
    .map(|k| report[*k].as_u64().unwrap())
    .sum::<u64>();
    assert_eq!(calculated, report["totalTokens"].as_u64().unwrap());
    let key = IdentityKey::from_bytes([6; 32]);
    let m = models();
    assert!(claude(&report, &key, &m).unwrap().is_none());
}
