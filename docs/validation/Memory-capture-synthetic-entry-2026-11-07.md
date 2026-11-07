# Synthetic Owner capture entry, 2026-11-07

Runtime branch baseline: `884a6a8` (origin/main, Memory pinned at `b9faf544da272bfe821c621d59a979b1a434e355`). Morii chose the Runtime capture pipeline as the first Owner-pipeline entry, with two decisions recorded on 2026-11-07: use Memory's in-process native producer API rather than a cross-process pipe-2 producer, and use fixed synthetic conversations rather than Sessions turns.

## Scope

`--memory-capture-synthetic` creates a fresh `automation-segmented-owner-v1` root under the temporary directory, sets a one-hour policy with a six-source pool, enrolls this desktop process as the Owner-root Runtime producer for five minutes (Memory's upper bound), and starts Memory's hosted captured worker with a Runtime lookup analyzer. The main-window-only `memory_capture` command exposes status, preflight, write, jobs, page and lock over three fixed exchanges (one user and one assistant turn each, English and Chinese). See [Memory integration v1](../MEMORY_INTEGRATION_v1.md#synthetic-owner-capture-entry).

Not covered: a frontend panel, Sessions turns, pipe-2 across processes, enrollment renewal, real analyzer/Provider/embedding, personal Vault, Owner initialization or migration, installer.

## Checks actually run

- `cargo fmt -- --check`; offline `cargo test --locked`: 55 native unit/adapter tests (four new capture tests: closed boundary, background formation with same-key replay, lock revocation, enrollment expiry with a fake clock) and 8 pinned-Core consumer tests passed. The formation test passed five consecutive focused runs.
- Offline `cargo clippy --locked --all-targets -- -D warnings` passed.
- `check-memory-integration.mjs`, Activity/Usage retirement guard, and locked metadata with `check-domain-boundaries.mjs --self-test` passed. No dependency changed.
- `npm test`: 139 Node tests passed, 3 existing skips, plus the Happy DOM fixtures; `npm run build` passed. `cargo build --locked --features custom-protocol` built the debug native executable.
- Real owned-process `memory-smoke.mjs --capture-only`: 18/18 passed on a fresh temporary Owner root and WebView profile: explicit entry, other channels not adopting the root, empty start, preflight without queueing, separate capture/queue receipts, background formation of user turns only (assistant turns `no_memory`), content-free job status, System-authored formed records with receipts and quoted titles, same-key replay, version/turn-text/identity refusals, overlay refusal, lock revocation, exit joining the worker, fresh-root restart and autostart skip.
- Regression owned-process smokes: `--automatic-only` 36/36 and `--catalog-only` 39/39.

Two findings during the slice were Memory rules, not defects: one producer enrollment may last at most five minutes, and a formed title is kept only when it quotes the turn (otherwise the turn's prefix is used). The fixture follows both.

Logs remain in ignored local validation output. No personal Vault, credential, real Provider, deployment or human acceptance is implied.

## Next boundary

A frontend panel for this entry, explicit enrollment renewal, the choice between capturing Sessions turns and a separate producer process over pipe-2, and a real analyzer each need an owner decision.
