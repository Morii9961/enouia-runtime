# AI Usage Ledger R3 — offline export and published conformance

2026-10-22, Asia/Shanghai. R0–R3 implementation is complete in the isolated Usage domain; code review and Morii's personal-data acceptance remain separate. This slice adds a Windows-only manual executable, aggregate export and inspection for reviewed corrections. It does not install, schedule, watch, price, send or change desktop/Activity/Memory state.

## Published protocol and output

GitHub confirms Dashboard PR #43 merged at `b66a472d04da3f7767dc5ba747ba1d5b9c494a9d`. [usage-pin.json](../integration/usage-pin.json) now points to that exact commit. All 43 mirrored public files match both the original SHA-256 freeze and the published Git objects; the checked-out consumer source also matches that commit before its validator is imported. The 1.1 schema hash remains `fd24d1061fab771c2a8968acd648c5ceac84e1f1cea1d7346d9ff1a6b2b35e2b`. The original R1 publication limitation is resolved; R1's historical record remains unchanged.

Runtime accepts the frozen 1.0/1.1 corpus and exports only 1.1 to preserve detailed quality/time reasons. Four actual synthetic Runtime exports—normal, conflicting revision with retained projection, disappeared source and Codex reset/checkpoint—pass Dashboard's published `parseUsage` Schema and semantic checks. Both implementations agree on all 39 fictional accepted/adversarial fixtures. The cross-repository check is read-only and requires an explicit checkout; normal Runtime compilation and tests remain independent of Dashboard.

Export constructs a closed allowlist from current fact projections under a read transaction. Decimal arithmetic remains exact above JavaScript's safe-integer range. Random aliases are stable within a ledger and separate by source. Unknown fields remain null/unknown. No raw transcript, source path, user ID, original request/message/session ID, key, database payload or machine identity enters the exchange. Only explicitly approved public model labels can leave the adapter.

Supported legacy sources have no proven request-start timestamp. All current facts therefore remain in the dataset-wide `unallocated` set, including observed dates outside the requested half-open range. Daily states are `not_collected`, with no fabricated zero/complete day. Quality explains missing request dates, unknown counts, resets, conflicting copies and retained history. Where the protocol's affected-object unit is unavailable, occurrences are null; different scopes are not added. The output enforces 2,000 aggregate rows and 1 MiB, rejects overflow instead of truncating, and never overwrites an existing destination. A failed I/O write can leave an incomplete destination for manual inspection.

Manual `init`, `scan`, `health`, `replay`, `candidates`, `inspect`, `resolve` and `export` commands live only in `enouia-usage`. See the [guide](../AI_USAGE_LEDGER.md). The CLI displays “导出只含聚合，不含源正文” and coverage/last completed scan. Candidate inspection returns normalized counts/dimensions so the owner can review a concrete correction before selecting its opaque digest. Replay does not restamp successful source acquisition. No command discovers personal roots automatically.

## Checks actually run

| Check | Actual result |
| --- | --- |
| `cargo test --offline --locked -p enouia-usage` | 25 pass; 3 intentionally ignored entries (subprocess entry, explicit scale trial, explicit cross-repository check). The crash parent invokes its child twice. |
| Explicit `dashboard_consumer_accepts_runtime_exports -- --ignored --exact --nocapture`, with `USAGE_DASHBOARD_CHECKOUT` set to the publisher checkout | Pass: 43 published files, 39 fixtures, 4 Runtime exports accepted. |
| `cargo clippy --offline --locked -p enouia-usage --all-targets -- -D warnings` | Pass, no source lint warnings; environment cache hard-link fallback remains. |
| `cargo fmt -p enouia-usage`; `git diff --check` | Pass. |
| Resolved Cargo metadata + `check-domain-boundaries.mjs ... --self-test` | Pass: 13 modules, isolated Usage domain, 14 negative dependency cases. |
| Existing `enouia-activity-contract` tests | 18 pass, including fixed public JSON bytes/privacy/sequence rules. |
| Existing `enouia-activity-runner` tests | 28 distinct tests pass after the focused retry described below, covering runner state, pending/sequence, recovery CLI and late replacement. |
| Baseline diff for all five Activity crates, `contracts/activity`, `apps/desktop`, Memory pin | Empty. No frontend/native build or UI suite rerun, because those files and their integration remain unchanged. |

The initial combined Activity regression encountered one pre-existing test fixture collision: `runner.rs` creates temporary names from process ID and wall-clock nanoseconds, and concurrent tests received the same value (`AlreadyExists` at source-directory creation). This happened before the functional assertion. The whole affected 13-test file passed with `--test-threads=1`; no Activity code, fixture cleanup or timestamp logic was changed. The initial combined command therefore was not itself a clean pass. Other executed Activity files passed on that first run.

Raw Usage test and conformance output is retained locally in ignored `target/usage-R3-tests.txt` and `target/usage-R3-conformance.txt`. This document records the durable commands/results without publishing local filesystem paths. After that full run, the focused reviewed-revision and corruption/version tests and strict Clippy passed again for the final review-invalidation and unsupported-store-version rules. R2's two explicit release scale runs cover 100,000 distinct observations and 1,000,000 total/100,000 distinct observations, about 21 MiB peak working set. Those figures describe the R2 baseline; they were not rerun after R3's small ingestion change that invalidates a selected variant when new contradictory evidence arrives. Their exact times/method/hardware are in [R2 evidence](AI-usage-ledger-R2.md).

New focused checks prove fixed-generation-metadata byte identity across rescans, exact large decimal aggregation, dataset-wide unallocated behavior, independent aliases, fixed errors without source-path echo, reviewed downward replacement (103 input tokens to 13, without summation), renewed conflict after future contradictory evidence, retained history after disappearance, reset boundaries without bridging, checkpoint non-attribution, exclusive new-file output and refusal of 2,001 groups without a partial file. Privacy checks use explicit body/ID/path sentinels. This is synthetic evidence, not acceptance of every historical CLI shape or personal account reconciliation.

## Handoff boundary

Morii can review the draft PR and [manual guide](../AI_USAGE_LEDGER.md), then separately select a small real source range/root for personal acceptance. Current formats cannot promise exact daily attribution, unsupported compressed histories are diagnosed, concurrent writers can make source files unreadable, and custom sync-folder locations require owner judgment. Physical power-loss recovery, one million distinct persistent identities, private historical completeness, signing/distribution and real-provider behavior remain untested. Production scheduling, live watching, VPS upload, pricing/FX, Memory integration and R4 are outside this delivery.
