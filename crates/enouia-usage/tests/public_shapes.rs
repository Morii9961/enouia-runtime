//! Public upstream test data, not personal logs or a historical-format guarantee.
use enouia_usage::Error;
use enouia_usage::adapter::{Codex, Models, Record, Vector, claude, unique};
use enouia_usage::identity::IdentityKey;
use serde_json::{Value, json};

#[test]
fn upstream_claude_counts_work_only_with_explicit_assistant_identity() {
    let key = IdentityKey::from_bytes([91; 32]);
    let models = Models::new(&[]).unwrap();
    let rows: Vec<Value> = include_str!("fixtures/ccusage-v20.0.20/claude.jsonl")
        .lines()
        .map(|l| serde_json::from_str(l).unwrap())
        .collect();
    let mut observations = Vec::new();
    for (mut row, (input, output, read, write)) in
        rows.into_iter()
            .zip([(100, 50, 10, 25), (200, 75, 20, 50), (300, 125, 40, 0)])
    {
        // The public reporting fixture omits type; do not silently infer it.
        assert!(claude(&row, &key, &models).unwrap().is_none());
        row["type"] = json!("assistant"); // Explicitly synthetic augmentation.
        let observation = claude(&row, &key, &models).unwrap().unwrap();
        let Record::Message { fact, .. } = &observation.record else {
            panic!("expected message")
        };
        assert_eq!(
            fact.counts.get("input_uncached").unwrap().as_str(),
            input.to_string()
        );
        assert_eq!(
            fact.counts.get("input_total").unwrap().as_str(),
            (input + read + write).to_string()
        );
        assert_eq!(
            fact.counts.get("output_total").unwrap().as_str(),
            output.to_string()
        );
        assert_eq!(
            fact.counts.get("input_cache_read").unwrap().as_str(),
            read.to_string()
        );
        assert_eq!(
            fact.counts
                .get("input_cache_write_unknown")
                .unwrap()
                .as_str(),
            write.to_string()
        );
        assert!(fact.counts.get("output_reasoning_subset").is_none());
        assert_eq!(fact.model, "unknown");
        let serialized = serde_json::to_string(&observation).unwrap();
        for forbidden in [
            "msg-alpha",
            "req-alpha",
            "session-alpha",
            "costUSD",
            "speed",
        ] {
            assert!(!serialized.contains(forbidden));
        }
        observations.push(observation);
    }
    assert_eq!(
        unique(observations.iter().chain(&observations))
            .unwrap()
            .len(),
        3
    );
}

#[test]
fn upstream_codex_report_fixture_cannot_be_promoted_to_conserved_ledger_usage() {
    let key = IdentityKey::from_bytes([92; 32]);
    let models = Models::new(&[]).unwrap();
    let mut adapter = Codex::new(&key, &models);
    for line in include_str!("fixtures/ccusage-v20.0.20/codex.jsonl").lines() {
        let row: Value = serde_json::from_str(line).unwrap();
        if row["type"] == "turn_context" {
            assert!(adapter.push(&row).unwrap().is_none());
        } else {
            // No session_meta, and the sample total adds reasoning to output.
            assert_eq!(adapter.push(&row).unwrap_err(), Error::UnsupportedSource);
            assert_eq!(
                Vector::read(&row["payload"]["info"]["total_token_usage"]).unwrap_err(),
                Error::InvalidCounts
            );
        }
    }
}
