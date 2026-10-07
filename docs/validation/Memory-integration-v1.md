# Memory integration — local evidence

Current combined release (2026-10-07): [desktop stack integration](Desktop-stack-integration-2026-10-07.md) records the preserved main pin/startup/installer, fresh host/front checks, 101-check native regression and focused confirmation/backup/integrity evidence.

The tables below preserve the main-branch companion/pin baseline from `ef11e51`; they are historical evidence, not a fresh result for the combined PR stack. Later frontend slices have their own reports:
Follow-up (2026-10-06): [picker preview binding](Picker-preview-v1.md) records matching import choices/previews, real backup export, and rejected restore-preview clearing/recovery.

Follow-up (2026-10-06): [explorer paging and read recovery](Explorer-feedback-v1.md) records query-bound rows/selection, actual stale-cursor refresh and controlled read-error retry.

Follow-up (2026-10-06): [operation feedback](Operation-feedback-v1.md) records fresh per-operation status, cancellation/resume and controlled read-error retry.

Follow-up (2026-10-06): [Runtime Vault admission](Root-admission-v1.md) adds directory-identity protection between cooperating Runtime processes and native folder-picker evidence. Memory's per-commit lock and fixed revision remain unchanged.

Follow-up (2026-10-05): [global hotkey and Quick Search](Quick-search-v1.md) records the companion's scoped native checks. This report retains its original baseline.

Follow-up (2026-10-05): [tray and explicit exit](Tray-lifecycle-v1.md) adds host lifecycle evidence, with 32 native smoke checks on a fresh synthetic Vault.

Follow-up (2026-10-05): [full frontend type checking](Frontend-typecheck-v1.md) covers the entire frontend and repeats the native smoke on a fresh synthetic Vault. This report retains the integration baseline and its original check counts.

Date: 2026-10-05. Scope:
- [ADR-025](../adr/025-enouia-memory-integration.md): Runtime embeds Enouia Memory's workspace Core and connects the Memory, Context and Sessions surfaces.
- [ADR-026](../adr/026-companion-shell.md): tray, quick search, login startup and the four stops.
- The pin bump to Memory's ADR-MEM-46 hardening.

All data is synthetic, in temporary folders outside any Git working tree. No personal Vault was opened. No Activity state, scheduler, account or deployment was touched.

## Inputs

| Item | Value |
|---|---|
| Enouia Memory revision | `ff692ccb6fbc1c387254d5ffbef41b105eeb2a84`. ADR-MEM-45 handoff, ADR-MEM-46 Core hardening, and resumable early-cancelled imports. The later Memory commit `71200a7` is test-only and logged as no Runtime action. |
| Memory surface aggregate at the pin | `c49bbaa9f82c21a812a34a247e4a5595cd51707ab406bb8205444f8259a17212` |
| Toolchain | Rust 1.98.1 `x86_64-pc-windows-gnu`, MSYS2 UCRT64 GCC 16.1.0 (bundled SQLite), Node 24.15.0, Tauri 2.12.0 with `tray-icon`, tauri-build 2.7.0, rfd 0.17.2, windows-sys 0.61.2, `@types/react`/`@types/react-dom` 19.3.0 (dev only) |
| Lockfile | The Memory packages resolve at the pinned revision; only their `source` lines change between pins. The first integration added `rusqlite`/`libsqlite3-sys`/`rfd` and helpers. The companion added only the desktop crate's own `windows-sys` edge; the tray crates were already locked. The Memory closure has the same versions as Memory's own lockfile. |

## Checks

