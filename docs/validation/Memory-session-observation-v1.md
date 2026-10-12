# Session observation recovery

Date: 2026-10-12 (Asia/Shanghai). Baseline `ef5d2cd`; same Memory pin, native host and dependencies.

The Provider completion callback starts a session detail refresh through `useLatestRead`. That hook intentionally captures errors rather than rejecting its caller. A nonretryable failed refresh therefore left the previous transcript visible with an error, no explicit read recovery, and enabled new writes. The browser fixture reproduced this by completing one synthetic send then refusing `session_detail`: `failed_completion_refresh_has_manual_read` failed.

Sessions now remembers the attempted detail-read branch separately from the last successfully observed branch. Failed reads label the retained transcript as an earlier observation and offer **Read session again**. The button starts a fresh read of the attempted branch, not another mutation. A normal **Refresh saved session** reads the current branch. While detail is unobserved after a failure, new-session/local-send/checkpoint/Provider actions are withheld, but drafts stay editable and another branch can be read. Only a successful latest read publishes a new selection.

Validation:

- Extended `e2e/provider-session.html`: 17/17; [record](Memory-session-observation-browser.json). The completion-refresh recovery reads a saved reply, preserves a later unsent draft and performs no second external send. A failed switch keeps the old observed branch; manual recovery reads the attempted destination branch.
- `npm test`: 68/68. Frontend TypeScript, strict fixture TypeScript, frontend build and ordinary release desktop build passed.
- Integration/boundary checks: same pin, 8 + 7 negative checks passed. Native source/config/dependencies are unchanged; existing `fcfd06d` native tests/format/Clippy remain applicable.

All browser IPC is synthetic. No real storage failure, personal Vault, credentials, Provider HTTP, production Activity, installer or deployment was exercised. This observation recovery does not repair storage or prove real-device recovery.
