# Memory integration v1

Enouia Runtime is the Windows client for Enouia Memory's local part ([ADR-025](adr/025-enouia-memory-integration.md), companion shell [ADR-026](adr/026-companion-shell.md)). It embeds Memory's workspace Core at a pinned Git revision behind a Runtime-owned adapter. The Memory, Context and Sessions surfaces are Memory's local frontend. The Memory repository owns the domain, the contracts and every cloud stage. Its [integration handoff](https://github.com/Morii9961/enouia-memory/blob/main/docs/integration/RUNTIME.md) lists host duties, known Core behavior and the compatibility log that routes each Memory-side change here.

## Pinned revision

| Field | Value |
|---|---|
| Repository | `https://github.com/Morii9961/enouia-memory.git` (public) |
| Revision | recorded in [docs/integration/memory-pin.json](integration/memory-pin.json), in `apps/desktop/src-tauri/Cargo.toml` and in its `Cargo.lock` |
| Consumed crates | `enouia-memory-workspace`, and `enouia-memory-contract` for its command catalog (long-running and write commands) |
| Contract | workspace IPC v1 (`schemaVersion: 1`, 36 commands) |
| Memory surface digest | the aggregate from Memory's `docs/integration/runtime-surface.json` at that revision |

`node scripts/check-memory-integration.mjs` checks that the pin record, the manifest and the lockfile agree. It also checks that the revision is a full SHA and that no path, branch or `[patch]` source is committed. Given `--memory-checkout <dir>`, it compares the recorded surface digest with that checkout's manifest.

## Adapter (`apps/desktop/src-tauri`)

- **State.** One `Workspace::new(Config::default())` per process, held by `MemoryHost` in `src/memory.rs`.
- **`memory_call(request)`** forwards one workspace IPC v1 envelope. Core errors come back inside the envelope (`kind: "memory_error"`, `{code, retryable, rules}`). Host failures are plain strings: `permission_denied`, `worker_failed`, `runtime_closing`, `runtime_busy`, `root_in_use`, `root_admission_failed`, `root_token_unavailable`.
- **`memory_pick(kind)`** opens a native dialog for `import_file`, `vault_root`, `backup_destination` or `export_folder` and registers the choice with the Core. It returns `{token, displayName, bytes}`, `{cancelled: true}` or `{error}`. The page never receives a path.
- **Scope.** Native `main` maps to `HostSurface::Workspace`, and `overlay` to `HostSurface::QuickSearch` (only `memory_search`). Every other label is refused. Request fields cannot widen the scope. The picker remains main-only.
- **Threading and lifecycle.**
  - Every call runs on `spawn_blocking`.
  - `vault_open`, `vault_create`, `vault_lock` and `vault_unlock` take a gate exclusively. Commits and commands that start operations (import, index rebuild, verify, backup) take it shared, so no work can start on a Vault handle that is closing.
  - Plain reads are not gated. While a lock waits for verify or backup, which cannot be cancelled, status and progress still answer.
  - Vault lifecycle admission hides and clears the overlay before its worker starts. A counted guard refuses search and overlay reopening through all queued lifecycle transitions; status and progress remain available.
  - Closing hides the window to the installed tray and retains the same Core. Tray or Settings Exit starts one asynchronous shutdown: new work is refused, status/progress remain available, import and index work are cancelled, verify/backup are joined, and the Vault and index are released before exit. A failed shutdown worker restores a recoverable window.