| Command | Result |
|---|---|
| Memory at the pin: `cargo fmt --all -- --check`, `cargo test --workspace --locked`, `cargo clippy --workspace --all-targets --locked -- -D warnings`, `python tools/schema-check/check_schemas.py`, `python tools/integration/runtime_surface.py` | Pass. 217 tests; schemas OK; surface logged. |
| `apps/desktop/src-tauri`: `cargo fetch --locked` once online, then offline `cargo fmt -- --check`, `cargo test --locked`, `cargo clippy --locked --all-targets -- -D warnings` | Pass. 12 unit tests and 3 pinned-Core tests over every field the surfaces render.<ul><li>Adapter: window scope including quick search, spoofed fields, gate classes, single exit, the exit reported in status, picker kinds, `--memory-vault`, and page `WRITES` equal to the pinned contract.</li><li>Companion: hotkey letter.</li><li>Startup: command quoting, no path disclosure, and a registry round trip on an isolated test key that is removed with its parent afterwards.</li></ul> |
| `apps/desktop`: `npm run check`, `npm test`, `npm run build`, `npm run desktop:build` | Pass. `tsc` covers `src/memory` and `demo-state.ts`. 11 Node tests: 4 demo state and 7 Memory client (envelope, keys, errors, rule text including the import rules, picker, shell commands). Release executable with embedded assets, no installer. |
| `node scripts/check-domain-boundaries.mjs <metadata> --self-test` | Domain workspace: 0 Memory packages, 10 negative checks. Desktop workspace: 7 Memory packages at the pinned revision, 7 negative checks. |
| `node scripts/check-memory-integration.mjs --self-test --memory-checkout <Memory checkout>` | `memory_pin_consistent`, 8 negative checks. The surface equals the manifest committed at the pinned revision, read with `git show` while the checkout's HEAD was later. |
| Root workspace: fmt, `cargo test --workspace --locked`, clippy; `node scripts/check-activity-evidence.mjs --self-test` | Pass: 214 tests, unchanged by this change; evidence index unchanged. |
| Frozen readiness artifacts | All 60 SHA-256 values still match. The checker's git-scope rule is historical (see the [readiness note](Backend-design-readiness.md)). |

## Real-app check

`node apps/desktop/e2e/memory-smoke.mjs <release exe> <vault> <synthetic.md> <out> K` started the release executable. **57/57 checks passed.** How it ran:

- The app ran with WebView2 remote debugging on loopback and a test-only WebView2 profile.
- The harness drove the real windows over the DevTools protocol (real Tauri IPC, real pinned Core). It identifies pages by native window label.
- It filled the process's own native Open and folder dialogs through UI Automation.
- After confirming the hotkey was registered, it pressed Ctrl+Alt+K once through SendInput.
- The Vault was created first with the pinned revision's `enouia-memory init`.
- No `EnouiaRuntime` Run value existed beforehand, and none remained afterwards. The isolated test registry keys were removed too.

| Area | Checks |
|---|---|
| Data root | Without `--memory-vault` nothing opens. |
| Status and labels | <ul><li>The badge reads "Memory · Vault open · Activity & Inspector demo".</li><li>Home and Settings read `workspace_status`.</li><li>Activity and the Runtime Inspector stay visibly labelled fictional.</li></ul> |
| W01 | <ul><li>Remember, then a plan dialog with the exact text and an 8-hex code, then confirm.</li><li>Source excerpt shown as data.</li><li>A correction becomes a candidate, rejected through a plan.</li><li>Import through the native file picker.</li><li>A second Vault created through the native folder picker, then the first reopened through it.</li><li>Local Mock answer with its context and the hash-verified actual request.</li><li>Memories and the session persist across Exit and restart.</li></ul> |
| W02 | <ul><li>Another process held the Vault writer lock, so a write failed as `busy` with Retry. After release, Retry resent the same key and exactly one candidate appeared.</li><li>Load more pages past 25 records.</li><li>A 3,000-conversation synthetic ChatGPT import was cancelled at once: the operation ended `cancelled` and Resume was offered. Choosing the same file again pointed to Resume with Start disabled. The resumed import succeeded.</li><li>Index rebuild runs as an operation.</li></ul> |
| W03 | <ul><li>Lock refuses work (retryable `vault_locked`) and clears quick search.</li><li>Closing the window hides it while Memory keeps answering.</li><li>Exit ends the process (code 0) after the Core shuts down.</li><li>A second Runtime process could not open the same Vault (one Core per Vault).</li></ul> |
| W04 | <ul><li>Markup renders as text.</li><li>`plugin:fs` and `plugin:shell` are refused.</li><li>A path in place of a token is refused, as is an unknown picker kind.</li><li>Remote `fetch` is blocked by the CSP.</li><li>No Vault or import path appears in page text.</li><li>Quick search finds approved memories, but `remember`, `review_confirm`, `forget_plan` and `vault_lock` from it answer `permission_denied` and write nothing. Its `memory_pick`, `exit_app` and `startup_set` are refused by the ACL.</li><li>The main window has no `show_main` grant.</li></ul> |
| W05 (partial) | <ul><li>Ctrl+4 is inert under a review dialog.</li><li>Focus moves to Context after inspecting an answer.</li><li>Hotkey Ctrl+Alt+K registered. A second process reports the conflict.</li><li>The real key press showed quick search, empty. After focus left the input, Escape hid it and cleared its results.</li><li>`--autostart` starts hidden with no Vault, and quick search's "Open Enouia Runtime" shows the window.</li><li>The login-startup switch wrote exactly `"<exe>" --autostart` under `EnouiaRuntime` and removed it again.</li><li>The WebView2 profile kept no autofill copy of typed memory text.</li></ul> |

