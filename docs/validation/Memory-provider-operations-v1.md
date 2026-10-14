# Provider operation feedback

Date: 2026-10-12 (Asia/Shanghai). Code baseline: `fcfd06d04f14b1a7e61d182eb5d56903409935cd`; branch `codex/memory-provider-operations`. The same Memory pin `8186aed861af08cf7a2c5d8c912a24eae51b4d66` is retained.

The previous shared operation view offered cancellation only for import/index work, so `external_send` misleadingly displayed "Finishes before locking or exiting". A new render regression first failed on that actual output. The pinned Core starts this operation with an operation ticket and passes its cancellation through Provider Client/Transport; Runtime now offers **Stop locally**, explains the limits of local cancellation and waits for terminal status.

Sessions and extraction preserve the final operation result after their watcher ends. Only recognized successful `completed`/`length` replies are labelled saved; a generic terminal state does not imply a reply. Extraction previously had no control after an unsuccessful send or preview read; it now retains Close and an explicit **Read saved suggestions** action. This is a local Core read, not another send or an apply action.

Validation:

- `npm test`: 68/68; includes queued/running/requested/terminal external states, output limit and unknown-result refusal to claim a saved reply. Existing import/index cancellation and noncancellable verification/backup checks pass.
- TypeScript, frontend build and `npm run desktop:build` (no installer): passed.
- `check-memory-integration.mjs --self-test`: unchanged pin, 8 negative checks passed. Dependency-boundary check reuses unchanged resolved desktop metadata: 7 negative checks passed.
- `e2e/provider-operations.html`: 12/12 on the actual React components with synthetic IPC only; [result](Memory-provider-operations-browser.json). It drives request preparation/one send/local stop, observes the pending acknowledgement before terminal cancellation, checks preserved output-limit completion, failed extraction, failed preview/read recovery, Close, no automatic retry and no automatic apply.
- Rust host source, manifests, lockfiles and native permissions are unchanged from `fcfd06d`; its 61 host + 3 pinned-Core tests and strict Clippy/format checks remain applicable and were not rerun for this frontend slice.

The browser fixture does not mount the native app, access owner configuration, open a Vault or contact a Provider. No personal data, credentials, live extraction, production Activity or installer work was used. Full native smoke and real Provider/Windows acceptance remain unverified.
