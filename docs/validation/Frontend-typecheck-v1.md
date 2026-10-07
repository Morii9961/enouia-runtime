# Full frontend type checking — local evidence

Date: 2026-10-05. Baseline: `36e77ab`. Scope: the existing Quiet Runtime frontend and its build gate. All runtime checks used synthetic data on one Windows development host.

## Change

The previous strict compiler gate covered only `demo-state.ts` and `src/memory`. It now covers every file under `src` and `vite.config.js`. The outer App, entry point, seven demo pages, fixtures and window controls use TypeScript. Page props derive from the actual view builder; events, state, fixture tuples and session event variants have explicit types. Empty Memory selection stays nullable and is narrowed before rendering. Lists use their actual row identities. `npm run build` runs the compiler before bundling, including when invoked by Tauri.

The Memory pin, adapter, connected surfaces, Rust sources, dependencies, CSS and frozen design corpus are unchanged. No personal Vault, Activity state, scheduler, account, installer or production deployment was used.

## Checks

| Command or observation | Result |
|---|---|
| `npm ci --offline --no-audit --no-fund` | Pass from the existing cache; no dependency or lockfile change |
| `npm run check` | Pass for all frontend source and Vite configuration |
| `npm test` | 13 pass: 4 demo-state, 5 Memory-client and 4 actual React-rendering tests |
| `npm run desktop:build` | Pass; the build runs the full compiler gate, Vite and the Windows GNU release build with embedded assets, without an installer |
| Desktop `cargo fmt -- --check`, offline `cargo test --locked`, `cargo clippy --locked --all-targets -- -D warnings` | Pass; 7 adapter unit tests and 3 pinned-Core integration tests |
| Desktop offline locked Cargo metadata and `check-domain-boundaries.mjs --self-test` | Pass; 7 pinned Memory packages, 7 negative checks |
| `check-memory-integration.mjs --self-test --memory-checkout <Memory checkout>` | Pass; pinned surface matches, 8 negative checks |
| Real release application `memory-smoke.mjs` | 28/28 pass on a fresh temporary synthetic Vault; 6 screenshots saved; Home, Memory detail and Context screenshots inspected |
| `git diff --check` | Pass |

React rendering tests cover all seven pages with explicit demo disclosure, empty literal search, edited approval and revision provenance, the unchanged recorded capsule, and ordered events for every demo session. They render actual TSX components using Vite and React; they do not simulate native IPC or browser interactions.

The native smoke exercises real Tauri IPC and the pinned Core: review plans, text-only rendering, correction candidates, native file import, local Mock and saved Context request inspection, index rebuild, lock/unlock, permission and CSP refusals, shutdown, empty autofill storage and persistence after restart. The synthetic Vault was initialized through Memory's existing CLI outside Git. The machine report and screenshots remain in the temporary test folder.

Release executable SHA-256: `327a05822a57abf98ce8b8efcefc54f1e2860c1417c187137b629a078ee00258`.

## Limits

Vite build and native smoke ran outside the restricted execution sandbox. Vite's render loader also passed there; under the sandbox it failed with `module is not defined`. The root Rust behavioral suite was not rerun because its sources and dependencies did not change.

This adds a compiler/build gate and regression evidence, not full A3/J1 or W01–W05 acceptance. Tray, hotkey/overlay, login startup, installer/signing, remaining cancellation/paging/recovery and accessibility gates, personal data and production activation retain their [existing status](../MEMORY_INTEGRATION_v1.md#parity-with-memorys-reference-shell).
