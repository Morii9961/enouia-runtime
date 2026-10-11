# Activity: write-path audit cost and the summary audit (ADR-034)

Date: 2026-10-11. Branch `claude/activity-audit-scale`, stacked on `f523a070f3fc363905b33590a25b42a5b1bf2fd3` ([PR #35](https://github.com/Morii9961/enouia-runtime/pull/35)). Scope: the Activity store's recovery audit and `recovery-inspect`. [ADR-034](../adr/034-summary-audit-of-older-generations.md) is **proposed and takes effect only if the owner merges it**. J1/B4 remain partial and B5 is inactive.

## Gap

Every write audits every retained generation, and nothing prunes generations (ADR-014/018). The previous audit read and validated each unselected generation in full. On a synthetic one-year archive (365 days per source), each audit cost about 1.2 ms per retained generation. An hourly schedule keeps about 8,760 generations a year, and a sync runs three or four audits. After one year that would add 35–40 seconds of auditing to every run, and the cost keeps growing.

## Change

The write path now judges an unselected generation from its strictly parsed manifest and its hash-checked, canonical `sequence.json`:

- A higher reservation blocks.
- A lower reservation is older.
- An equal reservation compares the recorded archive and pending hashes with CURRENT's.

A full read happens only when the reservation and archive are equal but the pending bytes differ. In that case the existing recorded-clear rules for a publication receipt or an ADR-033 abandonment decide.

Manifest or sequence corruption, unknown entries and CURRENT's own validation still block or fail as before. Damage confined to an older generation's archive, pending or delivery file no longer blocks writing. `recovery-inspect` still validates every generation in full, reports such damage as `damagedOlderGenerations`, and loads blocking generations in full for their evidence. `recovery-retract` still requires the target to validate in full.

Changed files:

- `generation.rs`: shared canonical sequence and manifest parsers, plus `GenerationSummary`.
- `reader.rs`: `read_generation_summary`.
- `recovery.rs`: the summary-based classification.
- `reconcile.rs`: full validation in inspection, plus the retraction requirement.
- The runner CLI output field.
- ADR-034, the ADR register, the B2.1 note and the runner documentation.

## Results

| Retained generations | Previous audit | Summary audit |
| --- | --- | --- |
| 100 | 161 ms | 27 ms |
| 1,000 | 1,188 ms | 133 ms |
| 2,000 | 2,322 ms | 235 ms |
| 4,380 | 5,034 ms | 501 ms |
| 8,760 | 10,353 ms | 1,205 ms |

The [measurement](Activity-claude-audit-scale/scale.json) comes from [`scripts/claude-activity-audit-scale.mjs`](../../scripts/claude-activity-audit-scale.mjs). It reports the minimum of three `diagnostics` runs, each one full audit, with the previous release runner `c762ccaa…` and the new one `bcc8b9cc…` on the same root.

The harness imports the one-year archive and writes further valid generations directly. Each is a byte copy under its own id and manifest. Two earlier runs grew a root through real pause commits. One stopped at 4,380 generations: 5,349 / 687 ms. The other was stopped once its marks agreed with direct synthesis: 1,218 / 160 ms at 1,000 generations, against 1,134 / 127 ms synthesized. Real commits are much slower to accumulate, because each commit is itself an audit. Those runs are preparation and are not committed.

The [test record](Activity-claude-audit-scale/tests.json) has the 4 new store tests:

- An exclusively locked older archive no longer stops a commit.
- A damaged older archive is reported only by inspection.
- A tampered older `sequence.json` (`HashMismatch`) or manifest hash (`InvalidManifest`) still blocks.
- A higher orphan with a damaged archive blocks and cannot be retracted.

The same tests against the previous `recovery.rs` fail **0/4**. The first two are the intended behavior change. The last two still block under the old audit; they fail only on the error classification, which the old audit reported as `HashMismatch` and `CorruptGeneration`.

A first attempt to record the tests ran a stale debug build. Restoring the new `recovery.rs` with `Copy-Item` had kept an older modification time, so cargo did not rebuild. The sources were touched and every test was rerun before recording.

As a regression run, the process-death [orphan drill](Activity-claude-audit-scale/orphan-regression.json) from PR #31 passes **82/82** on the new runner and a rebuilt crash writer.

Additional checks with Rust 1.98.1 GNU, UCRT64 first on PATH, offline:

- `cargo fmt --all -- --check`
- `cargo test --locked --workspace`: 247 passed.
- `cargo clippy --locked --workspace --all-targets -- -D warnings`
- `node scripts/check-activity-evidence.mjs --self-test`
- `git diff --check`

C12 links 86 selectors: the 4 tests and the 82 regression checks. Index: **77 reports / 1,543 selectors / 85 negative checks**. All rows remain partial.

| File | SHA-256 |
| --- | --- |
| `tests.json` | `0e975d42d3567eaa2726ecc63e76580dfd608b3791aa1f470fe2a9228358be43` |
| `scale.json` | `b334d46cc06961dc781fa9112aaad7f7db21a0767fbc433f0f0acab5ee3620c4` |
| `orphan-regression.json` | `b55c74d080cbd56120b6bc2d51e61adc49b573a29df494b9cf6c21d12993b087` |
| `proof.json` | `52a35c8d4752b7e28e6912f5ae2406bd5c4e8f6cebb496e5dcde22ea2004bd14` |

## Limits

Timings come from one Windows workstation with a warm cache. Synthesized generations share one reservation and archive. A real history's archive also grows, which raised the previous audit's cost further and leaves the summary audit's cost unchanged. The audit remains linear in retained generations, so pruning under ADR-018 is still the way to bound it. No personal data, account, credential, task, live delivery or deployment was involved.
