# Seed-review integration completion

Date: 2026-10-25. Main baseline: `301a8080466ad1ad7dbea10956b53e13b968e4ab`.
Original branch: `codex/seed-review-context`, commits `ac2990c` and `085e75c`.

## What the old branch contained

This was a candidate-review client enhancement, not unfinished Memory extraction or a new automatic approval engine. The October 18 implementation added separately labelled context dependencies, literal source reads, evidence classes, proposal title/priority and a P0 filter over loaded rows. October 19 added the portable Windows loader correction. Its two commits remained outside main; the old personal inspection was explicitly partial.

The completion branch merges current main into that history, resolves its outdated pin/build/test-list conflicts, and keeps both original commits reachable. The final diff against main contains only the candidate-review components, their synthetic tests/consumer assertions and integration documentation. No other frontend redesign branch is changed.

## Resulting behavior

- Candidate citation evidence and recorded input context appear separately. A context dependency is not citation evidence, corroboration, owner approval or complete reading history.
- Opening a source is explicit, exact-revision and byte-bounded. Text remains literal. Hiding, changing the candidate revision and unmounting retire late responses; a wrong source revision cannot replace the shown observation.
- Empty context lists and missing legacy metadata remain distinct. Evidence classes remain attributed to the source, including model claims.
- P0 is a proposal annotation. The filter reports total pending, loaded rows and visible P0 rows separately; it does not discover unloaded candidates or approve any of them. Existing plan/confirmation remains required.
- Paging and filter toggles preserve unsent drafts. Final pages with no P0 no longer tell the owner to use a nonexistent Load more control.

## Preserved current main

All five Memory dependencies and the lockfile/pin record remain byte-identical to main: `bf6bfd10bf3c870ae2ce7ceb5c6bd635b08bf327`, Workspace IPC v1 with 58 commands. There is no pin downgrade, dependency addition, local fork or Memory domain change. Shared `App.tsx` / `main.tsx`, synthetic automation, history results, Provider setup and the Activity / Usage retirement remain as on main.

The original seed worktree, its generated files, all Claude redesign worktrees, installed applications, personal Vault/candidates and review receipts are untouched. No model request, personal review confirmation or Canonical mutation occurred.

## Executed verification

- TypeScript and Vite frontend build passed. The existing large-chunk warning remains.
- Node gate: 158 passed, 3 skipped, no failures. Happy DOM: 78 fixtures / 1,056 assertions, all passed.
- Candidate context: 14 assertions; P0/filter/paging: 12 assertions. These include explicit source selection, attribution, wrong-revision refusal, late-response isolation, literal text, three pages of 123 synthetic candidates, preserved drafts, correct counts and the exhausted-page empty state. These are modeled component checks, not personal/native UI acceptance.
- Native tests: 46 host tests plus 8 pinned-Core consumer journeys passed. Actual candidate evidence and excerpt evidence classes, and the Core's recorded context field, are asserted on synthetic data.
- Desktop Rust fmt and strict all-target Clippy passed.
- Pin guard: 8 negative checks; resolved dependency boundary guard: 7 negative checks; Activity / Usage retirement guard passed.
- Independent executable and unsigned NSIS builds passed. No generated installer was run or installed.
- Diff/pin/shared-entrypoint checks passed. The historical JSON evidence has only its line endings normalized; its October 18 counts remain historical.

## Acceptance and handoff

Engineering integration does not replace the owner's personal review. Reading all personal pages, judging truth/duplication/value, and confirming selected memories remain owner actions. The historical partial inspection is not relabelled as complete. No personal data was reopened to perform this completion.

Claude's ongoing redesign should preserve the behaviors in [the integration handoff](../integration/SEED_REVIEW_CONTEXT_CLAUDE_HANDOFF_2026-10-25.md). When the completed branch is merged with a merge commit, both original seed commits will also be ancestors of main; branch cleanup can then use exact-SHA ancestry, without discarding historical work.
