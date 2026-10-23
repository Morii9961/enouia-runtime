# ADR-035 — Private AI Usage Ledger and a gated export contract

Date: 2026-10-21; R3 verified 2026-10-22. Status: **R0–R3 synthetic implementation verified; review and personal acceptance pending**. Authority: the owner's AI Usage Ledger request and continuation after the Dashboard author confirmed the 1.1 Schema, fictional fixtures and SHA manifest frozen. No personal collection, scheduler or transmission is activated.

## Context and compatibility gate

Activity & Usage belongs to Runtime, independently of Memory (ADR-012/025). Its existing ActivityData v1 is a public, three-source daily history, not a request ledger. Codex account buckets and local transcript observations have different coverage and day boundaries. Neither is a correction oracle for the other.

The supplied cross-project architecture is a proposal, including its example JSON. At Dashboard main `d0fb1c9708f52570f5a898ff65437c39669a6795`, a complete recursive tree contains no UsageSnapshot schema or usage conformance fixtures. Its adopted protocol ADR locates formal project-status schemas under `docs/protocol/schema/`, rather than the proposal's suggested `packages/protocol/usage/`. A path suggestion and an example do not freeze a protocol. See the [R0 compatibility study](../AI_USAGE_LEDGER_R0.md) and [verification record](../validation/AI-usage-ledger-R0.md).

## Decision

### 1. Separate domain, process and permissions

Reserve `enouia-usage` as a separate future one-shot executable and `enouia-usage-*` as its crate namespace. Its commands will describe explicit scan, replay, health, and offline export operations; their final argument/response contracts are deferred until the compatibility gate passes. Do not add a usage command to Activity's `sync` flow or call it at desktop startup. No executable or CLI is delivered in R0.

The ledger receives only explicitly selected absolute source roots and an explicitly selected, disjoint private data root outside repositories, source stores, install/build directories and synchronized folders. No automatic HOME/profile discovery or broad Cowork search is permitted. A root selection authorizes reads within that selected root, not account login, credentials, scheduling, or transmission. Future tests use newly owned synthetic roots outside the repository; no personal roots are selected by this design.

Memory repository/pin/Vault/Provider/session routing, frozen Runtime-local Memory crates, and the seven desktop surfaces remain unchanged. Ledger failure must not enter their startup path. No API pricing, exchange-rate retrieval, provider invocation, network client, sender, watch loop, or scheduler registration belongs to R0–R3.

### 2. Reuse only compatible mechanisms

Keep ActivityData v1, batch v1, Activity IPC v1, Activity archive/CURRENT, locks, sequence/high-water, pending/retry, SSH destination and scheduler ownership unchanged. Keep ADR-028/029/030 intact. ADR-033/034 recovery also stays Activity-only. The ledger must not open Activity state for writing or reinterpret its numbers as model-level usage.

Review reusable clock/cancellation/bounded-process ports separately from domain DTOs. Cowork discovery demonstrates path deduplication and fail-closed budgets; its broad roaming/package traversal and unproven concurrent-replacement protection are not suitable as the ledger's source grant boundary. A distinct path can still contain a copied message.

The pinned `ccusage@20.0.20` daily report is suitable for a limited comparison view, not the canonical fine-grained ledger. It loses field presence, cache lifetimes, raw model identity and cross-invocation message identity; it silently skips some malformed/unreadable inputs. Do not upgrade, download, fork, or change the production invocation.

For the new ledger only, this ADR proposes a bounded, count-only Claude JSONL adapter after the freeze gate, with the pinned ccusage used as a synthetic compatibility reference. This narrowly amends ADR-005 and Architecture v0.3 section 8's prohibition on a second Claude transcript parser **only when this ADR is adopted and the R1 gate below passes**. Existing Activity retains its current ccusage path. The new adapter must never persist message bodies. If that exception is not adopted, Claude request-level ledger support remains unavailable; daily tool output cannot impersonate it.

### 3. Count semantics and identity

All count arithmetic uses checked integers; transport counts are canonical nonnegative decimal strings or explicit unknowns according to the eventual frozen contract. Unknown is never measured zero. Rejected data remains outside accepted totals with a redacted reason code; quarantine stores only allowed metering facts and digests, never raw lines.

