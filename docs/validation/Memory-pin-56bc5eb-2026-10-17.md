# Memory pin 56bc5eb (2026-10-17)

At the owner's request, the embedded Memory Core moves from `8186aed861af08cf7a2c5d8c912a24eae51b4d66` to `56bc5eb8b08fb80cd6df892bf53d200ff23afc4c`, Memory main after its PRs #17–#33 merged. The Memory surface aggregate changes from `5eb04c2b…` to `2c1c064082dc14ea9d14387f982c50cd31855b301d534dfa78908f02a1cfd9d1`. Workspace IPC v1 still has 47 commands.

## What the new rows ask of Runtime

Memory's compatibility log adds thirteen rows since `8186aed`. Eleven describe optional native history helpers (H1 materialization, H2b–H2j review, semantic analysis, proposal drafts and publication, quality bundles, lineage) or workspace test fixtures. Runtime does not call those helpers, so they need no adapter change, and nothing here adopts or accepts them. Their host duties apply only if a later slice opts in.

The ADR-MEM-65 row adds optional `context_source_refs` to candidate and memory records: sources a model read but did not cite. The page-facing IPC is unchanged, and the Core reads and writes these records itself, so Runtime keeps the field by using the pinned Core. A purge preview can now list more candidate revisions, and its `losingProvenance` now also lists memories whose only link to the purged source is a recorded context dependency. The Memory surface showed that count as memories that "would lose evidence". It now says they "would lose a recorded source (cited evidence or read context)", so context is not presented as citation. Memory's reference shell still uses the older wording; that belongs to the Memory repository.

No Memory dependency manifest changed between the two revisions. Only the Memory `source` lines in `Cargo.lock` changed, and `cargo fetch --locked` plus `cargo metadata --offline --locked` succeeded without re-resolution.

## Checks

| Check | Result |
|---|---|
| src-tauri `cargo fmt -- --check`, `cargo test --locked`, `cargo clippy --locked --all-targets -- -D warnings` | Passed: 66 tests. |
| `npm ci`, `npm run check`, `npm test`, `npm run build` | Passed: 98 Node tests, 53/53 DOM fixtures. |
| `npm run desktop:build` | Built `enouia-desktop.exe`, SHA-256 `6a8cab0f32efdebf1ff9a675a297faa4d1d07cd4f73535a22219e1651a37aa64`. |
| `check-domain-boundaries.mjs --self-test`, `check-memory-integration.mjs --self-test` | Passed. |
| `check-memory-integration.mjs --memory-checkout` | `matches_pinned_revision`, 3 crates, 8 locked packages. |

## Native runs

Each run used a fresh Vault created by `enouia-memory init` from a Memory build of this revision's tree, outside any Git working tree, plus a synthetic Markdown file.

| Report | Result |
|---|---|
| [`--forget-only`](Memory-pin-56bc5eb/memory-forget-only.json) | 16/16, including the deletion-impact preview |
| [Default smoke](Memory-pin-56bc5eb/memory-default.json) | 101/101 |

The first default run reached 53 passing checks and then the Node driver exited with `0xC0000409` while it launched the second isolated test process for the autostart and shortcut-conflict step. No check failed, no report was written, and no test process was left running. A rerun on a fresh Vault with the same executable passed 101/101. The pin and the wording change do not touch the companion or autostart code. The cause of that driver exit is unknown, and one passing rerun does not show it cannot recur.

| File | SHA-256 (LF bytes) |
|---|---|
| `memory-default.json` | `bc7c0edfb510e382714e83a8bba1f6445833b48bae82a4f253f6c2162065b613` |
| `memory-forget-only.json` | `fe4d48ff10b5d1703e5ab04f359fb6a8b23d9321da3fca91de4264cc4fa417ac` |

All data is synthetic. No personal Vault, credential, real Provider request, installer or deployment was involved, and this is not owner acceptance.
