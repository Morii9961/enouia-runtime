# Architecture decision register — v0.3

Date: 2026-09-26. These are phase design decisions, not claims of implemented behavior. “Adopted” means the current implementation specification chooses this direction; “Deferred” means no implementation of that topic is authorized by this phase. Changes require recording what supersedes a decision and updating the architecture, affected contracts, and tests together.

References: [Architecture v0.3](../../Enouia_Runtime_Architecture_v0.3.md), [implementation plan](../IMPLEMENTATION_PLAN_v0.3.md), [migration runbook](../ACTIVITY_MIGRATION_v0.3.md). The IDs retain the v0.2 candidate numbering where applicable. This consolidated register is the ADR artifact for this design phase; split individual records into files if later changes need a longer history.

## ADR-001 — Local canonical ownership (Adopted)

Context: providers and clients must be replaceable without loss of continuity. Activity adds durable state that does not represent canonical Memory.

Decision: the local Vault owns canonical Memory; the separate local Activity archive owns known daily aggregates. The server is neither domain's sole source of truth. Provider accounts' convenience memory is not canonical.

Consequence: backups and recovery are domain-specific. “Vault is the source of truth” cannot be used to put Activity into the Memory domain. Verify by replacing a provider and by running Activity with no Vault.

## ADR-002 — Human-readable Memory format (Adopted)

Decision: versioned JSON record per canonical memory; Markdown for Identity/narrative files; immutable raw conversational sources. Preserve provenance and supersession rather than deleting old meaning.

Alternative: database-only canonical storage would couple recovery to the index/database. Rejected for this slice. A1 freezes full record schemas and synthetic fixtures before persistence. Validate round-trip, source resolution, and supersession recovery.

## ADR-003 — SQLite is a disposable Memory index (Adopted)

Decision: SQLite/FTS indexes canonical Memory and sessions whose durable contents live in files. Activity archive, sequence, pending, and delivery state never live in this database.

Consequence: deleting/rebuilding the index is safe for both canonical domains and cannot reset uploader state. Test the Track A demo and Activity high-water before/after index removal.

## ADR-004 — Windows shell/domain separation (Adopted)

Decision: Tauri 2 hosts a React/TypeScript/Vite shell with typed IPC. `src-tauri` is an adapter, not the domain Core. Frontend cannot access files, databases, raw CLI reports, or credentials directly.

Consequence: inspectors display the actual backend state/capsule; CLI and future clients can reuse the libraries. Verify module dependency graph and UI operations through contract tests.

## ADR-005 — Rust domain logic with external collector tools (Adopted)

Decision: Rust owns Core and Activity orchestration/validation/storage. Existing local gh, Codex app-server, Node plus `ccusage@20.0.20`, and OpenSSH are subprocess/tool boundaries. Pin packaged dependencies; probe actual executable capability. Do not port transcript parsing or copy Moriium's runtime scripts/cache wholesale.

Alternative: shipping a producer that imports the Moriium repository violates independence. Rejected. Runtime-owned tool setup is separate from scheduled execution. Test installation with both repositories unavailable and no runtime package download.

## ADR-006 — Memory schema and candidate lifecycle (Adopted)

Decision: five first-phase types: Fact, Preference, Episode, ProjectState, SessionCheckpoint. Explicit inspector saves/remember requests may commit validated records; inferred content goes through candidate review. Conversation/checkpoints/canonical Memory remain distinct.

Consequence: the first slice implements manual candidates/review, not complex model extraction. Schema details are an A1 contract task, not permission to omit provenance or persist solely in SQLite.

## ADR-007 — Mock Provider first (Adopted)

Decision: deterministic Mock consumes the recorded Context Capsule before any real inference provider is added. Retrieval initially uses FTS/metadata with explicit budgets and inclusion reasons.

Consequence: continuity can be proven offline with exact expected memory IDs. Activity usage adapters do not count as real inference-provider integration and do not receive capsules.

## ADR-008 — Local-first to disposable hybrid replica (Deferred implementation)

Direction retained: local canonical state may later produce an explicitly allowed warm context subset for offline client continuity. Raw archives and attachments are not automatically replicated. A replica must be discardable and resynchronizable.

Required later decisions: allowed data, consent, expiry, conflict policy, and encrypted transport/storage. No cloud-sync implementation is part of this phase.

## ADR-009 — MCP bridge and replaceable VPS gateway (Deferred implementation)

Direction retained: authenticated local MCP/tunnel validation precedes a minimal HTTPS gateway. Gateway handles authentication, validation, rate limits, connection forwarding, and minimal logs, not canonical Memory or Context rules.

Acceptance later: authenticated tools/candidate writes, offline local continuity, Delete-the-VPS Test, and no memory content in server logs. Existing Moriium Activity receiver is a separate protocol and is not this bridge.

## ADR-010 — Encryption at rest (Deferred decision)

Context: files contain private Memory and operational Activity state. A normal folder is not encrypted storage.

Interim decision: user-restricted Windows ACLs, local private state, minimal logs, no secret copies; do not claim encryption. Choose DPAPI/keychain/master-key/encrypted-vault behavior in a separate ADR before implementing encryption or automated remote backups. Current unknowns do not block synthetic offline development.

## ADR-011 — Embedded Core plus headless Activity runner (Adopted)

