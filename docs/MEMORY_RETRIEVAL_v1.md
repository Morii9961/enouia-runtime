# Deterministic Memory retrieval v1 — backend design

Date: 2026-10-02. Status: specified behavior with a synthetic SQL text-query probe; Runtime retrieval, Context handlers and persistent capsule orchestration are not implemented. Authority: [index v1](MEMORY_INDEX_v1.md), [Context Capsule v1](CONTEXT_CAPSULE_v1.md), [ADR-021](adr/021-index-and-retrieval.md).

## Query and canonical boundary

The internal retrieval request carries exact Vault binding, query, backend-generated canonical `as_of`, optional validated project/session IDs and result limit 1–64. It is not a new exposed IPC command. Context query text must be nonblank and at most 1,024 UTF-8 bytes. Split terms only at ASCII whitespace or U+3000 ideographic space; ASCII-fold, deduplicate and sort by binary UTF-8 order. Accept at most 16 terms and at most 64 Unicode scalars per term. Refuse C0/C1 controls (U+0000–001F and U+007F–009F) outside accepted whitespace. There is no silent query shortening.

User punctuation, quotes and words such as `OR`/`NOT` remain literal data. Build a single quoted FTS term with internal double quotes doubled, bind it as a SQL parameter, and intersect per-term Memory ID sets. Do not send raw query text as FTS syntax, SQL, a regex or wildcard expression. Each term may match a different field of the same record; each individual match must stay within one original field/array value.

Terms of at least three Unicode scalars use case-sensitive trigram phrase matching as the accelerator. One/two-scalar terms use parameter-bound `instr` on normalized values. In either route, re-evaluate literal substring membership against the normalized canonical field values before accepting an ID. The short-term route is a bounded scan, not an empty result or a guaranteed fast query. No stemming, semantic paraphrase, Chinese word segmentation or non-ASCII case equivalence is claimed.

Only active canonical records updated no later than `as_of` are eligible. Validity uses a closed interval: `starts_at <= as_of <= ends_at`, with a missing end unbounded. This preserves the current model's allowed equal endpoints without redefining them as an empty interval. If a project is specified, lexical records with a different non-null project are excluded; unscoped records remain eligible. A supplied session must resolve in the selected bundle. Missing/mismatched IDs fail as structured query errors.

## Context lanes and stable rank

Context selection unions these lanes, revalidates every record against the selected canonical bytes, and emits exactly one classification per Memory ID:

| Priority | Inclusion | Order within lane | Maximum |
|---|---|---|---|
| 0 | Active ProjectState for the explicitly selected project, even without literal query matches | Updated time descending, Memory ID ascending | 4 |
| 1 | Active canonical checkpoint events for the explicitly selected Session, even without literal query matches | Session event sequence descending, Memory ID ascending | 2 |
| 2 | Remaining eligible memories matching **all** literal query terms | Number of distinct normalized tag values exactly equal to a query term descending, updated time descending, Memory ID ascending | Remaining slots up to request limit |

All lanes apply active/time/validity rules. There is no automatic inclusion of every active project or global checkpoint. A lower-priority duplicate keeps the higher-priority lane and its one classification. For lexical hits, ProjectState maps to `active_project`; SessionCheckpoint is admitted only when it belongs to the explicitly selected Session and maps to `recent_checkpoint`; Fact/Preference/Episode map to `relevant_memory`. `user_context` and `relationship_context` remain empty until a separate explicit classification policy exists.

Sort the complete eligible union before applying the result cap, then assign zero-based integer ordinals to `RankedMemory.rank`; the existing compiler uses lower rank first. Do not truncate raw FTS results before filtering/ranking. SQL row/insertion order, FTS relevance floats, index rowids and wall-clock query duration never decide ties. No randomness or unverified `bm25` equivalence is needed for this initial policy (`scope_literal_v1`). Scoped project/checkpoint inclusions are visibly marked as scope selections, not misreported as text matches.

The backend forms mandatory base Identity from the two pinned authorized Markdown files. For a supplied Session it may select at most four latest original turns by event sequence and return them in chronological order, with exact role/text/source/time. Without a Session there are no recent turns. Base query/Identity/turns must fit the existing byte budget or compilation refuses; it never silently trims them. Memory admission remains `compile_ranked`'s whole-record budgeting policy, including later smaller records after an oversized exclusion.

## Explanations and exclusions

Return a local retrieval audit alongside ranked IDs: exact Vault/query/policy binding, lane, integer ordinal and matched `{term, field, ordinal}` evidence for lexical hits. Scope lanes include the selected project/session ID and checkpoint event sequence where relevant. No indexed text replaces canonical content or adds hidden provider context. This audit is a future typed internal contract and is not appended to the existing capsule schema without version review.

Provide counts for inactive/time/validity/project filtering, unmatched records, deduplication and result-cap omission. Detailed exclusions are bounded to 256 IDs with an explicit omitted count. Compiler exclusions (`inactive`, `duplicate`, `budget_exceeded`) remain its separate existing output. This distinguishes retrieval cutoff from actual capsule admission without claiming that every raw record is relevant.

No candidate proposals, source titles, raw imports, Session text outside the selected recent turns or Activity values enter the search corpus. If canonical revalidation differs from a projection, fail the entire query as `index_corrupt`; silently dropping the mismatched row could conceal missing/altered results. Publication requires full projection equality, since per-hit checks alone cannot detect a missing document.

## Freshness, cancellation and later orchestration

The caller pins one complete canonical bundle and index read lease; their bindings/policies must match. At query completion re-read the current binding. On change, retry the entire retrieval once against the new complete bundle; on a second change return `stale_generation`. A read is valid at its final checked binding observation; it does not promise that another writer can never advance afterward. Capsule persistence/invocation must separately revalidate its expected binding at their commit boundary.

Check cancellation between terms/batches and via the eventual SQLite adapter's supported interrupt mechanism. Cancellation, limit exhaustion, SQLite errors, unsupported tokenizer and stale binding return structured refusal, never a successful partial or empty answer. Only a fully executed query can return `no_match`. No canonical write, Session event or Provider invocation is part of retrieval.

The next backend design slice is the actual-capsule invocation ledger and Mock/session orchestration: freeze request/result commit boundaries, cancellation, restart and lost-response semantics before writing handlers. Frontend work proceeds separately using reviewable backend contracts; this task changes no frontend files or IPC command names.

## Required acceptance

Synthetic fixtures must cover CJK long/short terms, ASCII folding, punctuation/quote/operator literals, cross-field matches without artificial concatenation, inactive/candidate/future/validity exclusions, scoped and unrelated projects, Session checkpoint lane/order, full ranking before cap, whole-record budget admission and exact reconstruction after index rebuild. Add corruption, stale-generation, cancellation and resource-limit cases to the adapter acceptance plan.

The local [design probe](../scripts/check-retrieval-design.py) verifies only the lexical/metadata ordering subset and fresh in-memory rebuild equality. Complete canonical validation, scoped Context lanes, asynchronous freshness/cancellation, disk restart and measured performance remain unverified. SQLite's official [FTS5 documentation](https://www.sqlite.org/fts5.html) supports the tokenizer/query boundary; the eligibility, ranking and scope rules above are Enouia design decisions.
