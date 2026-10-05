# Memory integration v1

Enouia Runtime is the Windows client for Enouia Memory's local part ([ADR-025](adr/025-enouia-memory-integration.md)). It embeds Memory's workspace Core at a pinned Git revision behind a Runtime-owned adapter. The Memory, Context and Sessions surfaces are Memory's local frontend. The Memory repository owns the domain, the contracts and every cloud stage. Its [integration handoff](https://github.com/Morii9961/enouia-memory/blob/main/docs/integration/RUNTIME.md) lists host duties, known Core behavior and the compatibility log that routes each Memory-side change here.

## Pinned revision

| Field | Value |
|---|---|
| Repository | `https://github.com/Morii9961/enouia-memory.git` (public) |
| Revision | recorded in [docs/integration/memory-pin.json](integration/memory-pin.json), in `apps/desktop/src-tauri/Cargo.toml` and in its `Cargo.lock` |
| Consumed crate | `enouia-memory-workspace`, plus `enouia-memory-contract` for tests only |
| Contract | workspace IPC v1 (`schemaVersion: 1`, 36 commands) |
| Memory surface digest | the aggregate from Memory's `docs/integration/runtime-surface.json` at that revision |

`node scripts/check-memory-integration.mjs` checks that the pin record, the manifest and the lockfile agree. It also checks that the revision is a full SHA and that no path, branch or `[patch]` source is committed. Given `--memory-checkout <dir>`, it compares the recorded surface digest with that checkout's manifest.

## Adapter (`apps/desktop/src-tauri`)

- **State.** One `Workspace::new(Config::default())` per process, held by `MemoryHost` in `src/memory.rs`.
- **`memory_call(request)`** forwards one workspace IPC v1 envelope. Core errors come back inside the envelope (`kind: "memory_error"`, `{code, retryable, rules}`). Host failures are the plain strings `permission_denied` and `worker_failed`.
- **`memory_pick(kind)`** opens a native dialog for `import_file`, `vault_root`, `backup_destination` or `export_folder` and registers the choice with the Core. It returns `{token, displayName, bytes}`, `{cancelled: true}` or `{error}`. The page never receives a path.
- **Scope.** The native window label maps to Memory's `HostSurface`. Only `main` maps, to `HostSurface::Workspace`; every other label is refused. Request fields cannot widen the scope.
- **Threading and lifecycle.**
  - Every call runs on `spawn_blocking`.
  - `vault_open`, `vault_create`, `vault_lock` and `vault_unlock` take a gate exclusively. The commands that start operations (import, index rebuild, verify, backup) take it shared, so no operation can start on a Vault handle that is closing.
  - Plain reads are not gated. While a lock waits for verify or backup, which cannot be cancelled, status and progress still answer.
  - Closing the window keeps it open while the shell takes the gate and calls `shutdown()`. That cancels import and index work, waits for verify and backup, and releases the Vault and index. Then the process exits.
- **Data root.** No root is remembered or opened by default. The owner opens or creates one through the native dialog; creating one needs the typed phrase `create new vault`. The owner can also name a root with `--memory-vault <dir>`. The root must not sit under a Git working tree, a sync folder, Program Files or Windows, and the Core refuses such roots.
- **Permissions.** `build.rs` declares only `memory_call` and `memory_pick`. The `main-window` capability grants those two commands plus window controls; there is no `fs`, `shell`, `http`, dialog, opener, provider or Activity permission. The CSP is `default-src 'self'` with `connect-src ipc: http://ipc.localhost`, `form-action 'none'`, `base-uri 'none'` and `freezePrototype`. WebView2 general autofill is off (`generalAutofillEnabled: false`), and Memory inputs set `autocomplete="off"`, so the WebView profile keeps no copy of typed memory text.
- **No copies.** The adapter writes no logs and persists nothing. Memory text exists only in the Vault and in the page's memory while a surface shows it.

## Frontend (`apps/desktop/src`)

- **Mode.** Inside the native shell (`isTauri()`), Memory, Context and Sessions use the pinned Core. A browser preview keeps the explicitly labelled fictional demo, unchanged. The header badge states which mode is active ("Memory · Vault open · Activity & Inspector demo"). Activity and the Runtime Inspector stay fictional until their own handlers exist, and in the native shell the Inspector's subtitle says so.
- **Client.** `src/memory/client.ts` mirrors Memory's reference client:
  - Request envelope `{schemaVersion: 1, requestId: "req_<uuid>", command, idempotencyKey, arguments}`.
  - One `ui-<uuid>` key per user submission. A retry resends the same payload with the same key.
  - `WRITES` must equal the pinned contract's write commands. A desktop Rust test enforces this.
