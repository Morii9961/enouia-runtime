# Native entry points and model-call lifecycle guidance

Date: 2026-10-12 (Asia/Shanghai). Baseline `087174f`; Memory pin unchanged.

The native Home still described Activity as fictional and Sessions as local-Mock-only. Its routes now describe the independent Activity producer and the choice between local Mock and an explicitly inspected/authorized external request. These descriptions do not claim that a producer, model or key is configured. Browser demo content is unchanged.

Vault lock, pending release and Exit guidance now includes local model-call stopping and the need to read saved session outcomes after reopening. Closing the window remains a tray hide; Activity keeps its own schedule. A local stop is not a claim of remote cancellation.

The wording follows the exact cached Memory pin: `workspace/src/lib.rs` closes native access before joining operations; `workspace/src/ops.rs` requests cancellation and joins workers before clearing the operation table; `workspace/src/native.rs` documents the late-result publication gate. Existing synthetic native evidence in [offline ledger recovery](Memory-provider-off-ledger-v1.md) demonstrates that lock/unlock can leave a saved unknown invocation and that local closure works with setup off. No domain or shell behavior was changed.

Validation: TypeScript, frontend/ordinary release desktop builds and all 69 existing frontend tests passed, including pending release/progress and fictional-demo checks. Native test, Clippy, formatting and dependency-boundary evidence from [the preceding cancellation slice](Memory-operation-cancel-ack-v1.md) is reused because native source and dependencies are unchanged. This is guidance and isolated verification, not real Provider, personal Vault, Narrator or installer acceptance.
