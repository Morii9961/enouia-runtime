# Native Runtime Inspector

Date: 2026-10-18 (Asia/Shanghai). Product baseline: `main@b8254d8a8a88d67cd92e7f0d8ce72964a62f344e`. Memory remains pinned at `56bc5eb8b08fb80cd6df892bf53d200ff23afc4c`, workspace IPC v1, 47 commands. Work follows the [desktop v1 delivery plan](../RUNTIME_V1_DELIVERY_PLAN.md); the owner confirmed that general-purpose model tools belong to a later stage.

## Behavior

Native App routing now mounts `src/runtime/RuntimeSurface.tsx` instead of the historical fictional Inspector. Memory reuses the shared status poll and excludes Core's fixed Activity component. Windows shell reads use `shell_status`; Activity independently reads `activity_setup` with `action: status`, then `activity_get_overview` only when configured. No new command, capability, dependency, pin, persistence or native handler is introduced.

Shell and Activity display their last read time and explicit reread controls. Each section clears its old result on a new read or failure; failures do not erase another component's observation. Duplicate pending reads are withheld, unmount invalidates late publication, and a completed explicit read restores focus only if it still belongs to that control. Shared Memory failures and lifecycle transitions withhold old Vault details. Transported delivery does not claim observed publication, registered tasks with unknown enablement stay unknown, and date-only Activity timestamps retain their precision.

The header now says Connected workspace. Browser App routing keeps its labelled fictional Inspector. The native smoke's two historical demo expectations were updated; that smoke was **not** rerun in this slice.

## Development checks

| Check | Evidence |
| --- | --- |
| `npm --prefix apps/desktop test` | Passed: 98 Node tests and all 59 DOM fixtures, including the initial 19-assertion Inspector journey. |
| Final affected journey | `node apps/desktop/tests/dom-fixtures.mjs --worker runtime-inspector`: 21/21 passed after adding the read-control focus handling and two focus assertions. The other 58 fixtures and Node-tested code did not change; their passing evidence is reused rather than rerunning the whole gate. |
| Strict fixture typing | Passed with the installed TypeScript compiler, strict ES2022/bundler/React JSX flags, `--allowJs`, `--allowImportingTsExtensions` and `src/vite-env.d.ts`. |
| Script syntax | `node --check` passed for the DOM runner and updated native smoke. |
| Web assets and TypeScript | `npm run desktop:build` runs the production `npm run build` prerequisite; the final build result is recorded below. |
| Memory pin guard | `check-memory-integration.mjs --self-test`: consistent `56bc5eb`, 3 declared crates, 8 locked packages, 8 negative checks. |
| Resolved dependency boundary | Offline locked Cargo metadata plus `check-domain-boundaries.mjs --self-test`: desktop boundaries passed, same pin, 7 negative checks. |
| Native tests/Clippy/format | Reuse the unchanged native-source/dependency/pin evidence in [the pin report](Memory-pin-56bc5eb-2026-10-17.md). No new native test run is claimed. |

The Inspector fixture mounts the actual App, so it verifies connected/browser routing, not just an isolated replacement component. Its allowlisted mock transports admit only `workspace_status`, `shell_status`, `activity_setup:status` and `activity_get_overview`. It covers pending/absent setup, component health and counts, failure isolation and recovery, locking/change/exit gates, scheduler/publication distinctions, double-click admission, focus ownership and delayed replies across unmount/remount.

All IPC replies in this journey are synthetic. No personal Vault, raw Activity history, credential prompt, real Provider, package selection, collection, upload, task registration, installer or deployment was used. Happy DOM focus loss is explicitly simulated; this does not establish physical keyboard/Narrator behavior, native layout or Morii acceptance. Unified acceptance remains pending.

## Final build

Final `npm --prefix apps/desktop run desktop:build` passed, including the production TypeScript/Vite prerequisite. The no-bundle Windows release build completed in 1 minute 37 seconds at `apps/desktop/src-tauri/target/release/enouia-desktop.exe`. This builds an executable; it does not install or launch it, sign it, or establish native product acceptance.

Executable SHA-256: `0a7ef23184c9e824c866db9d935b06c0ba910b20b075ce6e30d2a618e7fd8cc8`. Document references and the staged diff were checked before commit; the status snapshot was not regenerated.
