# Activity / Usage desktop backend retirement evidence

Date: 2026-10-25. Baseline: Runtime main `91f5ac9960e8674ffee25c5b36e309b705a48156`. Implementation decision: [ADR-037](../adr/037-activity-usage-desktop-retirement.md).

## Changes and preserved boundaries

The desktop does not compile the Activity / Usage adapter modules or manage their hosts, and removes `activity_call`, `activity_setup`, `usage_call`, `usage_pick`, `usage_cancel` from the invoke handler, command declaration and main-window capabilities. Their five generated permission files and unused direct SHA dependency are removed. Existing adapter files remain uncompiled history; standalone crates, packages, scripts, schemas and data are retained for later migration retirement.

No file under `apps/desktop/src` was changed. Claude's ongoing frontend branch is not merged or edited. Old Activity / Usage pages in this backend branch therefore cannot invoke operations until removed by Claude. Their modeled frontend tests still run as historical component regressions, not proof that the removed native feature works.

Memory pin stays `bf6bfd10bf3c870ae2ce7ceb5c6bd635b08bf327`, with all five dependencies and nine resolved upstream packages. Memory v1, synthetic automation, Provider and Windows lifecycle stay separate from the retired domains. No installed program, personal Vault, ledger, source history, credentials, Windows task or production publisher was changed.

## Checks actually executed

- `cargo fmt -- --check` passed for the independent desktop workspace.
- `cargo test --locked` passed: 46 native host tests and 8 pinned-Core integration tests. Activity / Usage unit tests are no longer part of this compiled host.
- `cargo clippy --locked --all-targets -- -D warnings` passed.
- `npm run check` passed; `npm test` passed (158 Node tests passed, 3 skipped, plus the Happy DOM fixture gate). These modeled tests make no native UI acceptance claim.
- `npm run build`, `npm run desktop:build` and `npm run desktop:bundle` passed. The unsigned NSIS development installer was generated, not run or installed. The unchanged frontend still generates the existing large-chunk warning.
- Resolved `cargo metadata --offline --locked` plus `check-domain-boundaries.mjs --self-test` passed (7 negative checks).
- `check-memory-integration.mjs --self-test` passed (8 negative checks).
- `check-activity-retirement.mjs` and `git diff --check` passed.

Verification used the already pinned frontend dependencies and installed GNU Rust 1.98.1/MinGW environment. The release cache is development output, not a newly installed owner application. No new dependency or Memory pin update occurred.

## Moriium counterpart and remaining work

Moriium's separate backend provides `scripts/collect-remote-activity.mjs`, a frozen v2 contract, independent single-writer/hash publication, server-only GitHub credentials, hourly systemd templates, failure retention and immutable v1 history. Its frontend/deployment handoff is `docs/remote-activity-operations.md` in that repository.

Moriium focused new/old backend tests passed (23); full `pnpm verify` passed (432 passed, 4 skipped, 1 todo), followed by 9 affected tests rerun after correcting the tokens.ci bucket formula. The initial full check failed on inherited tests that misuse URL-encoded paths with spaces; an isolated no-space drive mapping made those tests pass without modifying them.

Read-only real public API verification accepted GitHub 298 dates, Codex 84 dates and Claude 35 dates. The tokens profile's observed update was `2026-10-25T06:40:15.325Z`. Its parser normalizes output/reasoning into disjoint buckets; it is not raw Codex subset arithmetic. A separate local static-only Python server verified the three built About pages, new feed hash and retained legacy hash with no author Node service running; it was shut down afterward. This is not deployed Nginx/systemd or frontend v2 acceptance.

Still pending: Claude's frontend deletion/new About feed consumer; production deployment and one actual timer observation; per-device tokens automatic submission and coverage acceptance; then the standalone Runtime backend and installed-writer retirement. Existing branches/PRs and data are not cleanup targets of this slice.
