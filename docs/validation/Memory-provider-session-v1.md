# Provider session ownership

Date: 2026-10-12 (Asia/Shanghai). Baseline: `9ccb396`; branch `codex/memory-provider-operations`. Memory pin and native host remain unchanged.

Previously, Sessions disabled branch switching and its writes only for its own action/detail read. The separate ExternalPanel did not report work upward. An external preparation/send could therefore coexist with a branch switch, while the panel retained an operation watcher and used the newly rendered branch's refresh callback. The parent's injected request client was also not forwarded to the child.

The panel now reports its own action/operation busy state through a stable callback; the parent also keeps a ref checked before starting a write or branch read. Session controls wait until that work ends, while the operation's **Stop locally** remains accessible. Parent writes/detail reads withhold Provider actions. Branch identity keys the panel, so a new branch receives no old request preview or terminal display. Its Core client is the parent's client. A completed call refreshes the owning branch and restores its current drafts from the existing draft map.

An isolated copy of the parent from `9ccb396` was exercised with the new browser fixture. While `external_prepare` was held, New session, both branches, the composer and local Send remained enabled. The fixture failed waiting for protected branch controls. This temporary copy was then removed; final source uses the fixed parent.

Validation:

- `e2e/provider-session.html`: 10/10 with the actual Sessions parent and ExternalPanel, synthetic IPC only; [result](Memory-provider-session-browser.json). It holds preparation and send admission, observes disabled writes/branches through the running operation, preserves local cancellation, verifies completion reads the original branch, preserves a later unsent draft, switches branches without carrying an old result/preview, restores the draft on return and records one explicit send.
- Existing provider-operation browser fixture rerun: 12/12. It remains usable as an independent panel without a parent callback.
- `npm test`: 68/68. TypeScript and ordinary frontend/release desktop builds passed.
- New operation/session fixtures also passed strict standalone TypeScript checking with `--ignoreConfig --types vite/client`. Initial direct checking needed those CLI/type declarations; their synthetic envelopes now use explicit types.
- Memory integration check: pin consistent, 8 negative checks. Unchanged desktop dependency metadata: 7 negative checks passed. Rust source, native configuration and dependencies are unchanged, so the recorded `fcfd06d` host tests/Clippy/format evidence remains applicable.

This is a within-Sessions UI ownership check, not a new Core lock or proof for leaving the entire surface, process death, native input, HTTP, real credentials, or personal workflows. No personal Vault, settings or production Activity was used; no installer or deployment was run.
