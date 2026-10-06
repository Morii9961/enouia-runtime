# Memory integration v1 — local evidence

Follow-up (2026-10-06): [explorer paging and read recovery](Explorer-feedback-v1.md) records query-bound rows/selection, actual stale-cursor refresh and controlled read-error retry.

Follow-up (2026-10-06): [operation feedback](Operation-feedback-v1.md) records fresh per-operation status, cancellation/resume and controlled read-error retry.

Follow-up (2026-10-06): [Runtime Vault admission](Root-admission-v1.md) adds directory-identity protection between cooperating Runtime processes and native folder-picker evidence. Memory's per-commit lock and fixed revision remain unchanged.

Follow-up (2026-10-05): [global hotkey and Quick Search](Quick-search-v1.md) records the companion's scoped native checks. This report retains its original baseline.

Follow-up (2026-10-05): [tray and explicit exit](Tray-lifecycle-v1.md) adds host lifecycle evidence, with 32 native smoke checks on a fresh synthetic Vault.

Follow-up (2026-10-05): [full frontend type checking](Frontend-typecheck-v1.md) covers the entire frontend and repeats the native smoke on a fresh synthetic Vault. This report retains the integration baseline and its original check counts.

Date: 2026-10-05. Scope: [ADR-025](../adr/025-enouia-memory-integration.md). Runtime's desktop shell embeds Enouia Memory's workspace Core and connects the Memory, Context and Sessions surfaces. All data is synthetic, in temporary folders outside any Git working tree. No personal Vault was opened, and no Activity state, scheduler, account or deployment was touched.

## Inputs

| Item | Value |
|---|---|
| Enouia Memory revision | `a181308b3496c07281c1030cc53b7c9f1bbb7705` (ADR-MEM-45, `HostSurface`, integration surface manifest). Docs-only follow-ups after it do not change the surface. |
| Memory surface aggregate | `a499b083913a4dc84b24eaccdb98fe4dd197cece6cac5589d2e1f1b9959aba3a` |
| Toolchain | Rust 1.98.1 `x86_64-pc-windows-gnu`, MSYS2 UCRT64 GCC 16.1.0 (bundled SQLite), Node 24.15.0, Tauri 2.12.0, tauri-build 2.7.0, rfd 0.17.2, `@types/react`/`@types/react-dom` 19.3.0 (dev only) |
| Lockfile change | Additions only: the seven `enouia-memory-*` packages at the pinned revision, plus `rusqlite` 0.40.2, `libsqlite3-sys` 0.38.2, `fallible-iterator`, `fallible-streaming-iterator`, `vcpkg`, `rfd`. The Memory closure resolves to the same versions as Memory's own lockfile. |

## Checks

