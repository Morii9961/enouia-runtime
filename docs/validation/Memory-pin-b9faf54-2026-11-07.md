# Memory pin compatibility, 2026-11-07

Runtime branch baseline: `94bbce9` (origin/main). This slice pins Memory to merged main `b9faf544da272bfe821c621d59a979b1a434e355` ([Memory #84](https://github.com/Morii9961/enouia-memory/pull/84), [Memory #85](https://github.com/Morii9961/enouia-memory/pull/85)). Its surface aggregate is `15a5385770b1077984078280062c85e8b0a5da622632a18c3aa8253572cb0728`. Memory's own full check on the merged source `47ab7cd` passed (workspace tests 1007 passed / 0 failed / 4 ignored, strict Clippy, schema and surface).

## Change and compatibility review

All five manifest revisions and nine locked Memory packages use that exact SHA. Workspace v1 retains schema 1 and 58 commands. Between the previous pin `0d338f12f51a859363e0725071bcf43874b492c7` and this pin, `crates/enouia-memory-workspace`, `contracts/ipc/memory-v1.schema.json`, `apps/workspace/src`, `crates/enouia-memory-provider` and every Cargo manifest/lockfile in Memory have no diff. The surface changes are Owner-root Host/Vault/contract files: MCP-4 correction, supersede and forget-request transports and storage, MCP-5 opening prompt/resources and `session_start`, read-boundary enum representation fixes, and the capture-wire refusal of object-tagged `mode`/`kind`/`speaker`. Runtime's typed capture client is not used here and would already send strings. None of these APIs activates itself in Runtime.

`cargo fetch --locked` accepted the updated lockfile directly: only the nine source revisions changed, with no dependency-edge, registry or package movement. No path, branch or patch source was introduced.

## Checks actually run

- `cargo fmt -- --check`; offline `cargo test --locked`: 51 native unit/adapter tests and 8 pinned-Core consumer tests passed.
- Offline `cargo clippy --locked --all-targets -- -D warnings` passed.
- Locked metadata plus `check-domain-boundaries.mjs --self-test`: 9 Memory packages at the same SHA; 7 negative cases passed.
- `check-memory-integration.mjs`, its 8-case self-test, and `--memory-checkout` against a Memory checkout at `b9faf54` (surface matches the pinned revision) passed. Activity/Usage retirement guard passed.
- `npm test`: 139 Node tests passed, 3 existing skips; all 88 Happy DOM fixtures passed. These are synthetic frontend checks, without native IPC.
- `npm run build` passed, including TypeScript; main JS 461.58 kB. `cargo build --locked --features custom-protocol` built the debug native executable against these assets. No installer/bundle was produced.
- Real owned-process `memory-smoke.mjs --automatic-only`: 36/36 passed on a fresh temporary synthetic root and WebView profile (read-1 IPC, refusals, lock, close-to-tray, worker joins, fresh-root restart).
- Real owned-process `memory-smoke.mjs --catalog-only`: 39/39 passed on a fresh segmented synthetic root (read-2 page/stats, refusals, lock/unlock, exit, new-root restart, autostart skip). This exercises the changed segmented Vault code path.

Logs remain in ignored local validation output. The normal-mode full smoke was not rerun: Workspace code/schema are unchanged and all eight consumer tests passed. No personal Vault, credential, real Provider, Owner enrollment, production activation, deployment or human acceptance is implied.

## Next boundary

This is pin compatibility only. Runtime still exposes Workspace v1 plus the explicit synthetic read-1 and read-2 entries. Adopting the Owner pipeline (Owner initialization, Runtime capture pipe-2 producer, hosted captured worker with corrections, Agent MCP context profile) is a separate integration slice that needs an owner decision on which entry comes first.
