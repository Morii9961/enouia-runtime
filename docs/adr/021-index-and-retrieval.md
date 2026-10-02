# ADR-021 — Disposable generation-bound index and literal retrieval

Date: 2026-10-02. Status: backend design adopted; Runtime implementation/activation pending. Authority: ADR-003/007 and [ADR-020](020-core-vault-generations.md). Frontend work is proceeding separately; this slice defines backend behavior without editing frontend assets.

## Decision

Build a fresh disposable SQLite candidate from one validated Core generation. Metadata and all searchable field values carry exact canonical provenance; the ready database binds Vault/generation/manifest and versioned normalization/ranking policies. Candidate proposals and implicit raw/Activity text are excluded. Publish only after complete projection/integrity validation and a same-generation check. Index failure never reverses a canonical commit.

Use case-sensitive FTS5 trigram over ASCII-folded independent field values as the initial accelerator, with literal short-term scanning and final canonical substring verification. This gives explicit Chinese fragment/short-query behavior without introducing a model, tokenizer package or semantic search dependency. Adopt deterministic scope lanes and integer rank ordinals; do not make floating relevance or insertion order a contract.

Full-copy/rebuild is preferred to incremental external-content synchronization for the initial bounded slice: it has a simpler projection oracle and disposable recovery boundary. It may cost more disk/time. A later incremental update or richer normalization requires versioned policy, rebuild compatibility and new correctness/performance evidence. No speed guarantee follows from this choice.

[Index v1](../MEMORY_INDEX_v1.md), the [SQL design](../../contracts/vault/memory-index-v1.sql) and [retrieval v1](../MEMORY_RETRIEVAL_v1.md) specify the contracts. Existing Memory/Session/Capsule/IPC schemas are unchanged.

## Activation gates

1. Pin a future packaged SQLite dependency and test FTS/tokenizer, schema, resource/cancellation and query capabilities on that exact version; the development probe is not a package choice.
2. Load through validated canonical/pinned Windows read ports, prove complete projection equality and keep candidate/Activity isolation.
3. Test candidate builds, exclusive owner/connection publication, cancelled rebuild, stale generation, corrupt index, storage errors and exact canonical rebuild on marked synthetic roots. Meet the applicable Vault recovery rows.
4. Implement typed read/health/job adapters without arbitrary SQL/client paths; verify lane selection and complete Context budgeting against the actual capsule.

An in-memory SQL design check does not activate persisted storage, complete A1/A2, prove restart continuity or authorize personal migration/production changes. Capsule invocation/session orchestration remains the next backend design boundary.
