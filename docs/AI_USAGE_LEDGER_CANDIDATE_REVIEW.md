# UsageSnapshot 1.0 candidate — Runtime R0 follow-up

Date: 2026-10-21 (Asia/Shanghai). This extends [R0](AI_USAGE_LEDGER_R0.md) with a read-only comparison of Dashboard's active local work. It does not adopt a protocol, amend the other repository, or start R1–R3.

## Newly available evidence

At inspection, Dashboard main was still `d0fb1c9708f52570f5a898ff65437c39669a6795`; the remote branches and usage PR search did not expose the new protocol. The active Dashboard worktree branch `codex/usage-ledger-mvp` contained untracked protocol Schema, SHA256 manifest, fixtures, checker and ADR-0006, alongside unrelated MVP edits. Its HEAD remained the old main. No immutable protocol commit was available to pin. Runtime PR #93 was open/draft at the earlier R0 commit; nothing was merged. These are inspection-time observations, not a claim that the other active worktree will remain unchanged.

The candidate files were read without modification. A bounded snapshot of public protocol code and fictional fixtures was copied into Runtime's ignored `target/` for the comparison. No installed tool, personal log, private data store, source account, network endpoint or other chat was invoked or messaged. The Dashboard checkout is a development reference only, never a Runtime build/runtime dependency.

Candidate identity:

- Schema SHA-256: `8684f0928da25413aae738fd15ea6afd7f84002ada0e0d49855c64e2e5a26ba4`.
- Manifest SHA-256 and checker-source hashes are recorded in the [sanitized result](validation/AI-usage-ledger-candidate-review.json).
- Twelve manifest entries verified: one Schema and eleven fictional fixtures. All eleven candidate fixture outcomes matched their valid/invalid names.
- Eleven additional behavioral probes passed: local source labels, local Shanghai-day rows, partial/missing days, revision encoding, unsupported quality/coverage fields, 30m cache conservation, nullable writes and unknown classification.
- All nineteen copied source/manifest/fixture files were re-read and remained byte-identical during the run. This is a bounded comparison observation, not a freeze guarantee for an active worktree.
- Environment: Windows x64, Node v24.15.0. No Runtime adapter was executed; **this is not cross-repository adapter conformance**.

## Candidate decisions that replace proposal assumptions

| Area | Candidate contract | Runtime implication after a freeze |
| --- | --- | --- |
| Snapshot mode | `mode: range_replacement`; half-open range; every day listed | Export complete selected ranges. Missing data needs an explicit day state; no delta or implied zero |
| Dataset identity | Random UUIDv4; one source per dataset, according to candidate ADR | Keep stable independent source aliases, rather than combining Codex and Claude under one dataset |
| Revision | Positive decimal string, at most 30 digits | Do not use the proposal's numeric revision or Activity sequence; explicit immutable revisions |
| Source | Top-level `codex_local/claude_local/account_daily/manual_aggregate` | Source is not a per-row field. Code/Cowork overlap is resolved locally within the Claude source union |
| Input buckets | Adds `input_cache_write_30m`; all count members required and nullable, at most 78 digits | Preserve nulls, exact large arithmetic and the extra exclusive bucket; do not serialize u64/JS numbers as the protocol's full numeric domain |
| Unknownness | `cache_detail`, `effort_evidence`, `classification`, day state, nullable counts | Most missing-field/attribution states have structured representations, without proposal-style free text |
| Classification | Explicit `service_tier/context_class/region`; unknown remains unknown | Region is another required fact. No default global/standard/short; known effort does not imply known classification |
| Time | `time_basis: request_start/shanghai_day/provider_day`; normalized local rows require `source_timezone: Asia/Shanghai` | Clarify whether source_timezone describes the normalized bucket, rather than the raw UTC event clock |
| Model | Bounded lowercase identifier, at most 80 characters | Unsafe/raw arbitrary text is not allowed. Exact unsupported identifiers must not be silently renamed to fit |
| Export limits | 1 MiB, 366 days, 2,000 rows, nesting depth 32 | These are candidate export budgets, not scanner budgets. A range may need explicit splitting; never drop rows to fit |

The existing private-store and independent-runner decisions remain applicable. Once frozen, the candidate's day and count fields can carry conservative partial data; they cannot certify an inventory that was never observed.

## Remaining integration decisions

1. **An immutable exchange package is still required.** Supply the Dashboard commit containing Schema, semantic checker, ADR, hash manifest, fixtures and offline command. Re-read those files at that exact commit and compare hashes; local byte stability is not an immutable revision. Do not amend/copy an in-progress Schema into Runtime's formal contracts.
2. **Time attribution needs a source-backed mapping.** Candidate ADR-0006 selects request start for local request facts, but local Codex token-count events can describe completion/observation time. A start timestamp cannot be invented from a cumulative checkpoint. `shanghai_day` is accepted by the candidate checker, but its permitted meaning for such events must be documented before choosing it. If an accepted fact has no defensible date, preserve it locally as unallocated coverage, not a fabricated dated row.
3. **General quality reasons have no candidate wire field.** The candidate rejects both row `quality_flags` and top-level `coverage` as extra fields. Existing fields convey cache/effort/classification unknownness and partial days, but do not distinguish counter resets, conflicting session copies, retained-but-missing logs or unallocated checkpoints. The original Runtime request asks for quality flags and missingness. Resolve whether these reasons stay local with a documented reduced export guarantee, or become a jointly versioned finite field. Do not add fields to a frozen 1.0 unilaterally, silently erase reasons, or publish free-text diagnostics.
4. **Supported source semantics remain a separate gate.** Candidate fixture acceptance does not establish Codex historical log compatibility, request identity/order, Claude missing-field presence, sidechain handling or streaming revisions. Those still need R1 synthetic source adapters and primary-source evidence, plus the narrow ADR-035 Claude parser exception.

## Verification scope and next action

The [result JSON](validation/AI-usage-ledger-candidate-review.json) records exact hashes and all 22 candidate outcomes. Follow-up documentation checks passed for three files and 28 relative file links; result identities/counts and ten protected tracked path groups were checked, and `git diff --check` passed. These are inspection probes, not tests of a Runtime parser/exporter, ledger crash recovery, file security, scale, desktop, personal data or production. No formal UsageSnapshot Schema or fixture has been added to Runtime.

After Dashboard commits the protocol and the two semantic mappings above are resolved, resume the R1 activation review in [ADR-035](adr/035-ai-usage-ledger.md). Existing ActivityData, archive, pending/sequence, scheduler and Memory pin are untouched. Production collection, live watching and transmission remain outside this scope.