Decision: first Core slice is embedded in Tauri but packaged as reusable Rust libraries. Activity runs as a separate one-shot `enouia-activity.exe`, invoked by Task Scheduler or UI. No resident system service or UI timer owns collection.

Alternative: an embedded-only producer would stop with the UI; a full daemon would add unnecessary initial lifecycle work. The chosen split supplies scheduled activity without making a daemon prerequisite for Core. Test closing/crashing UI while the runner executes. The interactive Windows account must be logged in; logged-out execution is explicitly out of scope.

## ADR-012 — Activity is an independent domain; transfer only the local producer (Adopted)

Decision: Enouia owns collection, archive/merge, local durability, scheduling, sequence, pending/retry, upload, and local Activity UI. Moriium retains About presentation, public validation, VPS receiver/publisher, and static JSON contract.

Consequences: no Activity-to-Memory/Context dependency, no runtime Moriium repo/build/database dependency, and no copied credentials. Existing `runtime.json` is a separate presence input; this phase adds no heartbeat transport. No unilateral producer-name/version/server-ownership changes. Tests isolate domain failure and run a packaged worker without repository access.

## ADR-013 — Frozen v1 wire contract and correction-preserving merge (Adopted)

Decision: fixed sources/metrics/day labels; safe integer values; real unique dates; recursive public allowlist. Full merged snapshots travel with attempt/result metadata. Successful incoming dates replace old values, absent old dates remain, failed sources keep old successful snapshots/times.

Consequences: history dates never shrink while values may be revised down; no summing old/new cumulative values, no Codex timezone relabeling, no quota/cost substitution. Codex lifetime reconciliation is mandatory despite the old importer's permissive branch. Record all intentional differences in the comparison suite. AI admission floor is not archive retention.

## ADR-014 — Single-writer generation transaction and one pending batch (Adopted)

Decision: one exclusive process lock; immutable generations with archive, high-water, pending, and local delivery state; one atomic `CURRENT` commit. Send only after durable commit. Retry pending exactly before new collection. Sequence is persistent, never wall-clock based, never reset by reinstall or index repair.

Alternative: separate atomic renames do not give a multi-file transaction; an in-memory queue loses retry identity. Rejected. Consequence: unresolved delivery blocks subsequent collection; show that limitation in UI. No multiple-outbox feature or automatic generation pruning this phase. Test every crash boundary and simultaneous processes on Windows.

## ADR-015 — Existing restricted SSH with observed publication (Adopted)

Decision: use current producer/receiver v1 and local OpenSSH, stdin-only batch, strict host-key checks, bounded execution, and 4 MiB payload cap. A successful process is transport evidence only. Retain pending until exact public data hash and source outcome metadata are observed in a fresh static manifest, or an operator reconciles server evidence.

Context: receiver CLI exits successfully even when it ignores an old/equal sequence; manifest exposes no sequence receipt. Runtime must not invent a stronger acknowledgment or claim SSH success means publication.

Consequences: public observation is a read-only consumer of existing static files, not server ownership. Ambiguity blocks new collection; an operator may inspect server state through Moriium operations, never by broadening the producer key. Future receipt protocol requires coordinated change. Tests cover old-sequence exit 0, lost acknowledgments, all-failed same-data hashes, stale manifests, and conflicting remote high-water.

## ADR-016 — Two-track delivery and reversible cutover (Adopted)

Decision: M0 shared contracts, parallel A1–A3/B1–B3, J1 UI join, B4 isolated comparison/rehearsal, B5 explicit cutover then scheduled observation. Freeze old writer and import final state before any new production batch. Retain manual Moriium snapshot refresh separately.

Consequences: production activation is not implied by code/test completion. Rollback exports the **current** archive/high-water/pending to the old producer, not an old snapshot reset. Keep both writers stopped if remote state cannot be reconciled. At least one successful real scheduled run is required before considering removal of old automatic entry points.

## ADR-017 — Privacy-separated status and health (Adopted)

Decision: local health composes independent component states, operational modes, and observed times. Collection, transport, publication, and Runtime presence are separate facts. No raw subprocess text in public payloads or exported UI diagnostics. No automatic Activity inclusion in provider prompts.

Consequence: an unavailable source cannot be made fresh by updating a heartbeat or UI status. Ordinary daily zero growth remains successful. Tests use nested private sentinels and show a working Core demo during Activity failure.

## ADR-018 — Archive retention and backup lifecycle (Partial; defaults adopted)

Decision now: keep all known activity dates; keep committed generations and migration/rollback evidence through cutover and observation; no automatic deletion. Source floor, GitHub query window, and 90-day public status history are not deletion policies. Configuration and data migration are versioned and reversible where compatible.

Deferred: storage quota, generation compaction schedule, user-selected backup destination/frequency, and encryption policy. A later pruning implementation must preserve active pending, highest reserved sequence, verified snapshots, and current history. Restoring a backup always reopens high-water reconciliation before production upload.

## ADR-019 — Claude Design in the existing Claude series (Direction approved; implementation deferred)

The user wants official `claude_design` product tokens added to the existing Claude daily series, without a fourth public source or calendar. [ADR-019](019-claude-design-usage.md) records the conditional source, private component accounting, Shanghai-day conversion, and coordinated consumer-label gate. Current v0.3/v1 values keep their Code/Cowork meaning until that gate passes.