- **Data root.** No root is remembered or opened by default. The owner opens or creates one through the native dialog; creating one needs the typed phrase `create new vault`. The owner can also name a root with `--memory-vault <dir>`. The root must not sit under a Git working tree, a sync folder, Program Files or Windows, and the Core refuses such roots.
- **Runtime root admission.** `src/root_lease.rs` reserves the native directory's Windows volume/file identity before opening or creating a Vault. Cooperating Runtime processes contend on the same kernel presence object even when paths differ. The directory and presence handles remain held while locked, and are released after Core shutdown, a successful switch, or a failed switch that actually closed the old Core. Process termination releases the handles too. A failed occupied-root switch preserves the current Vault. This writes no Vault file and does not change Memory's lock. Other clients do not share this Runtime guard; the pinned Core separately owns its cross-client Vault lock. An adapter test checks refusal and release in both directions between a Runtime host and a bare pinned Workspace on a synthetic root. That is an embedded-Core test, not a real third-party-client acceptance run.
- **Native choices.** The host keeps at most 64 Vault picker-token/path bindings in memory for admission. The page still receives only opaque tokens. Memory remains authoritative for token expiry, consumption and creation confirmation; an evicted token asks the owner to choose again. A startup admission failure leaves canonical status at no Vault, while `shell_status.vaultAdmissionError` supplies a separate host explanation on Home, Memory and Settings.
- **Permissions.** `build.rs` declares the two Memory commands and host window commands. `main-window` grants Memory/picker, window controls, `shell_status`, `shell_show`, `shell_search`, `shell_exit`, `activity_call` and `activity_setup`. The Activity commands reach only the separately installed runner (ADR-028), never the Memory adapter. `quick-search` grants only scoped `memory_call`, `shell_show` (existing main), `shell_hide` (itself) and event listen/unlisten for clearing. Native identities are checked again in Rust. There is no filesystem, process execution, HTTP, dialog, opener, provider or Activity plugin permission. The CSP is `default-src 'self'` with `connect-src ipc: http://ipc.localhost`, `form-action 'none'`, `base-uri 'none'` and `freezePrototype`. WebView2 general autofill is off on both windows, and Memory inputs set `autocomplete="off"`, so the WebView profile keeps no copy of typed memory text.
- **Companion (ADR-026).** Tray (Show, Lock Memory Vault, Exit; left click shows). Global hotkey Ctrl+Alt+M, or another letter with `--hotkey-key`, opens quick search; a conflict is reported in Settings. Opt-in login startup writes only `HKCU\…\Run\EnouiaRuntime` = `"<exe>" --autostart`, which starts in the tray with no Vault.
- **Compatibility and OS exit.** The main window also grants `show_main`, `hide_window`, `exit_app`, `startup_status` and `startup_set`. The active `quick-search` capability grants only `show_main` and `hide_window` compatibility commands, never startup or exit. Both command families use the same tray, hotkey and shutdown implementation. Core companion status preserves `exiting` during shutdown. Windows session end and Restart Manager reach Core shutdown through `RunEvent::Exit` (ADR-027). The tray's Lock runs on a worker thread. `--autostart` starts hidden and ignores even a supplied `--memory-vault` argument.
- **No copies.** The adapter writes no logs and persists nothing. Memory text exists only in the Vault and in the page's memory while a surface shows it.

## Frontend (`apps/desktop/src`)

- **Mode.** Inside the native shell (`isTauri()`), Memory, Context and Sessions use the pinned Core. A browser preview keeps the explicitly labelled fictional demo, unchanged. The header badge states which mode is active ("Memory · Vault open · Inspector demo"). Activity reads the installed producer ([ADR-028](adr/028-activity-surface.md)). The Runtime Inspector stays fictional, and in the native shell its subtitle says so.
- **Client.** `src/memory/client.ts` mirrors Memory's reference client:
  - Request envelope `{schemaVersion: 1, requestId: "req_<uuid>", command, idempotencyKey, arguments}`.
  - One `ui-<uuid>` key per user submission. A retry resends the same payload with the same key.
  - `WRITES` must equal the pinned contract's write commands. A desktop Rust test enforces this.
- **Hooks.** `src/memory/hooks.ts` ports `useAction` and `useLatestRead`. Only the latest read publishes its result, error or busy state. A retry is offered only for `retryable` errors.
  Shared status reads keep Runtime's `shell_status.vaultChanging` separate from Core's canonical Vault slot. A pending lock can have a detached `locked` Core slot while Runtime is still joining workers; the UI keeps waiting/progress feedback and withholds Unlock until Runtime releases admission. See [real long-work lifecycle evidence](validation/Long-operation-lifecycle-v1.md).
