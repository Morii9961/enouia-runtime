# Session write feedback and retry — local evidence

Date: 2026-10-07. Baseline: `e03894b`. Scope: Runtime's Sessions presentation and focused native checks; adapter, pinned Core and domain behavior are unchanged.

Pending session writes previously disabled controls without explaining the wait. Sending a second question also retained the previous answer inspector, including after a failed result delivery. Sessions now shows waiting feedback while a write settles and clears that inspector before asking. The saved transcript remains visible as history.

The baseline native run passed **14/20**, failing the four waiting-feedback and two preceding-answer assertions. The final embedded-assets executable passes **20/20**. It holds real creation, local Mock answer and checkpoint receipts, then injects one retryable delivery error after the actual second turn completed. Read-only CDP request observation verifies Retry carries identical arguments and key, and Core replays the same capsule receipt. Core has two turns, exactly one submitted second question and no unsent replacement draft. The capsule query matches that submitted question. User edits made after the error survive acknowledgement; checkpoint acknowledgement clears only its submitted field. No approved memories were created.

The per-branch draft/delayed-detail regression also passes **19/19** on this executable. Screenshots were inspected. Type checking and **17 frontend tests**, harness syntax, diff and pin/domain guards pass (8/7 negative cases). The GNU release with embedded assets builds; no installer is produced. The unchanged Rust/pin scope retains the `aec907e` formatting, Clippy and 19 host plus 3 pinned-Core field-test evidence.

Executable SHA-256: `13d199f82b8362f5f401c9449ecd21c3329effd1803117a0b90c852123654495`.

Artifacts remain in temporary `enouia-runtime-session-write-final-20261007-01a10b3a` and `enouia-runtime-session-draft-regression-20261007-01a10b3a`; the baseline is `enouia-runtime-session-write-before-20261006-01a10b3a`. These are synthetic local Vault/Mock checks with controlled callback delivery, not real storage faults, a live Provider, durability, Narrator or a full native regression pass. No personal Vault, migration or production Activity was used.