Screenshots and `report.json` stayed in a temporary folder and were reviewed visually; they are not committed.

## Independent reviews

Each review had dimension reviewers, and every finding got an adversarial verification. Confirmed findings were fixed before the commits. Refuted findings were not acted on.

- **Memory integration (ADR-025): 18 confirmed.**
  - Lock and exit no longer freeze status and progress.
  - The pin check is bound to the pinned revision.
  - Autofill is disabled.
  - Shortcuts are inert under dialogs.
  - Ranked search is no longer drawn as a timeline.
  - Unknown review counts are shown as unknown.
  - Plan dialogs survive a native close.
  - Truthful labels.
  - Precise acceptance status in the docs.
- **Memory Core (ADR-MEM-46): 6 confirmed, all fixed in Memory before Runtime adopted them.**
  - A pre-existing unlock deadlock.
  - A host lock that in-flight reads could hold.
  - `close()` ordering.
  - Panic after cancel.
  - Readable reference-shell text.
- **Companion shell (ADR-026): 9 confirmed, all fixed.**
  - Every path to the main window hides quick search first.
  - Escape works after a click moves focus off the input.
  - Re-choosing an interrupted import points to Resume, and failed operations show owner text.
  - Exit shows its progress in every window instead of an empty Vault.
  - A disabled startup switch looks disabled.
  - The smoke removes only a Run value it wrote, also on Ctrl+C, and needs an absolute exe.
  - ADR-025, the register and the frontend doc state the current pending set.
  - The untested tray menu is listed under Limits.
- **Found during real-app runs and fixed:**
  - Imports cancelled before their first batch looked finished (Memory).
  - A progress view could show the previous operation's result (Runtime).

## Limits

- **Not run:** Narrator, a real Windows contrast theme, code signing and an actual sign-in start. The installed artifact is covered by the [installer evidence](Desktop-installer-v1.md) (ADR-027), which also adds two session-end checks to this smoke.
- **Tray:** no run clicked the notification area. The tray's Show and Exit call the same functions as the tested quick-search link and Settings Exit. The tray's Lock is reached only from the tray and is untested.
- **Single-unit imports:** a single-file Markdown import is one batch. It holds the writer lock for its whole parse (23–48 s for a 6,000-section synthetic file), so other writes answer retryable `busy` meanwhile. Recorded in Memory's handoff as known Core behaviour.
- **Lock during uncancellable work:** the smoke did not lock or exit while a verify or backup was running. The gate classes are unit-tested.
- **Real data:** no real export, real Provider, backup destination or personal data was used. The checks ran on one Windows 11 development host.