- **Surfaces** (`src/memory/*.tsx`), drawn in the Quiet Runtime language:
  - **Memory Vault.** Candidate inbox with accept, edit-and-accept or reject through the review plan and its confirmation code; remember-a-statement; the canonical explorer with literal search, history and paging; detail with evidence and source excerpts; correction proposals; delete-impact preview; forget and purge plans; Import; Vault and recovery: open/create/unlock/lock, verify, index rebuild, backup to an empty folder, restore preview.
  - **Sessions.** Branch list, transcript, unfinished turns, provisional checkpoints, asking the local Mock, and a link to the capsule behind an answer.
  - **Context.** Compile preview, the inclusion and exclusion decisions, and dispatches with the verified actual request.
  - **Home and Settings** show the Vault state and Memory's component states from `workspace_status`. Memory's fixed `activity` row is not shown; Activity keeps its own surface. Settings also shows the quick-search hotkey state, the login-startup switch and Exit. The Runtime Inspector's component descriptions stay documentation references.
  - **Quick search** (`src/shell/QuickSearch.tsx`, the `?view=overlay` page): scoped literal search over approved memories, with a link that opens the main window.
- **Error text.** `workspace.vault_in_use` and the `root.*` reasons (Memory ADR-MEM-46) read as owner text; `vault_in_use` offers no Retry.
- **Rendering.** Memory and source text render as plain text nodes only. There is no Markdown or HTML rendering and no link navigation. Source excerpts are labelled as data, not instructions.
- **Session timing.** Only the latest detail read changes selection and restores that branch's question/checkpoint drafts. An outstanding write blocks branch switching; acknowledgement clears only the submitted draft field. See [native draft/timing evidence](validation/Session-drafts-v1.md).
- **Session writes.** Creating, asking and saving checkpoints show waiting feedback. Submitting a question clears the preceding answer inspector; Retry retains its request/key and leaves any subsequently edited draft intact. See [write-feedback and retry evidence](validation/Session-write-feedback-v1.md).
- **Saved responses.** Recognized completed local Mock records show their saved status, literal statements and source revisions in the transcript. A keyboard-accessible disclosure retains the exact recorded text; unknown/malformed formats and user messages stay literal. No answer or request is recomputed. See [transcript reading evidence](validation/Session-transcript-v1.md).
- **Explorer reads.** Each submitted query owns fresh rows and selection. Unobserved results remain unknown, and errors do not imply an empty search. Load more appends a Core page; a stale cursor keeps already observed rows with its error. Refresh results restarts at the first page with a new submission. See [paging and read-recovery evidence](validation/Explorer-feedback-v1.md).
- **Explorer keyboard.** Up/Down starts from the focused row and moves selection and focus together, bounded at the first/last loaded row. Space then activates that row. Search and toolbar arrows retain their own behavior. See [native keyboard evidence](validation/Explorer-keyboard-v1.md).
- **List reads.** Candidate counts and session lists stay unknown before observation, and failed reads cannot claim an empty list. Retry preserves unsent drafts. See [candidate/session read evidence](validation/List-read-feedback-v1.md); controlled read errors do not prove real storage recovery.
- **Context reads.** Preview preparation, capsule reads and request reads have distinct waiting feedback. Selected-but-unread capsules are not labelled unselected, and dispatch metadata does not claim unread actual-request contents. A new preview clears the old selection, and a failed replacement preserves its query without implying an active read. See [Context read evidence](validation/Context-read-feedback-v1.md).
- **Saved question.** Context shows the query from its inspected Core capsule separately from the editable preview draft. Editing that draft does not change the selected capsule's question or decisions. See [saved-query attribution evidence](validation/Capsule-query-v1.md).
- **Picker previews.** Import publishes a native choice with its successful preview as one selection. A failed new preview cannot offer an import against an earlier file's display. A new restore folder clears the preceding validation before reading it. Cancelling a native choice retains the last valid selection. See [picker/preview evidence](validation/Picker-preview-v1.md).
- **Contrast cues.** Forced-colors media uses system-color outlines for current-page/pressed selection and a separate keyboard focus outline. Ordinary theme styles are unchanged. See [WebView2 media-emulation evidence](validation/Forced-colors-v1.md); real Windows contrast-theme and Narrator acceptance remain pending.
- **Native accessibility.** A focus-visible keyboard entry bypasses the titlebar and primary navigation into the named current main content. Session row names identify their saved session/branch even when dates and event counts coincide. [Windows UI Automation and keyboard evidence](validation/Native-accessibility-v1.md) covers all seven main names, actual form labels, session distinctions and modal isolation. It does not establish Narrator speech or complete W05.
- **Keyboard task journey.** A continuous synthetic review → memory/source → session/local Mock/checkpoint → saved Context/request/preview journey is reachable using owned-page keyboard events. Session acknowledgements restore the appropriate composer after disabling controls, while respecting focus moved elsewhere. See [task and native focus evidence](validation/Keyboard-journey-v1.md); physical input and Narrator speech remain separate gates.
- **Operations.** Each operation ID starts a fresh watcher. Import, import resume and index rebuild offer cancellation at safe points; verify and backup explain that they finish before locking or exiting. A cancellation request and progress counts remain separate from terminal success/cancellation. A failed status read offers Retry. See [operation feedback evidence](validation/Operation-feedback-v1.md).
- **Review confirmation.** Waiting for the result is explicitly explained, and the pending modal blocks platform/keyboard dismissal while retaining close-event recovery. A read-only observation confirms Retry preserves its payload and key and replays the actual receipt. See [confirmation timing evidence](validation/Confirm-feedback-v1.md); simulated delivery errors are not storage-failure proof.
- **Quick Search** (`src/shell/QuickSearch.tsx`). Ctrl+Alt+M opens a hidden native window for literal search of approved memories, limited to eight current results. Escape, blur, close, returning to main and Vault lifecycle transitions clear query/results and invalidate delayed reads. It provides no detail, source excerpt, picker or mutation. The tray and Settings provide manual opening when a shortcut conflicts. `--hotkey-key <single ASCII letter>` explicitly selects another Ctrl+Alt combination for that launch; the default is M and no preference is persisted. The owned Windows message thread unregisters and joins on exit. Settings and Core companion status report registration, conflict or unavailability.

