# B1 same-input legacy comparison

Date: 2026-09-27. Development-only comparison against the read-only Moriium checkout at `f338fcbfcd072f831c8b8b536e437edf0e4080e4`. The compared legacy files were `scripts/lib/activity-import.ts` (SHA-256 `01B0D5B2076B83DEC7CECB5A2CA2C785EA4D2CE7B45A55F18CA30790414CE308`), `scripts/lib/codex-usage.ts` (`1876E0B383CB1604F63AEE7C062A31504B0D964ABC0407DF2FED222215258826`), and `src/lib/activity.ts` (`6E13DC4D9D190F05032B6DB3432AEB5754877B321CA74012FBDC6FE4FE47B273`). The old collector's store aggregation and Claude `retainHigher` call were also inspected in `scripts/collect-activity.mjs` (`44F7CDABB0E75F140076C928E183351C1CB4CEE82C06665913193EA70A259266`).

`node scripts/compare-legacy-activity.mjs 'E:\Moriium'` runs the actual old GitHub, Codex, and per-store Claude import functions on the same synthetic source responses used by the Rust adapters. It reproduces the old collector's disjoint-store sum, then compares the normalized ActivityData against `tests/fixtures/activity/legacy-source-snapshots-v1.json`. Rust tests independently compare the new adapters and merge with that committed oracle. This script is an optional development check: Runtime packages, regular tests, and production collection have no Moriium dependency. No personal source report, credential, transcript, or Activity archive was read.

| Case | Legacy | Runtime | Result |
|---|---:|---:|---|
| GitHub 2026-09-25 / 26 | 2 / 0 | 2 / 0 | Equal |
| Codex 2026-09-25 / 26 | 10 / 0 | 10 / 0 | Equal |
| Claude, two stores, 2026-09-25 / 26 | 40 / 1 | 40 / 1 | Equal |
| Claude prior 50, incoming complete report 40 on 2026-09-25 | 50 | 40 | Deliberate correction difference; date retained, Runtime delta -9 including the new 2026-09-26 value 1 |
| Claude report daily sum 26, report total 27 | Accepts row | Rejects source | Deliberate stricter reconciliation |

The baseline comparison includes source timezone/metric literals, exact `updatedAt`, explicit zero days, and omission of synthetic private sentinels. It does not claim live CLI compatibility, scheduler behavior, migration readiness, or public deployment. The other deliberate differences in Architecture section 9 remain separate acceptance cases in the migration matrix.

Checks: the legacy Node comparison passed; `cargo fmt --all -- --check`, `cargo test --workspace` (71 tests), `cargo clippy --workspace --all-targets -- -D warnings`, and `git diff --check` passed offline with the installed Rust 1.98.1 GNU toolchain. No automatic task, upload, archive, Moriium file, or public deployment changed.
