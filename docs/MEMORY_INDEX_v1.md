# Disposable Memory index v1 — backend design

Date: 2026-10-02. Status: design plus isolated in-memory SQL probe, not a Runtime adapter or persisted index. Authority: ADR-003/007, [Vault storage](VAULT_STORAGE_v1.md) and [ADR-021](adr/021-index-and-retrieval.md). Frontend work is now proceeding separately; this repository task continues backend design and does not edit that work.

## Input and ownership

Only a completely validated pinned Vault bundle can be indexed. The source is its exact `{schema_version, vault_id, generation_id, manifest_sha256}` binding, Memory ledger and Session bundle. No staging, orphan generation, Activity archive, account cache or implicit raw conversation import is an input. A hash mismatch or failed model/Session validation blocks construction, rather than dropping a bad record.

The database is a disposable acceleration layer. Canonical files still supply returned content/provenance and every mutation decision. Candidate inspection reads canonical candidate files; proposals/decisions are not search documents. Identity and Session turn text also stay outside FTS; Context gets them through explicit pinned canonical reads. This design adds no Rust dependency or SQLite installation.

## SQL and projections

[memory-index-v1.sql](../contracts/vault/memory-index-v1.sql) specifies the candidate database schema. `index_meta` is a singleton with schema/policy versions, exact Vault binding, the SQLite capability version and a ready flag. Source/Memory/Session metadata rows retain all canonical IDs and statuses; file hashes bind projections to their manifest entries. Relations and tags are derived, not new canonical authority. SQLite constraints supplement rather than replace opaque-ID/date/provenance/graph validation.

Each Session event stores only order/time and turn/source or checkpoint references, never the conversation text. Active Memory records alone contribute `search_value` rows: one per `content`, structured ProjectState `state`/decision/open-loop value, checkpoint `last_state`/open-loop value and tag. Empty values are omitted. Field/array boundaries stay separate so search cannot manufacture a match across concatenated text. Assign `value_id` deterministically by memory ID, field name and ordinal in binary order; FTS rowid equals that value ID.

Normalize only ASCII A-Z to a-z (`ascii_fold_v1`). Preserve other characters, punctuation and field whitespace exactly; no stemming, Unicode folding, accent removal or translation is implied. Canonical content is never normalized in place. The [retrieval contract](MEMORY_RETRIEVAL_v1.md) defines term processing and final matching.

Use normal-content FTS5 with case-sensitive trigram and full detail. Write the FTS private text and `search_value` projection together in a fresh database, with no live incremental triggers or external-content tables. The duplication is bounded derived data and is rebuilt when inconsistent. Before activation, pin the actual SQLite library/build options and probe the chosen tokenizer; the development Python library is not the future packaged Rust dependency.

## Build, verify and publish

1. A single index owner per Core root acquires an independent process-scoped index lock. Other Core processes may read canonical files, but must not bypass that owner to open/replace the shared index. The Activity lock/data root is unrelated.
2. Pin and validate the complete canonical binding, input sizes and projected row/byte counts. Create a uniquely named candidate database in the checked Core index area; never edit the serving database in place.
3. Within one SQLite transaction, insert metadata with `ready=0`, sources/memories/relations/tags/sessions/events and active search values/FTS. Check cancellation between bounded batches; interrupted construction discards no canonical data. Full rebuild is the only initial update path.
4. Validate all projection rows/hashes against the pinned canonical oracle, FTS text/rowid equality, foreign keys, database integrity and the exact expected schema/policy/capability. Then set `ready=1` and commit. Close construction handles; require no unresolved journal/WAL state. Exact file synchronization remains a Windows adapter gate, not a SQL transaction guarantee.
5. Under the short canonical lock plus index-owner publication barrier, re-read `CURRENT`. If its binding differs, do not publish the candidate or mark it current; discard/rebuild only through index cleanup. If equal, publish using a tested same-root file replacement and re-open read-only to verify metadata/integrity. SQLite's transaction is not the cross-file canonical commit.
6. A query leases one verified connection/binding; the owner closes/releases serving connections before replacement. Sharing violations keep the old derived database and report degraded retrieval. An existing lease must never silently retarget to a new database. Exact file/share/lock behavior requires Windows adapter tests.

On missing/corrupt/stale index or unsupported capabilities, canonical enumeration/inspection remains available. Automatic Context retrieval returns `index_unavailable` until a complete rebuild succeeds; there is no undocumented all-record fallback. Cleanup may remove only verified owner-created index candidates/artifacts after closing handles; it cannot delete canonical generations/raw/Activity files. A serving database suspected of corruption is retained or explicitly replaced as derived data, never used to repair canonical files.

## Bounds, cancellation and health

Initial limits: 100,000 search values, 256 MiB total normalized text, 1 GiB candidate database and 1,000,000 total projected metadata/event/tag/relation rows. These supplement the Vault's selected-file limits and refuse excessive projection intact; no text/event truncation. Candidate plus serving database must fit preflight capacity, and actual write/commit failures still require safe refusal. No multi-generation database cache, compaction or canonical pruning is introduced.

Build work runs on a backend worker. The candidate filename/job identity is backend allocated; clients supply neither SQL nor paths. Publication has a defined cancellation boundary: cancellation before the barrier prevents publication; after a confirmed swap it reports the completed binding rather than undoing canonical or index bytes. Canonical changes remain successful even when index rebuilding is cancelled.

Health distinguishes absent, rebuilding, ready, stale, failed and cancelled jobs, with structured counts/bindings. A query never returns partial candidates after a SQLite error/cancellation. Future typed IPC/async jobs must expose safe status, not database filenames, raw SQL errors or source text in exported diagnostics. These operation DTOs and handlers remain pending; existing Core IPC v1 is unchanged.

## Evidence and gates

[The design probe](../scripts/check-retrieval-design.py) executes this SQL in a fresh **in-memory** development SQLite database. It checks literal text behavior, metadata predicates, ordering, rebuilt equality and projection disagreement refusal using synthetic rows. It does not implement filesystem publication, true canonical loading, Core IPC or process restart.

Before claiming an index adapter: prove validated canonical projections, exact schema/FTS capability, cancellation, owner/connection barriers, failed replacement/storage handling and Activity byte isolation under Vault V11/V12/V13/V18. Pin a packaged dependency only in that implementation milestone. The existing 300 ms target requires named corpus/hardware end-to-end measurements; no performance claim is made here.

Primary references: SQLite [FTS5](https://www.sqlite.org/fts5.html), [transactions](https://www.sqlite.org/lang_transaction.html), [integrity/foreign-key pragmas](https://www.sqlite.org/pragma.html). Database integrity checks and transactions support this candidate-build design; canonical correctness still comes from the complete file bundle and independently checked projections.