## Build and checks

Prerequisites:
- The pinned Rust 1.98.1 GNU toolchain.
- Node 24.15.0 or later.
- WebView2.
- A MinGW C compiler for Memory's bundled SQLite, for example MSYS2 UCRT64. Its `bin` must come before the Rust toolchain's `bin` in `PATH`.

The first build after a new pin needs one online fetch. Builds after that work offline from Cargo's Git cache.

```powershell
$env:Path = "C:\msys64\ucrt64\bin;$env:USERPROFILE\.cargo\bin;$env:Path"
cd apps/desktop/src-tauri
cargo fetch --locked                  # once per machine, cache or pin
$env:CARGO_NET_OFFLINE = 'true'
cargo fmt -- --check
cargo test --locked                   # adapter and companion unit tests, pinned-Core rendered-field tests
cargo clippy --locked --all-targets -- -D warnings
cd ..
npm ci
npm run check
npm test
npm run build
npm run desktop:build                 # embedded-assets executable, no installer
npm run desktop:bundle                # the same plus the current-user NSIS installer (ADR-027)
cd src-tauri
cargo metadata --offline --locked --format-version 1 > target/desktop-metadata.json
node ../../../scripts/check-domain-boundaries.mjs target/desktop-metadata.json --self-test
cd ../../..
node scripts/check-memory-integration.mjs --self-test
```

`apps/desktop/e2e/memory-smoke.mjs <exe> <vault-root> <import-file> <out-dir>` drives the built executable over WebView2 remote debugging on loopback, which is enabled only in that test's environment. It uses a synthetic Vault created outside any Git working tree, for example with the pinned Memory revision's `enouia-memory init <dir> --confirm-new-vault`, plus a synthetic Markdown file for the import picker. It tests Ctrl+Alt+Q via Windows input only while its own process is foreground, and launches a second isolated test process for shortcut conflict and occupied-root refusal. An optional `--quick-only` prepares two approved records and a completed index rebuild in a fresh empty synthetic Vault, then checks the overlay including three real reopening cycles. Reopening waits for observed native clear/focus/visibility before test input. See [opening prerequisite evidence](validation/Quick-search-opening-v1.md). `--operations-only` takes a fresh synthetic Vault and a 500-session synthetic `enouia-runtime-session/1` JSON export to test cancellation/resume, fresh observation state and read-error retry. Controlled callback delivery in that mode is explicitly synthetic. Screenshots and `report.json` go to the output folder, which is not committed. See the [validation report](validation/Memory-integration-v1.md).

