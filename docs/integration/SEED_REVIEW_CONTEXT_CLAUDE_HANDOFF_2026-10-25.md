# Candidate seed-review behavior for the UI redesign

Date: 2026-10-25. Scope: preserve this focused behavior while continuing the existing redesign; no new overall UI direction is requested.

Runtime's completed seed-review branch adds these behaviors to the current main implementation:

1. `CandidateSource.tsx` accepts `kind="context"` to label context dependencies separately from evidence. The reader still calls only `source_excerpt` for the exact source/revision with 4,096-byte bounds, explicit gestures and stale-response/focus guards.
2. `MemorySurface.tsx` displays candidate `details.title`, proposed `details.priority`, and separate `contextSources`. Missing context information is unknown; an explicit empty array means no recorded dependencies. Context does not increase evidence counts or grant approval.
3. The P0 checkbox filters only loaded candidate rows. Keep global pending count, loaded count and shown P0 count distinct. Preserve drafts while filtering/paging, keep loading explicit, and show the final empty state without promising a nonexistent next page.
4. Approval remains the existing exact review plan and confirmation. A P0 tag, source read or filter toggle must not call a write/model endpoint or claim an approved memory.

Keep these regression fixtures when restructuring the components: `candidate-context`, `candidate-core-filter`, `candidate-paging`, `candidate-source`, and the existing review-plan/focus/retry checks. The two new fixtures are registered in `apps/desktop/tests/dom-fixtures.mjs`.

No current Memory pin, root format, Provider path, shared application entrypoint or Activity / Usage behavior is changed by this slice. Personal candidate acceptance remains separate. The old branch's loader note remains a portable-package requirement, not an instruction to inspect a personal Vault.
