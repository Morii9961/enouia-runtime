# Synthetic capture panel, 2026-11-07

Runtime branch baseline: `e125386` (origin/main, synthetic Owner capture entry merged). This slice adds the frontend panel for that entry under Memory → Automatic → Synthetic Runtime capture, with zh-Hans and ja translations.

## Changes

- `src/memory/capture.ts`: separate `memory_capture` client; per-operation kind/effect/field validation; one send per call, no fallback or resend.
- `src/memory/CaptureMemory.tsx`: fixed conversations with both turns (language-marked, literal text), Preview capture / Capture conversation per conversation, write receipts including queue refusal, job-state polling until terminal Memory states, formed-memory list from the same root, End capture enrollment, explicit disabled / locked / expired / failed states.
- Native status now carries the fixed fictional conversations and, when initialization failed, its fault code as `reason`.

## Checks actually run

- `cargo fmt -- --check`; offline `cargo test --locked`: 56 native unit/adapter tests (new failed-initialization reason test) and 8 pinned-Core consumer tests; strict Clippy.
- `npm test`: 143 Node tests passed, 3 existing skips, including the new capture client test (refused kinds/effects/exchanges/receipts, one send per failure, terminal-state rule) and all Happy DOM fixtures; the new `capture-memory` fixture passes 18 checks (disabled, literal text, preview without write, single write by index, job progress to terminal states, formed list refresh, polling stops, three languages without new writes, unknown outcome never resent, queue refusal, expiry disables capture, single lock). `npm run build` passed (TypeScript included).
- Real owned-process `memory-smoke.mjs --capture-only`: 23/23 on four consecutive runs, now including the panel on a fresh restarted root (fixed conversations visible, a click captures conversation 2 and the native worker forms 蓝色陶杯, panel job states match native jobs, End capture enrollment revokes native capture). Regression smokes `--automatic-only` 36/36 and `--catalog-only` 39/39.
- One earlier capture smoke run failed at the fresh-restart wait (status never became open within 30 s) and did not recur in six later runs. Its cause was not observed because status did not yet report initialization faults; status now reports `reason` and the smoke records it, so a recurrence will name the fault.
- The bundled CJK label subset test caught a glyph (三) outside the shipped subset in a new zh-Hans string; the string now uses the digit 3 instead of regenerating fonts.

No personal Vault, credential, real Provider, deployment or human acceptance is implied.