The default smoke passed 62/62 on the `59d4cec` baseline and again on the native-window feedback release on 2026-10-07, including the guarded OS hotkey step, clean exit, empty autofill table and restart reads. See [earlier regression evidence](validation/Native-regression-2026-10-07.md) and [latest window/repeated regression evidence](validation/Native-window-v1.md), which also records intermittent search-opening observations. This is all checks in that script, not complete W01–W05 acceptance or a rerun of every focused mode.

Each test chooses temporary debugging ports and checks that the listener belongs to the spawned Runtime's process tree before connecting. An unrelated listener is refused. UI Automation touches only the test process's native dialog, and failure closes all debug sessions and terminates only spawned test children.

`--explorer-only` uses a fresh synthetic Vault, seeds approved fixtures through real Core IPC, and checks paging, a canonically stale cursor, explicit refresh and controlled read-error recovery. Its import-file argument is unused but retained for the shared command signature.

`--picks-only` uses a fresh synthetic Vault and a synthetic Markdown input. It creates its other input and empty backup folders inside the output directory, checks controlled import-preview failure, performs one real import, Vault verification and backup export, checks their displayed Core result counts, and validates restore preview plus rejection/recovery. It never performs a restore. See [operation result evidence](validation/Operation-results-v1.md).

`--damaged-verify-only` requires a dedicated temporary `enouia-runtime-damaged-verify-` fixture root with sibling `vault` and output folders. It imports its own source, refuses unexpected object count/name/bytes, changes that object's bytes, verifies actual corrupt-object reporting, restores the exact bytes in `finally`, and verifies a clean result with an unchanged canonical head. The import argument is unused. This is a controlled integrity probe, not an automated repair or personal-Vault workflow; see [operation result evidence](validation/Operation-results-v1.md).

`--contrast-only` uses a fresh synthetic Vault, emulates forced-colors media in the owned WebView2 page, checks navigation/collection selection and CDP-scoped Tab focus, then clears the emulation. The import argument is unused. This does not change Windows theme settings or complete W05.

`--accessibility-only` requires its dedicated fresh temporary synthetic Vault. It reads native UI Automation only beneath the owned Runtime main HWND, checks named controls/landmarks across seven surfaces, verifies skip-link/next-control focus, creates two actual synthetic sessions to distinguish their names, and checks a real review modal and Escape cancellation. UTF-8 captures preserve provider text; provider readiness and sequential checked fixture writes precede assertions. The import argument is unused. See [native accessibility evidence](validation/Native-accessibility-v1.md); Narrator and speech events remain unverified.

`--keyboard-journey-only` requires a dedicated empty temporary synthetic Vault. Its task actions use Tab, Enter, Space, Ctrl+2/Ctrl+4 and CDP text insertion in the owned page, without direct DOM clicks, focus, setters or Core fixture writes. Actual receipts/readbacks and native UI Automation confirm review, source, session answer/checkpoint and saved Context/preview results and focus. The import argument is unused. See [keyboard journey evidence](validation/Keyboard-journey-v1.md).

`--plan-keyboard-only` creates one synthetic candidate in a fresh Vault and checks review-plan focus, Tab containment, navigation suppression, Escape cancellation, focus return and the absence of an approved memory. Its keys stay inside the owned CDP page, and the import argument is unused. See [keyboard acceptance evidence](validation/Plan-keyboard-v1.md); this does not establish Narrator acceptance.

`--stale-plan-only` prepares a real review plan, changes its candidate through another real confirmation on the same synthetic Core and checks the stale refusal, disabled confirmation, cancellation refresh, retained draft and fresh-plan recovery without duplicate approval. The import argument is unused. See [stale-plan recovery evidence](validation/Stale-plan-recovery-v1.md); this does not establish concurrent third-party-client or clock-expiry behavior.