Codex: choose cumulative-vector differences as the only accepted increment path for a supported log version. `last_token_usage` is a consistency diagnostic, never a second increment. Validate `input + output = total`, cache-read <= input and reasoning <= output on both snapshots and accepted differences. Unknown cache writes prevent claiming a resolved uncached bucket. No aggregate can make a subset into extra tokens.

A cumulative observation needs a stable session identity, an unambiguous predecessor and a supported source order/identity rule. File paths, inode/mtime/offset and wall-clock timestamps alone are not event identity. Use session-scoped source event identity when available, otherwise an unambiguous chain of predecessor/current metering-vector digests under a versioned adapter rule. Exact replicated chains contribute once across active/archive copies. Missing identity, divergent copies, unordered chains or conflicting observations are quarantined, not assigned a guessed new session. Do not sort ambiguous events into apparent correctness.

An initial nonzero cumulative snapshot without a proven baseline may establish a checkpoint but is not attributable incremental usage. Record its unallocated counters and coverage gap. A reset/truncation is not automatically a new epoch: retain confirmed history, quarantine the ambiguous boundary, and require explicit source lineage or reviewed replay. A difference spanning model/effort changes or missing context remains unattributed. Only a supported event-scoped field, or a provably bounded context interval, establishes model/effort; missing/conflicting metadata stays unknown. Unknown auto-review identity never inherits the surrounding model.

Claude: for a supported version, ordinary `input_tokens` is noncache input; cache read and cache creation are additional input categories. Preserve presence independently of value. If both 5m/1h counts are explicitly present and reconcile with a reported creation total, use those exclusive buckets. A creation total without durations is unknown-duration write, not 5m. Missing counts keep dependent totals unknown; reasoning remains an optional output subset.

Use message/request identities across **all selected stores**, preserving the distinction between exact duplicates, documented sidechain parent replays and changed measurements. Missing IDs do not permit content-only deduplication of otherwise identical requests. Contradictory revisions do not choose a maximum; unresolved sidechain/revision cases are quarantined. Raw identifiers stay private and are stored as domain-separated keyed digests with a random local key; they are never exported. Keys and identifiers are not derived from user or machine identity.

### 4. Independent durable store and history revisions

Select a separate transactional SQLite ledger as the R2 design, not an Activity generation store. Proposed private layout (not created by R0):

```text
<selected-ledger-root>/
  source-selection.json       # private explicit grants; never exported
  identity/                  # random dataset alias and local digest key
  usage.sqlite3              # canonical metering facts and revision history
  usage.sqlite3-wal / -shm    # SQLite-owned transaction files when open
  writer.lock                # independent single-writer admission
  exports/                   # only explicitly requested offline aggregates
```

The database records versioned observations, accepted identities, conflicts, scan coverage, parser versions, materialized daily rows and immutable dataset revisions. Use transactions and a unique accepted identity; commit facts, materialization, coverage and revision together. Readers pin a transaction/revision. Proposed WAL + FULL synchronization needs actual Windows crash/reopen and fault evidence; those settings alone are not power-loss acceptance. Do not add a SQLite dependency in R0.

No-op rescan/replay with the same parser, facts and coverage keeps the same semantic revision. A failed scan updates attempt health separately without deleting history or stamping last-success. A material coverage change can produce an explicit revision without changing counts. Fixed export metadata and a fixed revision must give byte-identical output. Generation time alone cannot create a usage revision.

Missing/disappeared source files never subtract confirmed usage. Persist old weeks and mark retained-but-unobserved coverage. Complete, supported corrections create new revisions that replace the affected accepted projection; retain the previous value, evidence digest, parser version and reason. Ambiguous corrections preserve the prior projection with unresolved quality and an explicit candidate revision. Reviewed resolution can revise down: ADR-029's maximum rule is not used here. Never add old and revised daily totals together.

Replay is explicit, versioned and limited to selected roots/ranges. Retained normalized facts can rebuild materializations; reparsing deleted raw files cannot be promised. Corrupt database/state fails closed, preserves files and exposes repair-needed health. No automatic empty-ledger replacement or fallback to an unverified old revision. An interrupted transaction must recover to a complete committed revision; fault-injection tests are R2 gates. Compaction, pruning and remote backup are deferred.

