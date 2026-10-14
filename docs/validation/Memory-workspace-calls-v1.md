# Workspace Provider call re-observation

Date: 2026-10-12 (Asia/Shanghai). Baseline `a956f66`; same Memory pin and command catalog.

ExternalPanel's local operation ID disappears when its surface unmounts. Runtime now uses the already-pinned Core's `operation_list` as the authoritative re-entry point instead of adding a persisted frontend registry. Sessions reads the list on mount and every three seconds while mounted; only `external_send` rows enter the workspace call section. Active rows use the existing watcher/local cancellation. The inspector's current watched ID is excluded to avoid duplicate controls. Terminal rows render their observed result without being claimed as calls in the selected session.

The list stays unknown before observation, retains a labelled previous observation on read failure, and only reports empty after a successful empty list. Unmount cancels page timers; remount re-reads Core IDs. No request body, key, draft or operation result is stored across page switches.

Validation:

- `npm test`: 69/69, including unknown-before-observation render semantics. Frontend and strict fixture TypeScript passed.
- `e2e/workspace-calls.html`: 13/13; [record](Memory-workspace-calls-browser.json). Covers pending/empty distinctions, filtering, unmount/remount, observer exclusion, failed local cancel, cancel acknowledgement/terminal state, listed-ID targeting, list failure/recovery and no request replay.
- Full Sessions fixture: 18/18 after returning an actual active operation row from its synthetic Core list. It asserts only one local stop control while the inspector watches that ID and distinguishes workspace results from selected-session results. The fixture's title lookup was narrowed to the named transcript region after the new heading exposed its broad `h2` selector.
- Native `cargo test --locked`: 61 host + 3 pinned-Core tests. The existing held fake Provider regression now reads the real pinned Core's operation list and checks its ID/kind/state/progress/cancellation fields and absence of top-level body/secret/path/text fields. Fake secrets/transport and temporary synthetic Vault only.
- Formatting, strict Clippy, frontend/ordinary release desktop builds, pin consistency (8 negatives) and unchanged dependency boundary metadata (7 negatives): passed.

The browser fixture simulates Core state; the native test validates the embedded Core DTO, not a built-app navigation journey. No real credentials, personal Vault, Provider HTTP, production Activity, installer or deployment was exercised. The operation table is process-local and may be cleared by Core lifecycle/retention; this does not reconstruct operations after a process reset or replace the canonical saved invocation ledger.