`--confirm-only` creates a synthetic candidate and confirms its real plan while deferring delivery of the actual receipt. It checks pending dismissal guards, waiting feedback, controlled retryable delivery failure, identical retry arguments/key, receipt replay and the single resulting memory. CDP observes only the owned page, and the import argument is unused.

`--lists-only` holds initial session/candidate list results, injects controlled read errors and checks recovery against real empty/nonempty Core pages. It also creates a session, confirms a synthetic candidate and checks retained unsent draft fields. The import argument is unused.

`--context-only` checks saved preview/read states and controlled delivery/read failures, approves and indexes a synthetic fixture, and verifies a local Mock dispatch's actual request against the selected capsule. Replacement-preview retry keeps its query and remains unsent. The import argument is unused; no live Provider is called.

`--sessions-only` creates two synthetic sessions, holds an older real detail reply until a newer selection has completed, and checks each branch's unsent question/checkpoint drafts. It also holds a real local Mock answer receipt, checks the write guard, then verifies the transcript and provisional checkpoint through Core. The import argument is unused.

`--session-writes-only` holds actual creation, local Mock answer and checkpoint receipts. A controlled retryable answer-delivery error tests identical retry payload/key, receipt replay, draft edits after the error and the absence of duplicate turns. The import argument is unused.

`--explorer-keyboard-only` approves three synthetic fixtures and uses owned-page CDP keys to check arrow selection/focus, Space, Tab-relative movement, list boundaries and the actual selected inspector. Search and toolbar arrow keys stay outside the list handler. The import argument is unused.

`--transcript-only` records actual empty/supported local Mock turns, checks literal statements and source references, keyboard access to exact raw response text, then restarts the host and rereads the saved transcript. The import argument is unused.

`--layout-only` uses a fresh synthetic Vault with long approved content and a long folder name, emulates 1100×700 and 1600×700 in the owned WebView2 page, and checks all seven surfaces for document/pane overflow. It also checks correction label association and reachability inside the scrolling inspector. The import argument is unused. See [layout evidence](validation/Minimum-layout-v1.md); physical resize, monitor/DPI and Narrator remain unverified.

`--source-paging-only` approves two synthetic fixtures and reads bounded real Core excerpts of a long Chinese/emoji source. It checks exact byte reconstruction, retryable read failure, source restart and selection changes while older receipts are held. The import argument is unused. See [source paging evidence](validation/Source-paging-v1.md); delivery timing is controlled and does not establish storage-error recovery.

`--native-window-only` resizes only its own main HWND at the existing display DPI, checks titlebar/external maximize and restore, minimize/show, stale state reads, retained unsent session draft and denied overlay access to the new read permission. The import argument is unused. See [native window evidence](validation/Native-window-v1.md); it does not change system display settings or prove other monitors/DPI or mouse-drag minimum enforcement.

`--forget-only` approves two synthetic fixtures, checks deletion-impact preview and cancellation of a real permanent-purge plan, then confirms a separate logical-forget plan. It checks retained candidate feedback/count, focus, the refreshed memory list and preserved source/second memory. No permanent purge is executed; the import argument is unused. See [deletion feedback evidence](validation/Forget-plan-feedback-v1.md).
The combined default smoke retains the main branch's 3,000-conversation cancellation/resume and paging/retry checks. Login startup is read-only in this harness; Rust tests exercise the registry round trip on an isolated test key. Autostart ignores a supplied Vault, compatibility commands share the shell, and a cancelled session end keeps the owned process alive. Restart Manager registers only that spawned process's PID and creation time, never the executable path, before testing the OS exit/shutdown route. It does not install, upgrade or uninstall an owner's application.

The combined release passes 101/101 default native checks plus the focused confirmation, stale-plan, picker/backup and integrity probes. See [2026-10-07 stack integration evidence](validation/Desktop-stack-integration-2026-10-07.md) for the preserved pin, executable/installer hashes, exact checks and installed-artifact limits.

## Bumping the pin

