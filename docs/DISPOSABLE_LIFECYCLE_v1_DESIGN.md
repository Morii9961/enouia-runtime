# Disposable observation lifecycle v1 — backend design

Date: 2026-10-02. Authority: [read/results v2](CORE_READ_RESULTS_v2_DESIGN.md), [jobs v1](CORE_JOBS_v1.md) and ADR-023. Status: selected process-local design decisions; no worker, cache, timer or IPC implementation. The [policy constants](../contracts/ipc/disposable-lifecycle-v1.json) freeze existing caps; these clarifications do not enable handlers.

## Time and page identity

Expiration uses a process-owned monotonic clock; UTC timestamps remain observation metadata. An item expires when elapsed age is **greater than or equal to** its TTL. Age starts at token issuance, preview insertion after verified completion, or job terminal transition, respectively. Reads/retries never renew it. Process replacement invalidates these handles without reconstructing their origins from UTC. The fixture's integer `issued` stands for the applicable backend lifecycle origin.

Shape/authorization admission precedes these selected decisions. Page tokens bind the original process/Vault/generation/query/collection/filter/limit and offset. Identical reads of a retained token are repeatable; delivery does not consume it, because a lost reply cannot invisibly advance a client. Returned continuation handles have their own fixed issuance times. They are not authorization.

Missing/evicted/expired tokens or wrong process return `process_expired`. Changed query parameters on a retained token return `invalid_request`; original/current generation mismatch returns `stale_page`. Check these in that order before reading items. Repeat final selected-binding validation before returning: a concurrent change discards the page as `stale_page`. Refusals neither return partial items nor start a new listing. Empty collections return empty successful pages with zero remaining count and no continuation.

## Retention and admission

| Resource | Bound | Equality and overflow |
|---|---|---|
| Page handles | 256/process, 64/Vault; 10 minutes | Equal count fits; next insertion needs eligible eviction or `busy` |
| Preview payloads | 4 MiB/process; 10 minutes; capsule at most 32,768 bytes | Exact byte cap fits; validate full payload before insertion |
| Worker slots | 4 active, 32 queued | Fourth may start; thirty-second may queue; next is `busy` |
| Index ownership | One nonterminal rebuild/Vault, including queued owner | Different token is `busy`; retained identical action replays |
| Terminal jobs | 128/process; 30 minutes from terminal transition | Eviction/expiry also removes retained background deduplication entry |
| Background action keys | 164/process | Retained identical action replays before capacity; conflict refuses |
| Events | Latest 256/job; poll at most 128 | Explicit gap resynchronization below |

Before insertion purge logically expired entries, then evict eligible least-recently-used entries by backend monotonic access order, breaking ties by issuance ordinal. Page eviction must satisfy both Vault and process caps; preview eviction frees exact byte accounting. Never evict queued/running jobs to make a terminal slot. Short serialized reads may pin entries against physical eviction. If eligible victims are all pinned, refuse `busy` without allocating a worker/key. Expiration still invalidates a reply at final observation; physical reclamation waits for pin release.

Admission checks retained key conflict/equality before capacity and index ownership. Replay allocates no worker. Capacity refusal creates no disposable job/key or canonical receipt. These statements specify future ordering; the checker allocates/evicts nothing. Durable Mock receipts survive disposable key eviction and remain independently recoverable.

## Events and preview inspection

For retained event head `H`, oldest sequence is `max(1,H-255)`. Cursor `oldest-1` can deliver the oldest event. A cursor below that boundary or above `H` returns `eventGap=true`, complete current status, no events and `nextCursor=H`. This explicitly resynchronizes without claiming missing events were delivered. A cursor at `H` returns no events/no gap. Otherwise deliver the next bounded increasing sequence and set the cursor to the last delivered event. Status/head/retained range must come from one serialized snapshot.

Gap uses the existing `job_events.eventGap` field. Wrong process or expired/evicted job returns `process_expired`, never a fabricated live interrupted worker. Canonical Mock outcomes remain separately readable.

Preview inspection requires original process/job/capsule identity and retained unexpired verified bytes. Wrong process returns `process_expired`; missing/expired payload or tuple mismatch returns `preview_expired`. Generation advance does not rewrite/promote a preview: it may still be inspected with its original explicit pinned binding and `persisted=false`. Starting another preview requires current expected binding. Recorded invocation capsules use canonical reads independently of preview TTL.

## Evidence boundary

The [fixture](../tests/fixtures/backend/disposable-lifecycle-v1.json) freezes 42 separately specified decisions from declared snapshot premises; the [checker](../scripts/check-disposable-lifecycle-design.py) compares selected page/event/preview/admission/retention outcomes. Boolean match premises stand in for already verified identities, not wire IDs, hashes, entropy, authorization or OS-owner proof. `inputIsCurrent`, `allocate` and numeric page ranges are oracle summaries, not added wire fields.

Retention cases test affected-Vault page count, preview aggregate bytes and terminal entry/age bounds. They do not simulate process-wide page eviction, actual LRU/pinning, per-capsule validation or cache-key linkage. P09/O11 remain unaccepted until real Rust workers/accounting, monotonic timing, final-binding races, coherent event snapshots, cancellation arbitration and process replacement execute expanded histories. See [validation](validation/Core-disposable-lifecycle-design.md). Frontend remains separately owned.
