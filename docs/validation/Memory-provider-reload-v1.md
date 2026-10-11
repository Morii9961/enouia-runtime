# Memory Provider setup reload and recovery

Date: 2026-10-11 (Asia/Shanghai). Baseline: Runtime `main@0abe87ef0ac4da7eb9eee99ee4e933fd28d774ab`; implementation branch `codex/memory-provider-reload`. Memory remains pinned to `8186aed861af08cf7a2c5d8c912a24eae51b4d66` (47 commands). This is a Runtime adapter/UI slice within ADR-032, with no Memory domain, Activity or production change.

## Behavior

- A main-window-only `memory_provider_reload` reloads the fixed host settings file without accepting a page path, file text or key. It opens no credential prompt and dispatches no request.
- Settings reads stop at 64 KiB plus one probe byte. Missing/invalid configuration removes native setup only after Core accepts the change. Reload/key actions are serialized with a non-queuing host guard; close admission and active Core sends refuse changes. Core refusal preserves the previously observed setup.
- Sessions supplies setup instructions, field-specific refusal text, **Reload settings**, and **Read status again** after failed observation. Reload is disabled during local sends and held reviews. A failed reload reply still re-observes Core state.
- The default native command object is stable. The original component recreated it on each render, changing the refresh effect dependency and triggering a render/read loop. Before the UI fix, the browser fixture recorded 672 calls and failed `initial_status_read_once`; after the fix, each initial status/setup read occurs once.
- Owner configuration still uses a manual JSON file. No settings editor, auto-discovery, credential access, real-provider verification or grant bypass is claimed. See [owner guide](../PROVIDER_SETUP_v1.md).

## Evidence

| Check | Result / scope |
| --- | --- |
| `npm ci` | Locked dependencies installed; no dependency or lockfile changed. |
| `npm test` | 67/67. Includes native reload command shape with an empty argument object. |
| `npm run check`, frontend build (also run by desktop build) | Passed. |
| src-tauri `cargo fmt -- --check` | Passed. |
| src-tauri `cargo test --locked` | 61 host tests plus 3 pinned-Core rendered-field tests passed. |
| src-tauri `cargo clippy --locked --all-targets -- -D warnings` | Passed. |
| `check-memory-integration.mjs --self-test` | Pin consistent; 8 negative checks passed. |
| `cargo metadata --offline --locked` + `check-domain-boundaries.mjs … --self-test` | Desktop dependencies preserve domain separation; 7 negative checks passed. |
| `npm run desktop:build` | Release executable built successfully, without an installer. |
| Browser-mounted `e2e/provider-setup.html` | 11/11 using only synthetic IPC; [recorded result](Memory-provider-reload-browser.json). |

The native regression creates a fresh temporary synthetic Vault through real Core IPC, injects a fake secret store and held fake transport, confirms a synthetic grant and starts a synthetic send. Invalid settings and removal are both refused with `provider.call_running`, while native and Core observations stay configured. Cancellation allows reload to turn native sending off. The test joins shutdown before deleting its owned fixture. No HTTP or Credential Manager operation is performed.

The browser fixture mounts the actual ExternalPanel with its default native client and a synthetic transport, exercising missing → ready → refused busy → invalid → absent states, read failure/recovery and a reply lost after a successful reload. It records every command and refuses anything beyond provider status/setup/reload. The fixture also has `?preview` for manual layout inspection; it is excluded from the production Vite entrypoint. Expandable instructions and the button were visually inspected in the browser.

## Limits and execution prerequisites

Full native Memory smoke, physical input, a configured setup in the built app, Windows credential UI, Credential Manager, HTTPS, real Provider/extraction and owner acceptance were not run. Saved synthetic evidence does not establish daily-use v1 or Memory MV-7 live acceptance. The owner's settings, keys, Vaults and installed Activity scheduler were not accessed by these checks.

Sandbox Vite SSR initially failed `module is not defined`; the identical tests passed outside that filesystem sandbox. The first desktop build attempt lacked Cargo in PATH; adding the documented MinGW/Cargo paths resolved it. The domain checker initially lacked its required metadata argument; the corrected metadata-based command passed. Two new test-fixture issues (a type import and read commands receiving a write key) were corrected before the final native suite; a browser text assertion was narrowed to actual buttons and its worker-error text corrected before the final 11/11 run.

Automatic approval rejected `desktop:bundle`, stating installer work requires a separate owner instruction. No installer was built, installed or deployed; the ordinary `desktop:build --no-bundle` check succeeded. The existing status snapshots, AGENTS.md edit and unrelated handoff/prompt files remain separate from this implementation commit.