1. Read the new rows in Memory's compatibility log, `docs/integration/RUNTIME.md`. Review `git log <old>..<new> -- crates contracts apps/workspace` in the Memory repository.
2. Set `rev` for both Memory dependencies in `apps/desktop/src-tauri/Cargo.toml` to the new full SHA. If Memory changed an exact workspace pin (for example `serde_json`), align the desktop's own exact pin with it.
3. In `Cargo.lock`, replace the old revision with the new one on the Memory `source` lines only. Then run `cargo fetch --locked` online and `cargo metadata --offline --locked`. If Memory's manifests changed its dependencies, `--locked` fails. Only then run `cargo update -p enouia-memory-workspace -p enouia-memory-contract`, and revert any re-resolution of unrelated packages. That command can also move sibling edges (for example `syn`, `windows-sys`).
4. Update `docs/integration/memory-pin.json`: the revision, the Memory surface aggregate, `contract` (schema version and command count) and the date.
5. Adapt the adapter and the surfaces to what the log asks for. Keep `WRITES` equal to the contract.
6. Fetch the new revision into a Memory checkout. Then run every check above, the smoke test and `node scripts/check-memory-integration.mjs --memory-checkout <dir>`. The checker reads the surface manifest committed at the pinned revision, whatever the checkout's HEAD is. Record the result in a validation note.
7. Commit `Cargo.toml`, `Cargo.lock`, the pin record and the adapter changes together.

Never commit a path dependency, branch, `[patch]` or a lockfile produced by a local override. Builds use `--locked`, so a stray override fails.

## Parity with Memory's reference shell

| Capability | Status in Runtime |
|---|---|
| Typed workspace channel, picker tokens, window scope, lifecycle, exit shutdown | Implemented |
| Memory explorer, review, remember, correction, forget/purge plans, import, Vault and recovery, Sessions, Context | Implemented |
| Tray (show, lock, exit), close-to-tray | Implemented; [local lifecycle evidence](validation/Tray-lifecycle-v1.md) and [actual long verify/backup close, page lock, Settings exit and cooperative Restart Manager](validation/Long-operation-lifecycle-v1.md). Physical tray-menu interaction and actual Windows sign-out/shutdown remain unverified. |
| Global hotkey and quick-search overlay (`HostSurface::QuickSearch`) | Implemented; [local native evidence](validation/Quick-search-v1.md), including OS input, conflict, scoped refusals, clear-on-hide and exit/re-registration |
| One Vault per cooperating Runtime host | Implemented; [root admission evidence](validation/Root-admission-v1.md). Other Memory clients do not share this guard. |
| Opt-in login startup | Implemented (ADR-026) |
| Current-user installer, upgrade and downgrade rules | Implemented ([ADR-027](adr/027-desktop-installer.md)): `npm run desktop:bundle`, unsigned |
| Code signing of the installer and executable | Pending |
| Runtime-hosted W01–W05 acceptance | Partial. Synthetic smoke and focused reports cover selected review, import cancellation/resume, paging, retry, sessions/context, lock, close/exit and window-scope paths. The pinned Core additionally owns cross-client Vault locking; Runtime's directory guard is an extra cooperating-host boundary. Historical installed-artifact drills are in the ADR-027 report. Still pending: broader real storage-error recovery, personal-data/provider acceptance, Narrator, a real contrast theme, actual sign-in startup and physical tray-menu interaction. |

Memory's reference shell stays Memory's acceptance harness. Use Runtime as the client; the Core refuses a second embedded Core on the same Vault.

## Boundaries

- **Activity & Usage.** It stays independent: its own data root, runner, scheduler and delivery. Nothing from Activity enters `memory_call`. Memory never reads Activity.
- **Cloud stages.** Runtime implements no Provider call, MCP endpoint, gateway, replica or sync. When Memory ships them they arrive through a pin bump, or through a Host client after MV-8.
- **Runtime-local Core crates.** `enouia-memory`, `enouia-session`, `enouia-context`, `enouia-provider` and `enouia-core-contract` are frozen history (ADR-025). Do not extend them, and do not mix their DTOs with Memory's.
