# B4 fixed-input comparison and investigated differences

Update (2026-10-07): [ADR-029](../adr/029-claude-retains-higher-days.md) withdrew the Claude downward-correction policy after real-account evidence. A fresh run of the unchanged harness against the same reference revision is recorded in [frozen-comparison-v2.json](B4/frozen-comparison-v2.json): 23 exact matches (now including `C03-claude-down`), three policy differences, two clock refusals and the same two unresolved GitHub differences. The report below describes the 2026-10-01 run.

Date: 2026-10-01. Runtime baseline: `6b98d40`. The [recorded comparison](B4/frozen-comparison.json) has 30 synthetic fixed-clock cases: 22 exact matches, four known policy differences, two deliberate clock refusals, and **two investigated but not waived differences**. This is partial B4 evidence, not a full C01–C18 sign-off or production readiness claim.

The [pure Rust fixture bridge](../../crates/enouia-activity/examples/frozen_activity.rs) compiles as an example and invokes the actual GitHub/Codex/Claude parsers, historical merge, batch normalization, and canonical serializer. It reads bounded JSON on stdin, uses a fake clock, and emits only the normalized batch, hash, and local merge deltas. No collector process, authentication, filesystem state, sequence allocation, or transport is added to production. It is not included in the Activity installation package.

The [optional development harness](../../scripts/compare-frozen-activity.mjs) copies nine explicitly named public reference source files to an isolated temporary directory, records their SHA-256/revision/dirty state, and checks the originals remain unchanged. It calls the actual old import, date merge, contract, receiver, and publisher functions. The old collector's pure orchestration is reproduced from its recorded source: per-store aggregation, acquisition filtering, `retainHigher` for Claude, failure retention, and derived source outcomes. The old collector executable and its credential/network paths are never invoked. Runtime build, regular tests, and packages do not import that checkout.

Each case fixes the reports, prior archive, attemptedAt, clock, and sequence for both implementations. Reports record per-source full daily values, missing/added/revised/retained dates, exact decimal totals, units/zones, updatedAt, attemptedAt/result/derived succeededAt, and merge deltas. Comparisons use semantic object equality; JSON key order is not a mismatch. Both normalized envelopes are then passed to distinct real reference receiver/publisher roots. Matching cases must have equal whole batches and canonical public hashes. Every Runtime publisher output must match the hash from its actual Rust serializer and exact source metadata. Private sentinels are absent from bridge output.

Cases cover normal three-source success, rolling history retention, corrected values, each separate failure/all failures/null history, fresh unchanged/zero reports, malformed empties, impossible/duplicate/leap dates, negative/unsafe values and sums, unsupported Codex acquisition, missing/mismatched lifetime, Claude cache/reasoning/disjoint-store aggregation/report totals, clock/local-date rollback, AI admission floor/retention of older known dates, future response filtering, and privacy sentinels. Store discovery failures and process protocols remain in the existing dedicated B1 Windows tests; this bridge compares supplied reports, not live stores or CLIs.

Known policy differences match Architecture section 9: a validated Claude downward correction replaces 50 with 40 rather than keeping the legacy maximum (Runtime total delta -9 including the added zero/one day); missing Codex lifetime retains the old source; inconsistent Claude report totals retain the old aggregate; AI days before 2026-01-01 are not newly admitted; and clock/end-date regression blocks the entire Runtime merge rather than deleting/restamping history. Other sources must remain equal in each source-specific difference case.

| Not yet accepted difference | Root cause and observed result | Current Runtime decision |
|---|---|---|
| `C06-duplicate-github-date` | Legacy `importGitHub` passes duplicate dates through; `mergeActivityDays` overwrites the first reported value with the last before validation. It publishes 9 for the duplicate 2026-09-25 day. Runtime rejects the raw calendar and retains the prior source/time. | Keep the existing fail-closed parser. Architecture section 7 forbids duplicate dates; no behavior change made. |
| `C06-unsafe-github-sum` | Legacy validates each value but not the combined source total. With individually safe values and retained history, it publishes a total of 9,007,199,254,740,995. Runtime rejects the unsafe report and retains the prior total 3. | Keep checked safe arithmetic required by Architecture section 7. Do not round values or accept an unsafe aggregate. |

Investigation establishes that the Runtime behavior follows the normative contract and the legacy paths accept these invalid reports. The closed deliberate-difference list does not currently name these two paths. They remain explicitly recorded for B4 acceptance; this report does not silently add a policy waiver, change public source meaning, modify Moriium, or activate a new ADR.

Reproduce with installed Rust 1.98.1/Node 24.15.0:

```powershell
cargo build --release -p enouia-activity --example frozen_activity
node scripts/compare-frozen-activity.mjs `
  'C:\Dev\Moriium' `
  'C:\Dev\Runtime\target\release\examples\frozen_activity.exe' `
  'C:\Acceptance\new-frozen-report.json'
```

All paths must be absolute, the report parent must exist, and its file must be new. The bridge/helper and reference source hashes plus input fixture hashes are in the report. The first diagnostic run exposed a harness key-order comparison error despite identical canonical hashes; semantic equality fixed that error before these results were recorded. The final report correctly remains `completed_with_unresolved_differences`, rather than claiming all cases passed.

Checks: Node syntax, all 30 comparison/isolated-publication cases, offline Rust fmt, full workspace tests (160 tests), clippy across all targets with warnings denied, release example build, evidence privacy/schema/link checks, and `git diff --check`. No dependencies were added. Full rollback/kill/disk-full/SSH/consumer/scheduler/live-inventory evidence and the two difference acceptances remain outstanding under the migration runbook.
