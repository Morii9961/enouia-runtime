# Context contract and pure assembly validation

Date: 2026-10-01. Status: capsule/budget contract and pure ranked assembly implemented; full A2 retrieval/Provider/orchestration pending.

Eight offline tests pass. They verify exact canonical selections/provenance, actual provider-byte serialization and UTF-8 budgeting, frozen estimate 2,427, stable rank ties, conflicting classification refusal, whole-record budget exclusion/base refusal, inactive/duplicate/missing proposal exclusion, changed memory/turn refusal, derived open loops, forged estimates, wrong sections, closed Activity-field refusal and bundled schema/fixture integrity. Schema checks are not a complete Draft 2020-12 validator.

Commands: `cargo test -p enouia-context`; full `cargo test --workspace` (203 passed); `cargo clippy --workspace --all-targets -- -D warnings`; `cargo fmt --all -- --check`; `git diff --check`. This crate depends only on Memory, Session, serde and serde_json, with no Activity, filesystem, SQLite, network or real Provider dependency.

No real tokenizer, FTS query, personal corpus, actual model invocation, persisted actual-capsule history, UI or performance benchmark is claimed. Ranked inputs are synthetic; the future retrieval adapter must independently prove exact included/excluded IDs and ranking explanations.