### 5. Safe reads, health and offline export

Check root ancestry, components and opened-file identity; refuse symlinks/junctions/reparse escapes and unsupported file types. Recheck against concurrent replacement rather than relying on a canonical path string. Bound directory/file inventory, total scan bytes, line size, JSON depth, numeric width, deadline and cancellation. A line buffer must enforce its limit before allocation. Explicitly classify unfinished tails separately from malformed completed lines. A preflight cap is not a bound on a file growing while read.

Health must separate last attempt, last committed successful scan, covered time/ranges, accepted/rejected/duplicate/conflicting events, unreadable/missing files, retained history, unknown model/effort and unallocated checkpoint usage. Never label a bounded scan complete after skipping inputs. User-facing errors carry finite codes and counts, not raw parser/process messages, source paths or user IDs.

Future export constructs a closed allowlist from pinned aggregate rows; it does not serialize a database record and remove a few fields. Dataset identity is a fresh random alias. Model fields need bounded, validated token identifiers: malformed/path-like/control-bearing source text is rejected or unknown, never echoed. Diagnostics/quality are finite enums with counts, not source free text. Show “Export contains aggregates only, not source text” and the coverage/last-completed state before export. Full snapshot range/replacement semantics, revision/hash rules and all field limits must come from the frozen Dashboard contract. No public Activity export or automatic network send.

## Activation gates and consequences

R0 is complete with this ADR, the compatibility/field-gap study, synthetic scenario specifications and honest verification. The original stop applied while a compatible frozen contract was absent. Dashboard's author has now confirmed the 1.1 exchange package frozen, including finite quality reasons and explicitly unallocated observations. The owner authorized the cross-chat request and continued Runtime work. The [Usage pin](../integration/usage-pin.json) locks the exact publisher-owned bytes; no Runtime protocol variant is invented.

Git publication was pending during R1. Content-addressed immutability was sufficient for isolated synthetic R1 work: verify every Schema/fixture against the publisher's manifest, preserve those files, and fail on drift. This refined R0's unnecessarily Git-only handoff rule without reducing any count, quality or privacy requirement. R3 has reconciled publication: Dashboard PR #43 merged as `b66a472d04da3f7767dc5ba747ba1d5b9c494a9d`; all 43 published Schema/fixture/manifest files match the original frozen hashes. The consumer implementation also matches that published commit. This is protocol conformance, not production integration.

R1 requires an immutable Dashboard schema commit or frozen content-hash package, documented semantic rules, closed enums/bounds, a shared fictional accepted/adversarial fixture corpus and runnable conformance checks. These contract gates are satisfied by the pinned 1.0/1.1 bundle; the narrow Claude parser exception in this ADR applies only to the new usage crate. Verify supported Codex shapes using public source or owner-selected synthetic samples; historical/private CLI versions remain unverified. R1 proves adapters using synthetic data only. See [R1 evidence](../validation/AI-usage-ledger-R1.md).

R2 is implemented with independently selected synthetic private roots, concurrency/rollback/reopen/correction/replay/file-security tests and measured 100,000–1,000,000-line memory/performance trials. The exact layout, conservative source-lock behavior, process-crash limits and scale dataset are recorded in [R2 evidence](../validation/AI-usage-ledger-R2.md). Root selections remain explicit per call; no grant file or automatic discovery is needed. Immutable per-group fact projections replace the proposed eager daily materialization; R3 aggregates them inside a pinned read transaction. [R3 evidence](../validation/AI-usage-ledger-R3.md) records closed 1.1 exports, exact decimals, deterministic fixed-metadata output, correction review, protocol limits, privacy checks and four actual Runtime exports accepted by Dashboard's published validator. The [manual guide](../AI_USAGE_LEDGER.md) describes the separate one-shot commands. Supported legacy facts remain explicitly unallocated, never inferred daily zero.

Real source selection and personal-data acceptance remain Morii's decision. Production scheduling, live watching, VPS transfer, API valuation, Memory changes and R4 require separate scope and authorization.