- **Hooks.** `src/memory/hooks.ts` ports `useAction` and `useLatestRead`. Only the latest read publishes its result, error or busy state. A retry is offered only for `retryable` errors.
- **Surfaces** (`src/memory/*.tsx`), drawn in the Quiet Runtime language:
  - **Memory Vault.** Candidate inbox with accept, edit-and-accept or reject through the review plan and its confirmation code; remember-a-statement; the canonical explorer with literal search, history and paging; detail with evidence and source excerpts; correction proposals; delete-impact preview; forget and purge plans; Import; Vault and recovery: open/create/unlock/lock, verify, index rebuild, backup to an empty folder, restore preview.
  - **Sessions.** Branch list, transcript, unfinished turns, provisional checkpoints, asking the local Mock, and a link to the capsule behind an answer.
  - **Context.** Compile preview, the inclusion and exclusion decisions, and dispatches with the verified actual request.
  - **Home and Settings** show the Vault state and Memory's component states from `workspace_status`. Memory's fixed `activity` row is not shown; Activity keeps its own surface. The Runtime Inspector's component descriptions stay documentation references.
- **Rendering.** Memory and source text render as plain text nodes only. There is no Markdown or HTML rendering and no link navigation. Source excerpts are labelled as data, not instructions.

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
cargo test --locked                   # adapter unit tests and the pinned-Core rendered-field tests
cargo clippy --locked --all-targets -- -D warnings
cd ..
npm ci
npm run check
npm test
npm run build
npm run desktop:build                 # embedded-assets executable, no installer
cd src-tauri
cargo metadata --offline --locked --format-version 1 > target/desktop-metadata.json
node ../../../scripts/check-domain-boundaries.mjs target/desktop-metadata.json --self-test
cd ../../..
node scripts/check-memory-integration.mjs --self-test
```

`apps/desktop/e2e/memory-smoke.mjs <exe> <vault-root> <import-file> <out-dir>` drives the built executable over WebView2 remote debugging on loopback, which is enabled only in that test's environment. It uses a synthetic Vault created outside any Git working tree, for example with the pinned Memory revision's `enouia-memory init <dir> --confirm-new-vault`, plus a synthetic Markdown file for the import picker. Screenshots and `report.json` go to the output folder, which is not committed. See the [validation report](validation/Memory-integration-v1.md).

## Bumping the pin

1. Read the new rows in Memory's compatibility log, `docs/integration/RUNTIME.md`. Review `git log <old>..<new> -- crates contracts apps/workspace` in the Memory repository.
2. Set `rev` for both Memory dependencies in `apps/desktop/src-tauri/Cargo.toml` to the new full SHA. If Memory changed an exact workspace pin (for example `serde_json`), align the desktop's own exact pin with it.
3. Run `cargo update -p enouia-memory-workspace -p enouia-memory-contract` online. Check that the lockfile diff touches only Memory's sources and whatever its new manifests require.
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
| Tray (show, lock, exit), close-to-tray | Pending. Runtime's close exits; the Core shuts down first. |
| Global hotkey and quick-search overlay (`HostSurface::QuickSearch`) | Pending |
| Opt-in login startup, current-user installer, upgrade and downgrade rules | Pending (`bundle.active` is false) |
| Runtime-hosted W01–W05 acceptance | Partial. The smoke covers selected W01, W03 and W04 paths and index rebuild (W02). Still pending: cancel/retry/paging/error recovery (W02), the Vault folder picker (W01), one-Core-per-Vault (W03), and Narrator, contrast theme and installed artifact (W05). |

Until each pending row ships, Memory's reference shell provides it, but never against the same Vault while Runtime has it open.

## Boundaries

- **Activity & Usage.** It stays independent: its own data root, runner, scheduler and delivery. Nothing from Activity enters `memory_call`. Memory never reads Activity.
- **Cloud stages.** Runtime implements no Provider call, MCP endpoint, gateway, replica or sync. When Memory ships them they arrive through a pin bump, or through a Host client after MV-8.
- **Runtime-local Core crates.** `enouia-memory`, `enouia-session`, `enouia-context`, `enouia-provider` and `enouia-core-contract` are frozen history (ADR-025). Do not extend them, and do not mix their DTOs with Memory's.
