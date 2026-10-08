# B4 C06 unit, zone and timestamp-literal comparison — partial

Date: 2026-10-07. Runtime baseline: `b44a3ca` plus the migration flag below. The [recorded comparison](B4/literal-comparison.json) has 49 synthetic archive cases and 37 checks. It finishes the wrong-unit/time-zone part of C06 at the ActivityData layer and records **twelve investigated but not waived differences**. It does not sign off C06, B4 or production readiness.

The [harness](../../scripts/compare-activity-literals.mjs) copies only the public `src/lib/activity.ts` validator from an explicitly selected reference checkout into a temporary directory. It records that file's revision, hash and clean status and confirms the original is unchanged. Each case changes one field of the published fixture. The copied `validateActivity` and the copied release runner's `migration-inspect` then judge the same bytes. When both accept, the canonical public-data hashes must be equal. No collector, receiver, publisher, transport, personal archive or credential is used, and no reference code enters the Runtime build, tests or package.

| Group | Cases | Result |
|---|---|---|
| Control | Canonical fixture | Both accept; identical canonical hash matches the fixture serializer; no flag |
| Wrong `metric` | Other source's unit, changed case, omitted; each source | All 9 rejected by both |
| Wrong `timezone` | Swapped literal (Codex relabelled `Asia/Shanghai`, GitHub `Asia/Shanghai`, Claude `Codex`), `UTC`, `+08:00`, changed case, omitted; each source | All 15 rejected by both |
| Non-canonical `updatedAt` both accept | No milliseconds, explicit `+08:00` offset, date only; each source | Same canonical hash; the original string is retained, and Runtime flags it as unpublishable |
| `updatedAt` both reject | Leading whitespace; each source | Rejected by both |
| **Unresolved** | Local time without zone, RFC 1123 date, hour 24, `2026-02-30`; each source | Legacy `Date.parse` accepts; Runtime refuses the seed |

The unit and zone matrix agrees exactly. Neither validator lets a source change its metric or date boundary, and in particular neither relabels Codex days to Beijing time.

## Migration flag for unpublishable retained times

Architecture v0.3 section 7 notes that ActivityData accepts a broader `updatedAt` than the manifest's exact `toISOString()` check on derived `succeededAt`. It requires migration to flag such a seed for explicit reconciliation rather than restamp it. Before this change, a seed whose retained Codex time was `2026-09-25` passed both `migration-inspect` and `migration-import`. The first sync with a failed Codex source then stopped at `unpublishable_history` (exit 6) without reserving a sequence. That was safe, but it came after the store had been created.

The inspection now lists such sources in `unpublishableSuccessTimes` without changing the retained string. `migration-import` refuses the seed with exit 6 and state `unpublishable_history` before writing anything. Neither command restamps the time. The operator reconciles a reviewed seed copy under the [migration runbook](../ACTIVITY_MIGRATION_v0.3.md). New Rust tests cover the store inspection for three shapes, refusal before any generation write, and the CLI report and import state.

## Unresolved differences

| Shape | Legacy result | Runtime result |
|---|---|---|
| `2026-09-26T08:00:00` (no zone) | Accepted, read in the host's local zone | Refused |
| `Sat, 26 Sep 2026 08:00:00 GMT` | Accepted | Refused |
| `2026-09-26T24:00:00.000Z` | Accepted as the next midnight | Refused |
| `2026-02-30T08:00:00.000Z` | Accepted, rolled to March | Refused |

Each shape fails the manifest's exact check on any retained success time, so the old publisher could not have published one as a failed source's time either. Both producers emit `toISOString()`, so real seeds are expected to contain none. That expectation needs the O1/O4 inventory, not this synthetic report. Architecture section 9's closed list does not name these differences, so they stay open beside the two GitHub frozen-comparison differences. Runtime behaviour is unchanged for them.

Reproduce after building the release runner, with Node 24.15.0:

```powershell
node scripts/compare-activity-literals.mjs `
  --reference-root 'C:\Dev\Moriium' `
  --binary 'C:\Dev\Runtime\target\release\enouia-activity.exe' `
  --report 'C:\Acceptance\new-literal-report.json'
```

All paths must be absolute, and the report file must be new. Batch-level timestamp checks remain covered by the contract tests and frozen comparison. Strict refusal of unknown archive fields (`ArchiveExtraFields`) compared with legacy discarding is not part of this matrix.
