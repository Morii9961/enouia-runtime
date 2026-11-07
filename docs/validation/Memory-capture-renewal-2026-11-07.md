# Synthetic capture enrollment renewal, 2026-11-07

Runtime branch baseline: `9ead6c3` (origin/main, capture panel merged). Memory bounds one Owner-root producer enrollment to five minutes; before this slice an expired synthetic capture entry needed a restart.

## Change

- Native `renew` (closed operation, `native_control`): revoke the current `RuntimeCaptureHost`, join its worker, enroll the same producer principal on the same root again (five minutes, bounded by the one-hour policy) and start a new hosted worker. Allowed while open or expired; refused after lock (`capture_locked`) or once an unknown outcome made the entry unavailable. A failed renewal reports status `failed` with its reason. Nothing renews automatically.
- Panel: Renew capture enrollment beside End capture enrollment; the expired message now points to renewal (zh-Hans/ja updated).
- Client validates `renew` as a status response with `native_control`.

## Checks actually run

- `cargo fmt -- --check`; offline `cargo test --locked`: 57 native unit/adapter tests (new: expiry → renew → same-key replay and a new write succeed; renew after lock refused) and 8 pinned-Core consumer tests; strict Clippy.
- `npm test`: 143 passed, 3 existing skips, including the capture client test (renew effect/refusals, one send) and the capture DOM fixture (19 checks; expired → one renew → capture re-enabled). `npm run build` passed. The CJK subset test caught 即 outside the shipped subset; the zh-Hans string avoids it.
- Real owned-process `memory-smoke.mjs --capture-only`: 24/24 on two runs, now including renewal while open followed by a same-key replay. Regression `--automatic-only` 36/36 and `--catalog-only` 39/39.
- Expiry itself is covered with a fake clock in the native test; the real smoke does not wait five minutes.

No personal Vault, credential, real Provider, deployment or human acceptance is implied.
