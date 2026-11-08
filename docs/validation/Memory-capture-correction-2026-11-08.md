# Synthetic capture: correction consumption, 2026-11-08

Runtime branch baseline: `b00034d` (origin/main, capture entry, panel and renewal merged; Memory pinned at `b9faf544da272bfe821c621d59a979b1a434e355`). This slice adopts Memory's correction consumption (ADR-MEM-121/122) in the synthetic Owner capture entry, still with fixed fictional data and no model.

## Change

- Hosted worker: `start_worker_with_corrections(LookupAnalyzer, LookupCorrections, 30 s)`; renewal keeps the same worker shape.
- A fourth fixed conversation is a user correction of the first. The lookup analyzer forms nothing from it; status marks it with `corrects: 0`.
- Closed `correct` operation (`native_write`): an in-process synthetic Agent principal, authorized through `QualifiedAgentHost::from_authenticated_initialized_owner` and `correction_reporter`, saves one fixed report. Its target is the current memory formed from conversation 1, its source the captured user turn of conversation 4, its quote hint that turn. The first submitted request is kept so later clicks resend the exact request (original-key receipt). Before both conversations are captured and the first has formed, `correct` returns `capture_correction_unavailable`.
- `LookupCorrections` knows only that correction turn: it quotes it as corrected content with `change: correction` and an excerpt title. The System worker writes the revision; the Agent never does.
- Panel: Corrects conversation 1, Send synthetic correction report, and a reread of the formed list until a newer revision appears. A `capture_busy` status no longer clears the observed panel; it keeps the last status and reads again.
- Startup order: the read-2 reader and the Agent host read the snapshot, so both are now built before the hosted worker starts. A Busy from the worker's writer lock at that step is the likely cause of the rare startup failures seen earlier (one capture smoke on 2026-11-07, one native test run today); it was not reproduced after the change, so this is a probable, not a proven, root cause.

## Checks actually run

- `cargo fmt -- --check`; offline `cargo test --locked`: 58 native unit/adapter tests (new end-to-end test: report saved, worker revises the same memory to r2 with the correction text and excerpt title, same key replays without a second revision; unavailable before prerequisites) and 8 pinned-Core consumer tests. Capture tests then passed 12 consecutive runs. Strict Clippy passed.
- `npm test`: 144 passed, 3 existing skips, including the capture client test (correct effect/state/exchange refusals, `corrects` validation, one send) and the capture DOM fixture (22 checks: correction target label, one report without writes, wait for the worker revision, busy status keeps the panel). `npm run build` passed. The CJK subset test caught 反映 in a new ja string; it now uses 処理.
- Real owned-process `memory-smoke.mjs --capture-only`: 27/27 on six consecutive runs after the fixes, including: correction turn settles as no memory, report saved, the worker revises the first memory to r2 quoting the correction, and the report key replays. Regression `--automatic-only` 36/36 and `--catalog-only` 39/39.
- Two earlier smoke failures in this slice were concurrency artifacts of the test and panel, not of Memory: the panel cleared everything on a transient `capture_busy` status (fixed in the panel), and the lock check sent three calls at once so one could see `capture_busy` (the smoke now sends them in sequence).

No personal Vault, credential, real Provider or model, Agent process, deployment or human acceptance is implied.
