# Import result inspection

Date: 2026-10-18 (Asia/Shanghai). Baseline: `50a6997` on `codex/runtime-v1-inspector`; Memory remains fixed at `56bc5eb`, workspace IPC v1, 47 commands.

## Behavior and contract

The Import list now offers an explicitly labelled Inspect control for each import. Its right-hand report shows the Core's import ID/revision, status, format, account alias, input size and receipt/update times. Source creation/revision/unchanged counts, conversations, branches, missing parents, unparseable items, four attachment outcomes, coverage-entry count, quarantined-member count and literal warning codes remain separate.

All fields come from the existing `import_list` result at the pinned revision. The implementation was checked against Memory's `import_row` in `enouia-memory-workspace/src/lib.rs` and `ImportCounts`/`ImportManifest` in `enouia-memory-contract/src/import.rs`. The field names and meanings are exercised through the real pinned Core by the new `import_report_fields_the_surface_renders` consumer test: import synthetic Markdown, reread its fields, import identical bytes without new parsed sources, recreate Core and recover the duplicate relationship. No new native handler, capability, command or domain rule is added.

Selecting a report and navigating to an original duplicate entry use the current list only. A missing original stays unavailable. A refreshing or failed list withholds report details; a later successful list updates the same selected ID, and a missing selected ID never substitutes a different row. Closing returns focus to that row's Inspect control, or to the Import heading if its control is unavailable. Vault lifecycle gating unmounts the report. Missing, negative, non-integer or unsafe numeric counts display unknown rather than zero.

Import completion does not claim complete upstream history, semantic extraction quality or approved memory. Unknown formats distinguish preserved original bytes from parsed content. Interrupted entries keep the existing explicit Resume action. This report does not plan or start historical extraction; the missing host interface remains a separate dependency in the [v1 plan](../RUNTIME_V1_DELIVERY_PLAN.md).

## Checks

- Actual Memory-surface DOM journey: 18 assertions passed, covering record identity, every count group, duplicates, literal warning text, reread failures/pending state, refreshed revisions, missing selection/original, unsupported and interrupted inputs, absent/invalid counts, close focus, lifecycle gating and a read-only command allowlist. A targeted rerun after the final report-navigation focus change also passed.
- Strict new-fixture TypeScript check passed with `src/vite-env.d.ts`, strict ES2022/bundler/React JSX flags, `--allowJs` and `--allowImportingTsExtensions`.
- Production TypeScript/web build and the Memory pin guard (8 negative checks) passed during development. Final package/build and broader regression results are recorded below.
- Native production source, dependencies and pin are unchanged. Existing host tests and dependency-boundary evidence remain applicable; the new pinned-Core import test is separately recorded below.

All fixture data is synthetic. The new DOM journey uses no picker or actual files. The native consumer test uses only its owned temporary Vault and synthetic Markdown with providers off. No personal history, real Provider, credentials, installation, upload, production scheduling or Morii acceptance is established.

Broader regression: `npm --prefix apps/desktop test` passed all 98 Node tests and 60 DOM fixtures (789 assertions). The final small navigation/focus changes were followed by the affected 18-assertion journey and strict fixture typing; unchanged journeys reuse that full-gate result. Production TypeScript/web build, targeted strict Clippy for `memory_core`, Rust format and diff checks passed.

The pinned-Core consumer test passed (1/1). Its first sandbox run could not create its temporary Vault (`fault.access_denied`). Outside the sandbox, the test correctly observed that Markdown imports have a null upstream account scope; its initial overstrict string assertion was corrected to the actual nullable contract, then the synthetic import/duplicate/reopen test passed. No product code was changed to accommodate the test.

The final native executable rebuild is blocked by an existing Runtime instance holding `target/release/enouia-desktop.exe` open. Cargo reports OS error 5 while replacing that file. An elevated check confirmed the running instance and the file-sharing denial; the file is not read-only. No process was stopped. The final TypeScript/web assets and consumer checks above pass, but this slice does **not** claim a newly built native executable. Exit that instance, then run the normal no-bundle build to close this delivery item. The earlier successful Inspector executable is evidence only for its own slice.
