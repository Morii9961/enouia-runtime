# A2 Mock Provider validation

Date: 2026-10-01. Status: pure Provider ports/Mock implemented; complete A2 continuity demo pending.

Eight offline Provider checks pass: exact prepared bytes/hash and included ProjectState, repeatability/response round trip, no hidden registry lookup, rejected invalid/unverified request, cancellation/limit refusal, candidate-only tool result, hidden-message refusal, frozen independent hash/forged response rejection, and bundled schema/frozen response shape. One additional common SHA test covers eight padding/multiblock boundary lengths against independently computed Node crypto values. Existing empty/abc vectors remain intact.

Commands: `cargo test -p enouia-provider -p enouia-common`; full `cargo test --workspace` (212 passed); `cargo clippy --workspace --all-targets -- -D warnings`; `cargo fmt --all -- --check`; `git diff --check`; `cargo build --release -p enouia-activity-runner`. No dependency package was added; the shared hash implementation is unchanged apart from ownership/documentation/tests, and Activity's public hash API remains the same. Rebuilt release SHA-256 is `246ab1e35ba568e6a4fb0a55f658aa9e9bfb945fb67292a966f218edea5e17ee`; historical B4 reports keep the earlier tested binary hashes.

Shared draft validation/schema now belongs to Memory, re-exported by Core IPC. Provider depends on pure common/Context/Memory/Session and serde; it has no UI-contract or Activity edge. The historical Activity evidence index still passes without rewriting earlier reports.

No actual model/network, authentication, tool execution, file-backed invocation history, restart durability, FTS retrieval, UI or completed MoriMeta demo is claimed. The frozen reply and canonical bundle contain synthetic content only.
