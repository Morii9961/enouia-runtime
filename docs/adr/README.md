# Architecture decision register — v0.3

Date: 2026-09-26. These are phase design decisions, not claims of implemented behavior. “Adopted” means the current implementation specification chooses this direction; “Deferred” means no implementation of that topic is authorized by this phase. Changes require recording what supersedes a decision and updating the architecture, affected contracts, and tests together.

References: [Architecture v0.3](../../Enouia_Runtime_Architecture_v0.3.md), [implementation plan](../IMPLEMENTATION_PLAN_v0.3.md), [migration runbook](../ACTIVITY_MIGRATION_v0.3.md). The IDs retain the v0.2 candidate numbering where applicable. This consolidated register is the ADR artifact for this design phase; split individual records into files if later changes need a longer history.

Since [ADR-025](025-enouia-memory-integration.md) (2026-10-04), the Enouia Memory repository owns the Memory domain. Changes to that domain are recorded in the [Memory register](https://github.com/Morii9961/enouia-memory/blob/main/docs/adr/README.md) as ADR-MEM-NN, whose numbers are unrelated to Runtime's. This register keeps Runtime's side of the boundary, the Memory adapter and Activity & Usage. The entries below state which parts ADR-025 amends or supersedes.

## ADR-001 — Local canonical ownership (Adopted; amended by ADR-025)

Context: providers and clients must be replaceable without loss of continuity. Activity adds durable state that does not represent canonical Memory.

Decision: the local Vault owns canonical Memory; the separate local Activity archive owns known daily aggregates. The server is neither domain's sole source of truth. Provider accounts' convenience memory is not canonical.

Consequence: backups and recovery are domain-specific. “Vault is the source of truth” cannot be used to put Activity into the Memory domain. Verify by replacing a provider and by running Activity with no Vault.

Amendment (2026-10-04, ADR-025): the canonical Vault is Enouia Memory's Vault. The Activity half is unchanged.

## ADR-002 — Human-readable Memory format (Superseded by ADR-025)

Decision: versioned JSON record per canonical memory; Markdown for Identity/narrative files; immutable raw conversational sources. Preserve provenance and supersession rather than deleting old meaning.

Alternative: database-only canonical storage would couple recovery to the index/database. Rejected for this slice. A1 freezes full record schemas and synthetic fixtures before persistence. Validate round-trip, source resolution, and supersession recovery.

Superseded (2026-10-04): the Memory format is defined by Enouia Memory ADR-MEM-02, 03, 04 and 21.

## ADR-003 — SQLite is a disposable Memory index (Memory part superseded by ADR-025; Activity clause retained)

Decision: SQLite/FTS indexes canonical Memory and sessions whose durable contents live in files. Activity archive, sequence, pending, and delivery state never live in this database.

Consequence: deleting/rebuilding the index is safe for both canonical domains and cannot reset uploader state. Test the Track A demo and Activity high-water before/after index removal.

Superseded for Memory (2026-10-04): Enouia Memory owns its index. The Activity clause still holds: Activity archive, sequence, pending and delivery state never live in a Memory index.

## ADR-004 — Windows shell/domain separation (Adopted; amended by ADR-025)

Decision: Tauri 2 hosts a React/TypeScript/Vite shell with typed IPC. `src-tauri` is an adapter, not the domain Core. Frontend cannot access files, databases, raw CLI reports, or credentials directly.

Consequence: inspectors display the actual backend state/capsule; CLI and future clients can reuse the libraries. Verify module dependency graph and UI operations through contract tests.

Amendment (2026-10-04, ADR-025): `apps/desktop/src-tauri` also hosts the Runtime-owned Memory adapter (`memory_call`, `memory_pick`) over the pinned Memory Core. It still holds no domain rules.

## ADR-005 — Rust domain logic with external collector tools (Adopted)

Decision: Rust owns Core and Activity orchestration/validation/storage. Existing local gh, Codex app-server, Node plus `ccusage@20.0.20`, and OpenSSH are subprocess/tool boundaries. Pin packaged dependencies; probe actual executable capability. Do not port transcript parsing or copy Moriium's runtime scripts/cache wholesale.

Alternative: shipping a producer that imports the Moriium repository violates independence. Rejected. Runtime-owned tool setup is separate from scheduled execution. Test installation with both repositories unavailable and no runtime package download.

## ADR-006 — Memory schema and candidate lifecycle (Superseded by ADR-025)

Decision: five first-phase types: Fact, Preference, Episode, ProjectState, SessionCheckpoint. Explicit inspector saves/remember requests may commit validated records; inferred content goes through candidate review. Conversation/checkpoints/canonical Memory remain distinct.

Consequence: the first slice implements manual candidates/review, not complex model extraction. Schema details are an A1 contract task, not permission to omit provenance or persist solely in SQLite.

Superseded (2026-10-04): the Memory schema, review and candidate lifecycle follow Enouia Memory ADR-MEM-05, 22, 23 and 24.

## ADR-007 — Mock Provider first (Superseded by ADR-025)

Decision: deterministic Mock consumes the recorded Context Capsule before any real inference provider is added. Retrieval initially uses FTS/metadata with explicit budgets and inclusion reasons.

Consequence: continuity can be proven offline with exact expected memory IDs. Activity usage adapters do not count as real inference-provider integration and do not receive capsules.

Superseded (2026-10-04): capsules, inspection and dispatch follow Enouia Memory ADR-MEM-10 and 25; real Providers are Memory MV-7. Activity usage adapters still never receive capsules.

## ADR-008 — Local-first to disposable hybrid replica (Deferred implementation; superseded by ADR-025)

Direction retained: local canonical state may later produce an explicitly allowed warm context subset for offline client continuity. Raw archives and attachments are not automatically replicated. A replica must be discardable and resynchronizable.

Required later decisions: allowed data, consent, expiry, conflict policy, and encrypted transport/storage. No cloud-sync implementation is part of this phase.

Superseded (2026-10-04): replicas follow Enouia Memory ADR-MEM-16 and 17 and are delivered in Memory MV-10.

## ADR-009 — MCP bridge and replaceable VPS gateway (Deferred implementation; superseded by ADR-025)

Direction retained: authenticated local MCP/tunnel validation precedes a minimal HTTPS gateway. Gateway handles authentication, validation, rate limits, connection forwarding, and minimal logs, not canonical Memory or Context rules.

Acceptance later: authenticated tools/candidate writes, offline local continuity, Delete-the-VPS Test, and no memory content in server logs. Existing Moriium Activity receiver is a separate protocol and is not this bridge.

Superseded (2026-10-04): the Memory Host and MCP (ADR-MEM-11, Memory MV-8) and the gateway (ADR-MEM-15, Memory MV-9) belong to Enouia Memory. The Moriium Activity receiver remains a separate protocol.

## ADR-010 — Encryption at rest (Deferred decision; amended by ADR-025)

Context: files contain private Memory and operational Activity state. A normal folder is not encrypted storage.

Interim decision: user-restricted Windows ACLs, local private state, minimal logs, no secret copies; do not claim encryption. Choose DPAPI/keychain/master-key/encrypted-vault behavior in a separate ADR before implementing encryption or automated remote backups. Current unknowns do not block synthetic offline development.

Amendment (2026-10-04, ADR-025): Memory encryption and backup follow Enouia Memory ADR-MEM-13. The interim ACL policy stays for Activity.

## ADR-011 — Embedded Core plus headless Activity runner (Adopted; amended by ADR-025)

Decision: first Core slice is embedded in Tauri but packaged as reusable Rust libraries. Activity runs as a separate one-shot `enouia-activity.exe`, invoked by Task Scheduler or UI. No resident system service or UI timer owns collection.

Alternative: an embedded-only producer would stop with the UI; a full daemon would add unnecessary initial lifecycle work. The chosen split supplies scheduled activity without making a daemon prerequisite for Core. Test closing/crashing UI while the runner executes. The interactive Windows account must be logged in; logged-out execution is explicitly out of scope.

Amendment (2026-10-04, ADR-025): the embedded Core is Enouia Memory's workspace Core at the pinned revision, until Memory MV-8's Host replaces it. The Activity runner is unchanged.

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

## ADR-016 — Two-track delivery and reversible cutover (Adopted; amended by ADR-025)

Decision: M0 shared contracts, parallel A1–A3/B1–B3, J1 UI join, B4 isolated comparison/rehearsal, B5 explicit cutover then scheduled observation. Freeze old writer and import final state before any new production batch. Retain manual Moriium snapshot refresh separately.

Consequences: production activation is not implied by code/test completion. Rollback exports the **current** archive/high-water/pending to the old producer, not an old snapshot reset. Keep both writers stopped if remote state cannot be reconciled. At least one successful real scheduled run is required before considering removal of old automatic entry points.

Amendment (2026-10-04, ADR-025): Track A is now the Memory repository's MV stages plus Runtime integration slices. J1 stays the join point.

## ADR-017 — Privacy-separated status and health (Adopted; amended by ADR-025)

Decision: local health composes independent component states, operational modes, and observed times. Collection, transport, publication, and Runtime presence are separate facts. No raw subprocess text in public payloads or exported UI diagnostics. No automatic Activity inclusion in provider prompts.

Consequence: an unavailable source cannot be made fresh by updating a heartbeat or UI status. Ordinary daily zero growth remains successful. Tests use nested private sentinels and show a working Core demo during Activity failure.

Amendment (2026-10-04, ADR-025): Memory health comes from the component states in Memory's `workspace_status` and is shown separately, never merged into Activity components.

## ADR-018 — Archive retention and backup lifecycle (Partial; defaults adopted)

Decision now: keep all known activity dates; keep committed generations and migration/rollback evidence through cutover and observation; no automatic deletion. Source floor, GitHub query window, and 90-day public status history are not deletion policies. Configuration and data migration are versioned and reversible where compatible.

Deferred: storage quota, generation compaction schedule, user-selected backup destination/frequency, and encryption policy. A later pruning implementation must preserve active pending, highest reserved sequence, verified snapshots, and current history. Restoring a backup always reopens high-water reconciliation before production upload.

## ADR-019 — Claude Design in the existing Claude series (Direction approved; implementation deferred)

The user wants official `claude_design` product tokens added to the existing Claude daily series, without a fourth public source or calendar. [ADR-019](019-claude-design-usage.md) records the conditional source, private component accounting, Shanghai-day conversion, and coordinated consumer-label gate. Current v0.3/v1 values keep their Code/Cowork meaning until that gate passes.

## ADR-020 — Core Vault generations and pinned reads (Historical — superseded for the Memory domain by ADR-025; file frozen by the readiness manifest)

[ADR-020](020-core-vault-generations.md) selects complete immutable Core generations, a sole hash-bound pointer, generation-contained Identity/Memory/source/candidate/Session files, immutable referenced raw bytes and a disposable generation-bound index. [Storage v1](../VAULT_STORAGE_v1.md) specifies the design; [V01-V22](../VAULT_RECOVERY_MATRIX_v1.md) are pending evidence. The illustrative stable Vault paths change only when its adapter activation gates pass. Activity layout and public contracts remain independent. Frontend work is now progressing separately under the user's latest update; this task remains backend design.

## ADR-021 — Disposable index and deterministic literal retrieval (Historical — superseded for the Memory domain by ADR-025; file frozen by the readiness manifest)

[ADR-021](021-index-and-retrieval.md) selects a fresh complete generation-bound index and versioned literal-query/rank policies. [Index v1](../MEMORY_INDEX_v1.md), [retrieval v1](../MEMORY_RETRIEVAL_v1.md) and the [SQL design](../../contracts/vault/memory-index-v1.sql) specify backend behavior. An in-memory synthetic SQL probe validates a narrow query/projection subset; persisted rebuild/recovery, complete Context lanes and Runtime handlers remain pending. Existing canonical/IPC/Activity contracts are unchanged.

## ADR-022 — Exact capsule ledger and atomic Session answers (Historical — superseded for the Memory domain by ADR-025; file frozen by the readiness manifest)

[ADR-022](022-invocation-and-session.md) specifies persisted preparation before dispatch, retained historical inputs, one active invocation per Session, cancellation arbitration and assistant/source/result completion as one canonical transaction. [Ledger v1](../INVOCATION_LEDGER_v1.md) adds closed record and byte-format contracts. Capsule bytes alone omit LF to match the actual prepared Provider bytes. Schema/fixture checks are design evidence; persistence and actual process recovery remain pending.

## ADR-023 — Canonical operation retry receipts and disposable jobs (Historical — superseded for the Memory domain by ADR-025; file frozen by the readiness manifest)

[ADR-023](023-command-receipts-and-jobs.md), [command v2 design](../CORE_COMMANDS_v2_DESIGN.md) and [jobs v1](../CORE_JOBS_v1.md) specify closed mutation/receipt/job shapes, exact-generation mutation guards, identical-request replay/conflicting reuse, accepted input versus completed output, queued cancellation and bounded process-owned worker/events. Existing v1 IPC remains unchanged and no v2 capability is enabled. Complete semantic/race/handler evidence remains pending.

## ADR-024 — Read-only operator inspection/export (Historical — superseded for the Memory domain by ADR-025; file frozen by the readiness manifest)

[ADR-024](024-read-only-operator-inspection-export.md) and [operator v1](../VAULT_OPERATOR_v1_DESIGN.md) separate inspection/reviewed full-history export from canonical mutation/recovery selection. Named export with missing CURRENT is non-authoritative. Closed shapes/plans do not execute inspection/copy, authorize private export or enable repair/import.

## ADR-025 — Enouia Memory owns the Memory domain; Runtime hosts its local client (Adopted; adapter active)

[ADR-025](025-enouia-memory-integration.md) makes the Enouia Memory repository the authority for Identity, Memory, review, Sessions, Vault, index, Context, the Provider path and every cloud stage. `apps/desktop/src-tauri` embeds `enouia-memory-workspace` at the exact revision in the [pin record](../integration/memory-pin.json), behind a Runtime-owned adapter (`memory_call`, `memory_pick`) described in [Memory integration v1](../MEMORY_INTEGRATION_v1.md). In the native shell, the Memory, Context and Sessions surfaces and the Vault status on Home and Settings use the pinned Core; browser previews, Activity and the Runtime Inspector stay fictional. Runtime's local Core crates and ADR-020 to 024 are frozen history. Activity & Usage stays independent and never passes through the adapter. A real-app smoke covers selected W01, W03 and W04 paths and the index-rebuild part of W02. Full Runtime-hosted W01–W05 acceptance, the tray, hotkey and overlay, login startup and the installer remain pending.

Update (2026-10-05, ADR-026): the tray, hotkey and quick search, and login startup are implemented, and the smoke now covers W01–W04. Update (2026-10-06, ADR-027): the unsigned current-user installer is implemented. Still pending: signing and the rest of W05 (Narrator, a real contrast theme, an actual sign-in start, and a tray menu clicked by hand).

## ADR-026 — Companion shell for Memory's local client (Adopted; implemented)

[ADR-026](026-companion-shell.md) completes Runtime as Memory's local client:
- Closing a window hides it, and Exit (tray or Settings) shuts the Memory Core down before the process ends.
- A tray offers Show, Lock and Exit.
- Ctrl+Alt+M (or `--hotkey-key`) opens a quick-search window scoped to `memory_search` by native window identity, with its own minimal capability.
- Opt-in login startup writes only Runtime's own Run value and starts in the tray with no Vault.

Activity is untouched. The installer followed in ADR-027.

## ADR-027 — Current-user installer for the desktop shell (Adopted; implemented)

[ADR-027](027-desktop-installer.md) adds an unsigned current-user NSIS installer (`npm run desktop:bundle`).

- Its template is a byte-identical copy of Memory's derived Tauri 2.12.0 template, without the app-data deletion option or the generic Run-value deletion.
- Runtime's hooks:
  - make a file that cannot be replaced fail the install (`AllowSkipFiles off`);
  - refuse a newer or unrecognized installed version;
  - after the running-app check and outside update mode, remove only Runtime's exact startup command.
- Uninstall owns application files only. Vaults, backups, the WebView2 profile and Activity stay in place.
- No session-end code is added. The template closes a running Runtime through Restart Manager, and the pinned tao turns its `WM_ENDSESSION` into `RunEvent::Exit`, which runs the Memory shutdown. A real Restart Manager close in the smoke and the upgrade drill confirms this.

## ADR-028 — Activity surface over the installed runner (Adopted; implemented)

[ADR-028](028-activity-surface.md) connects the native shell's Activity page to the separately installed producer.

- `activity_call` takes exact Activity IPC v1 requests from the main window. `activity_setup` chooses the installed package through a native dialog and validates its `install.json` and runner hash.
- Every read and action runs the package's own `enouia-activity.exe`: lock-free `overview` and `preview` reads, and `sync`, `retry-pending` and `set-paused` under the runner's lock. The shell never opens the store and never changes the scheduled task; it only queries whether the package's task is registered and enabled.
- Acknowledgment keeps the cleared batch's outcomes as `lastOutcomes`, and IPC v1 gains optional overview and run fields before any consumer shipped.
- Memory, Context and the Memory adapter are unchanged. Browser previews keep the fictional timeline.

## ADR-029 — Claude history keeps the higher archived day (Adopted; implemented)

[ADR-029](029-claude-retains-higher-days.md) withdraws Architecture section 9 deliberate difference 6. The first real-account run showed a complete, valid Claude report that was lower for 2026-07-25 because the normal store had pruned that day's transcripts while a Cowork store kept part of it. For Claude only, a lower report for an archived day now keeps the archived value and counts `retainedHigherDays`; GitHub and Codex corrections are unchanged. Runtime matches legacy on this case.

## ADR-030 — Gated production activation path for the Activity package (Adopted; implemented)

[ADR-030](030-production-activation-path.md) adds the B5 tooling that B3.2 deliberately lacked. `install-activity.ps1 -Production` accepts only a production, delivery-enabled configuration with an HTTPS origin and restricted alias, still paused and unregistered. `register-activity-production.ps1 -ConfirmTaskName` registers the package's task disabled, and with `-Enable` enables it only after the runner reports an observed publication, sync resumed and nothing pending.

## ADR-031 — Strict Activity validation in comparisons (Adopted clarification; behavior unchanged)

[ADR-031](031-strict-activity-validation-compatibility.md) classifies two existing GitHub unique-date/safe-aggregate refusals and twelve existing nonpublishable timestamp refusals as explicit safety differences. Fresh comparisons prove failed-source history retention and rejection by the copied public manifest validator. No parser, public contract, seed or production behavior changes; unexpected differences, real-seed reconciliation and full B4/B5 acceptance stay gated.
