# AI Usage Ledger R1 — synthetic adapter and contract evidence

Date: 2026-10-21, Asia/Shanghai. Scope: new independent `enouia-usage` crate, frozen public exchange artifacts, and dependency classification. No source scanner, personal roots, SQLite ledger, installed runner, desktop integration, scheduler, price/FX lookup or sender exists in this slice.

## Protocol handoff

The owner retained the requirement for detailed quality reasons and authorized messaging the Dashboard chat. Its author confirmed UsageSnapshot 1.1 Schema/fixtures/SHA frozen, while explicitly reporting Git commit/push not executed. The source remains the publisher's content-hash frozen local bundle, not a new Runtime format. [usage-pin.json](../integration/usage-pin.json) records that publication limitation and hashes all 43 mirrored public files. Upstream base `fede141` contains 1.0 only; it must not be cited as the 1.1 commit.

The 1.1 extension supplies 15 finite reasons, affected-object units, explicit dataset-wide unallocated measurements and no inferred request-start dates. Unknown request dates do not enter Shanghai daily/weekly usage. Both 1.0 and 1.1 fictional corpora are mirrored unchanged in `contracts/usage/dashboard/`; Runtime implements its own closed structural and semantic validation rather than executing Dashboard code at runtime.

## Implementation and source limits

- Decimal strings support exact nonnegative counts up to 78 digits, checked addition/subtraction, null propagation, input conservation and reasoning subsets. JSON byte/depth limits precede DOM parsing.
- Codex uses cumulative-vector differences only. Last snapshots are diagnostic; conflicting copies, time reversal, reset/subset errors and unsupported forks are explicit refusals. A first checkpoint is retained as a checkpoint, not attributed to its observation date. Stream graph reconciliation and persistent revisions belong to R2.
- Turn context is not direct request metadata. Stable supported context can identify an inferred effort; an interval crossing contexts becomes unknown. Model labels come only from an explicitly approved public label list; source strings outside it become unknown. No source IDs, paths or body text appear in normalized observations.
- Claude ordinary/read/write/output semantics are separate. Explicit 5m/1h counts reconcile with creation totals; unknown-duration writes and missing writes are not forced to 5m or zero. Reasoning detail is unavailable for this supported Claude shape. IDs are keyed digests across stores; changed observations require explicit conflict treatment, not a maximum rule. The pinned synthetic ccusage report is a comparison only, never additional ledger usage.
- HMAC-SHA256 uses domain/length-separated inputs; only random-key persistence is left to R2. The test key and all source fixtures are fictional.

Primary Codex source reviewed at `c7234c1174b27d9c55199fba0d546dc27d1b0415`: [protocol types](https://github.com/openai/codex/blob/c7234c1174b27d9c55199fba0d546dc27d1b0415/codex-rs/protocol/src/protocol.rs), particularly TokenUsage/TokenUsageInfo, SessionMeta and TurnContextItem. The code confirms cache-write presence varies, cumulative append behavior, and context-window fill observations that must fail usage conservation. This does not establish every private historical CLI version. Claude evidence remains the fixed ccusage source documented in [R0](../AI_USAGE_LEDGER_R0.md).

## Checks actually run

Commands prepend the installed Cargo bin directory to the current process PATH only; no system environment is changed.

| Command | Result |
| --- | --- |
| `cargo test --offline --locked -p enouia-usage` | 12 Rust tests pass, including a loop over all 39 frozen protocol fixture outcomes and their hashes |
| `cargo fmt -p enouia-usage` | Completed |
| `cargo clippy --offline --locked -p enouia-usage --all-targets -- -D warnings` | Pass; no source-code lint warnings |
| `cargo metadata --offline --locked --format-version 1` then `node scripts/check-domain-boundaries.mjs target/usage-domain-metadata.json --self-test` | Pass: 13 modules, unchanged five Activity/five frozen Core/two shared modules, one Usage domain, no Memory packages; 14 negative dependency cases |

Host: Windows x64, Rust 1.98.1 GNU. Cargo reports an incremental-cache hard-link fallback; it copies instead and tests complete. Initial shell PATH lacked Cargo. An attempted optional `jsonschema` dependency could not resolve `ahash` offline and was removed; no package was installed and the final crate adds no registry dependencies. Runtime's explicit closed shape/semantic implementation is tested against the frozen corpora. `cargo clippy --fix` could not start its local lock-server socket (10013), so lint changes were made manually and ordinary strict Clippy passed. These early failures are not passing checks.

File/security scanning, persistent history/replay/corrections, crash/reopen, million-event memory regression and actual allowlisted export are R2/R3 work, not accepted by these tests. Desktop and existing Activity runtime suites are not rerun for this isolated slice; the existing production paths/pin are unchanged and the dependency guard prevents new reachability. Real-provider, personal-log, production and human acceptance remain unperformed and unauthorized.