| Command | Result |
|---|---|
| Memory: `cargo fmt --all -- --check`, `cargo test --workspace --locked`, `cargo clippy --workspace --all-targets --locked -- -D warnings` | Pass. 208 tests: the 201 before plus `HostSurface`, two boundary tests and four surface-manifest tests. |
| Memory: `python tools/schema-check/check_schemas.py`, `python tools/integration/runtime_surface.py` | OK (34 schemas, 63 workspace messages); surface aggregate logged |
| `apps/desktop/src-tauri`: `cargo fetch --locked` once online, then offline `cargo fmt -- --check`, `cargo test --locked`, `cargo clippy --locked --all-targets -- -D warnings` | Pass. 7 adapter unit tests (window scope, spoofed fields, gate classes, single close, picker kinds, `--memory-vault`, page client `WRITES` equal to the pinned contract's write commands) and 3 pinned-Core tests over every field the surfaces render. |
| `apps/desktop`: `npm run check`, `npm test`, `npm run build`, `npm run desktop:build` | Pass. `tsc` covers `src/memory` and `demo-state.ts`. 9 Node tests (4 demo state, 5 Memory client). Release executable with embedded assets, no installer. |
| `node scripts/check-domain-boundaries.mjs <metadata> --self-test` | Domain workspace passes with 0 Memory packages and 10 negative checks. Desktop workspace passes with 7 Memory packages at the pinned revision and 7 negative checks. |
| `node scripts/check-memory-integration.mjs --self-test --memory-checkout <Memory checkout>` | `memory_pin_consistent`, 8 negative checks. The surface matches the manifest committed at the pinned revision (read with `git show`; the checkout's HEAD was a later docs-only commit). |
| Root workspace: `cargo fmt --all -- --check`, `cargo test --workspace --locked`, `cargo clippy --workspace --all-targets --locked -- -D warnings`; `node scripts/check-activity-evidence.mjs --self-test` | Pass, 214 tests, unchanged by this change; evidence index unchanged (8 negative checks, 2 unresolved comparisons as before) |
| Frozen readiness artifacts (`docs/backend/implementation-slices-v1.json`) | All 60 SHA-256 values still match. The checker's git-scope rule is historical and already failed before this change (see the [readiness note](Backend-design-readiness.md)). |

## Real-app check

`node apps/desktop/e2e/memory-smoke.mjs <release exe> <vault> <synthetic.md> <out>` started the release executable with WebView2 remote debugging on loopback and a test-only WebView2 profile. It drove the real page over the DevTools protocol (real Tauri IPC, real pinned Core) and filled the process's own native Open dialog through UI Automation. The Vault was created first with the pinned revision's `enouia-memory init <dir> --confirm-new-vault`. **28/28 checks passed.**

| Area | Checks |
|---|---|
| Data root | `D.no_default_root`: without `--memory-vault` nothing opens and the badge reads "No Vault open" |
| Status and labels | <ul><li>The badge reads "Memory · Vault open · Activity & Inspector demo".</li><li>Home and Settings read `workspace_status`.</li><li>Activity and the Runtime Inspector stay visibly labelled fictional.</li></ul> |
| W01 paths | <ul><li>Remember, then a plan dialog with the exact text and an 8-hex code, then confirm.</li><li>Source excerpt visible and labelled as data.</li><li>A correction becomes a candidate showing the current fact; it is rejected through a plan.</li><li>Import through the native file picker, operation succeeded.</li><li>Local Mock answer; inspect its context and the hash-verified actual request.</li><li>Compile preview shows "Preview only".</li><li>After exit and restart, the memory and session persist.</li></ul> |
| W02 (partial) | Index rebuild runs as an operation and succeeds |
| W03 | Lock refuses work with retryable `vault_locked`, then unlock. Closing the window shuts the Core down and the process exits with code 0. |
| W04 | <ul><li>Markup in memory text renders as text: no element is created and no script runs.</li><li>`plugin:fs` and `plugin:shell` are refused by the ACL.</li><li>A path in place of a token is refused (`workspace.token`), as is an unknown picker kind (`workspace.pick_kind`).</li><li>Remote `fetch` is blocked by the CSP.</li><li>Neither the Vault path nor the import folder appears in page text.</li></ul> |
| W05 (partial) | <ul><li>Ctrl+4 does nothing while a review dialog is open.</li><li>After the run, the WebView2 profile's autofill table is empty. Before autofill was disabled, an independent review found three typed Memory field values stored there.</li></ul> |

Screenshots and `report.json` stayed in a temporary folder and were reviewed visually. They are not committed.

## Independent review

A three-dimension review (adapter and checkers, frontend port fidelity, documentation across both repositories) produced findings, and each one got an adversarial verification. 18 were confirmed and fixed in this change:

- Lock or close during a verify or backup, which cannot be cancelled, no longer freezes status and progress: plain reads are ungated, and the window stays open until the Core has shut down.
- `--memory-checkout` is bound to the pinned revision.
- WebView2 autofill is disabled.
- Shortcuts are inert under review dialogs.
- Ranked search results are no longer drawn as a dated timeline (this also fixed duplicate React keys).
- An unknown review count is shown as unknown.
- The status-error text is consistent across surfaces.
- Plan dialogs survive a native close while busy and are keyed per plan.
- Settings rows no longer remount on every poll.
- Focus moves to Context after inspecting an answer.
- Truthful demo labels and keyboard hints.
- Documentation:
  - acceptance status is precise
  - the continuous-work clause is not widened
  - the runbook covers exact pins and the revision checkout
  - the demo record names its commit
  - Memory's register relation matches Runtime's register

7 findings were refuted.

## Limits

- **Not run on the Runtime host:**
  - W02 cancel/retry/paging/error recovery
  - the folder picker for opening or creating a Vault (the Vault came from `--memory-vault`; creating a Vault through a registered pick is covered by the pinned-Core test)
  - one-Core-per-Vault exclusion
  - Narrator, a real contrast theme, an installed artifact
  - login startup, tray, global hotkey and the quick-search overlay

  These remain in Memory's reference shell until ported (see [parity](../MEMORY_INTEGRATION_v1.md#parity-with-memorys-reference-shell)).
- **Lock during a long operation:** the smoke test did not drive a lock or close while a verify or backup was running. The gate classes are unit-tested.
- **Real data:** no real export, real Provider, backup destination or personal data was used.
- **Fixed host:** checks ran on one Windows 11 development host.
