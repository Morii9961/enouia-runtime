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

## Follow-up: native setup (ADR-032) and the Sessions provider panel

`provider.rs` parses the owner's `memory-providers.json` and injects Memory's native setup. Two main-window commands report the setup state and run the native key prompt. The Sessions inspector gains an external provider panel. It explains the off state; when a setup exists it shows the provider/model, a native key set/remove, grant review and revocation by exact content, preparation of the composer text with the exact request body, a single "Send once" operation, the session's Provider calls and local closing of unknown ones.

| Check | Result |
|---|---|
| src-tauri `cargo test --locked`, clippy | Passed: 39 + 3 tests, including settings parsing, refusal rules, application to the pinned Core and the fixed credential names. |
| `npm run check`, `npm test` | Passed 61/61, including native-command shapes, keyed external writes, owner text for the new rules and the panel's initial read state. |
| `npm run desktop:build` + default smoke | First run 99/101: two quick-search hotkey checks failed (the intermittent foreground-focus observation already recorded for this mode), unrelated to Sessions. The rerun on a fresh synthetic Vault passed 101/101. Its Sessions screenshot shows the panel's off-state text. |

Not exercised: a configured setup in the built app, the Windows credential prompt, Credential Manager writes, HTTPS and any provider. No settings file existed in the owner's Runtime configuration folder during the smoke.

## Follow-up: pin `8186aed` and source suggestions (extraction, MV-7.4)

The pin moves to Memory `8186aed861af08cf7a2c5d8c912a24eae51b4d66` (surface `5eb04c2b…`, 47 commands). Grant plans now send `extraction`. The External provider panel has an explicit "also allow extraction" choice, off by default. The source viewer offers "Suggest memories from this part…" for the shown excerpt. It reads the provider setup, prepares the exact request for that range, sends it once, previews each suggestion with its quote and complete selected text, and on request adds them to the review queue one apply call at a time. Nothing becomes a memory without ordinary review.

| Check | Result |
|---|---|
| src-tauri tests and clippy | Passed: 39 + 3 tests; the lifecycle gate covers the three new writes. |
| `npm run check`, `npm test` | Passed 62/62, including the extraction panel's initial read state. |
| `check-memory-integration.mjs --self-test --memory-checkout` | Passed: surface matches the pinned revision. |
| Default smoke | Not passed in this window: three runs stopped at the first OS key injection because the harness's own guard found another window in the foreground (`test process is not foreground`; the owner was using the desktop). These steps only test the global hotkey and quick search, which this change does not touch. The same steps passed 101/101 at `7963150` and `7ba612b` earlier today. |
| Focused smoke without OS key injection | Passed: `--sessions-only` 19/19, `--source-paging-only` 16/16, `--session-writes-only` 21/21 on fresh synthetic Vaults. |

Not exercised: a configured setup in the built app, extraction against any provider, the credential prompt, Credential Manager and HTTPS.
