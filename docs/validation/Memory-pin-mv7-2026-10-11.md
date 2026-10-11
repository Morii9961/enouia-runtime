# Memory pin bump to the MV-7 hosting revision (2026-10-11)

The desktop shell now embeds Enouia Memory `3f1671b8c8053d821b3d4086d731e978ab6e524b` (branch `codex/mv7-native-providers`), replacing `ff692cc`. The surface aggregate is `90e8631374d89af61ecb82297cd4c56bbe5e31b843e45da0884f19324d484f03` and workspace IPC v1 now has 43 commands. `enouia-memory-provider` joins the pinned crates (Memory ADR-MEM-48).

## What changed here

- `Cargo.toml` and `Cargo.lock`: new revision and the Provider crate. Re-resolution only added packages (rustls, ring, platform verifier, tokio-rustls and their dependencies); no existing version moved. `zeroize` was set to Memory's locked 1.9.0, so every added package matches Memory's lockfile.
- `client.ts`: `WRITES` gains `provider_confirm`, `external_prepare` and `external_send`, and the page explains the rules added since `ff692cc` (`workspace.key_reuse`, `workspace.token_busy`, `workspace.excerpt_budget`, `import.input_*`, `mock.recompile_required`, `provider.*`, `review.stale_plan`).
- The adapter's lifecycle-gate test lists the three new gated commands. The gate itself is derived from the contract, so its code did not change.
- Native Provider sending stays off: Runtime does not call `set_native_provider`, so the Core reports `local_mock_only` and every external command answers `provider.not_configured`.

## Checks

| Check | Result |
|---|---|
| `cargo fmt -- --check`, `cargo test --locked`, `cargo clippy --locked --all-targets -- -D warnings` (src-tauri) | Passed: 35 adapter/companion tests and 3 pinned-Core rendered-field tests. |
| `npm ci`, `npm run check`, `npm test` | Passed. |
| `check-domain-boundaries.mjs --self-test` | Passed. |
| `check-memory-integration.mjs --self-test --memory-checkout <Memory>` | Passed: pin consistent, 3 crates, surface matches the pinned revision, 8 negative checks. |
| `npm run desktop:build` + `e2e/memory-smoke.mjs` (default) | Passed 101/101 on a fresh synthetic Vault (`enouia-memory init`) and a synthetic Markdown file. |

The smoke covers the existing Memory surfaces only. The Memory-side rows between `ff692cc` and this revision are behavior corrections already exercised by Memory's own tests; Runtime-specific evidence for them is limited to this smoke. No Provider call, credential or real data was used.
