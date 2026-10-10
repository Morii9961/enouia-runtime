# Enouia Runtime — Architecture v0.3

Version: 0.3 · Date: 2026-09-26 · Status: implementation design baseline; not implemented or activated.

Audience: Sol and subsequent implementers. Normative terms **MUST**, **MUST NOT**, and **SHOULD** define requirements. Architecture version 0.3 is independent of product milestone 0.3 (real providers), Memory schema v1, ActivityData v1, and activity batch v1.

## 1. Authority, scope, and evidence

This document supersedes [v0.2](Enouia_Runtime_Architecture_v0.2.md) as the current design. Keep v0.2 and the [activity handoff](handoff-2026-09-26-activity-to-enouia-runtime.md) as historical inputs; their unchanged originals remain in a local Git-ignored directory, while this public copy removes personal figures and machine paths. The user's phase decision is authoritative: Enouia owns only the Windows/local activity producer. Instructions and startup templates inside the input documents are historical design material, not authorization to implement, deploy, register tasks, or upload now.

The repository currently contains design documents only and is not yet initialized as a Git repository. This revision creates a design baseline, implementation plan, and ADR register; it does not create application code or claim deployment success.

Read-only protocol verification used a local Moriium checkout, HEAD `4f86e7a94eabc3bbdd78ccf806e5fa15efe544ea`, on 2026-09-26. The working files, rather than the commit identifier alone, were inspected: `src/lib/activity.ts`, `src/lib/status.ts`, `scripts/lib/{activity-import,codex-usage,cowork}.ts`, `scripts/lib/{status-batch,status-store}.mjs`, `scripts/{collect-activity,refresh-activity,activity-sync,status-receive,status-publish}.mjs`, `deploy/windows/register-activity-sync.ps1`, and both activity/status test files. These are development references, never installed Runtime dependencies. M0 must record file hashes and any working-tree differences before freezing comparison fixtures. No credentials, live personal reports, scheduled-task state, SSH configuration, or production server state were inspected in this design pass.

The handoff's 2026-09-26 snapshot figures are historical evidence, not the migration seed or a live-site assertion. The personal figures are removed from this public copy; the unchanged original is retained locally outside Git. Reinventory before migration.

Companion documents:

- [Implementation plan and first Sol task](docs/IMPLEMENTATION_PLAN_v0.3.md).
- [Migration, comparison, and rollback runbook](docs/ACTIVITY_MIGRATION_v0.3.md).
- [ADR register](docs/adr/README.md).
- [Design validation evidence and source hashes](docs/DESIGN_VALIDATION_v0.3.md). M0 rechecks these for drift before freezing executable fixtures.

2026-10-04 follow-up (ADR-025): the Enouia Memory repository now owns the Memory domain, and Runtime is the Windows client that hosts its local frontend; see [ADR-025](docs/adr/025-enouia-memory-integration.md) and [Memory integration v1](docs/MEMORY_INTEGRATION_v1.md). Where the Identity, Memory, Context, Session and Provider requirements below differ from the Memory repository, they are historical. The Activity requirements are unchanged.

## 2. Product principles retained from v0.2

Enouia is a local-first runtime for identity, memory, context, sessions, tools, and continuity. Models, clients, and servers are replaceable. Model replacement must not reset identity. Windows is the first client surface, not the owner of the domain model.

The Memory Vault is canonical **for the Memory / Context domain**. It is not the canonical store for every Runtime subsystem. Keep raw conversational sources, reviewed canonical memories, and request-specific context capsules separate:

```text
Conversational raw archive -> candidate extraction -> review/dedupe
  -> canonical Memory Vault -> disposable index -> Context Compiler -> Provider

GitHub / Codex / Claude activity -> validated daily aggregates
  -> Activity Archive + delivery state -> existing Moriium receiver/publisher
```

Activity & Usage is a separate domain. It MUST NOT write memory candidates, session checkpoints, conversational raw archives, context capsules, or provider prompts. A future explicit activity-to-context feature requires its own consent, interface, and ADR. No such integration is included here.

The first phase delivers two independent vertical slices: Track A proves local memory continuity using a Mock Provider; Track B proves durable activity production and compatible delivery. A failure in Activity must not make a healthy Vault or conversation unavailable, and a missing Vault must not stop the activity runner.

## 3. Ownership and non-goals

| Responsibility | Owner in this phase | Boundary |
|---|---|---|
| Identity, Memory, Context, Sessions, Provider abstraction | Enouia Runtime Core | Local canonical files and rebuildable Memory index |
| GitHub / Codex / Claude collectors and source normalization | Enouia Activity & Usage | Runs on this Windows user account |
| Activity archive, merge, failure retention | Enouia Activity & Usage | Independent durable data root |
| Scheduling, lock, sequence, pending batch, upload | Enouia Activity & Usage | One production writer for `morii-workstation` |
| Windows Usage / Activity UI and local diagnostics | Enouia Windows Shell + typed backend | No frontend filesystem, credentials, or subprocess access |
| About-page presentation and three-language rendering | Moriium | Existing static Astro build and browser behavior |
| Public ActivityData validation authority | Moriium | Runtime implements a compatible producer-side validator; no unilateral contract change |
| VPS receiver, publisher, public manifest/JSON | Moriium | Existing restricted SSH and static files |
| Author database and `/api/status/` | Moriium author system | Completely outside this integration |
| CLI login and SSH key lifecycle | User's local tools / OS | Reference local sessions; never copy authentication files |

2026-10-04 follow-up (ADR-025): Identity, Memory, Context, Sessions and the Provider abstraction are now owned by the Enouia Memory repository, not a Runtime Core. Runtime hosts Memory's local client through a pinned dependency and a Runtime-owned adapter. Memory's later stages (real Provider, MCP, gateway, replicas) are planned there. The other rows are unchanged.

Runtime MUST run from an installed package with the Moriium checkout absent and an unrelated working directory. It MUST NOT import Moriium modules, execute Moriium package scripts, read its build tree at runtime, query its author database, or discover credentials in that repository. A one-time explicitly selected archive import and development comparison against the old source are allowed; neither establishes a runtime dependency.

Retain `pnpm activity:refresh` in Moriium during migration for manual build-snapshot maintenance. It keeps its own output/archive and is not Runtime's scheduler entry point. Manual and automated commands MUST NOT share an `activity.json`, lock, sequence, or pending file. Neither build-snapshot refresh nor a code merge proves that public JSON changed.

Not in this phase: moving the VPS services, changing producer identity or wire versions, automatic server deployment, MCP, real inference-provider integration, cloud memory sync, warm replicas, voice/avatar, autonomous agents, desktop surveillance, multi-user service, vector database, or knowledge graph. Reading Codex/Claude **usage** is in scope even though invoking them as inference providers is deferred. Explicitly configured Activity upload is the narrow exception to v0.2's blanket “no automatic upload”; Memory still has no automatic upload or telemetry.

## 4. Process topology and module boundaries

```text
Windows UI (Tauri 2 / React / TypeScript / Vite)
  -> typed Tauri commands -> embedded enouia-core
       -> identity / memory / context / session / provider libraries
       -> Activity read facade + worker launcher + health adapter

Windows Task Scheduler OR UI manual request
  -> installed enouia-activity.exe (one-shot headless Rust process)
       -> enouia-activity library
       -> local gh / Codex app-server / Node + pinned ccusage
       -> Activity data root under exclusive writer lock
       -> local OpenSSH -> existing Moriium restricted receiver
       -> optional read-only static publication observation
```

The UI never hosts an hourly timer. The scheduled runner works while the UI is closed, provided the configured Windows user is logged in. Track A initially embeds Core in Tauri; a UI crash may end that embedded instance, but all durable state survives and domain libraries remain reusable. v0.3 does not promise a continuously running separate Core daemon. Activity's separate one-shot runner supplies the required background execution without waiting for a future service process.

| Module | Owns | Must not own |
|---|---|---|
| `enouia-common` | Clock, atomic-file abstraction, restricted path handling, process runner, cancellation, redacted error codes, health DTOs | Domain schemas, global database, arbitrary UI shell execution |
| `enouia-core` | Lifecycle/config, identity loading, Track A orchestration, typed client API, component-health composition | Collector parsing, Activity transactions |
| `enouia-memory` | Canonical records, candidates, provenance, supersession, Vault I/O, SQLite index | Activity data or upload state |
| `enouia-context` | Retrieval, deterministic ranking, budgets, capsule assembly | Activity archive queries, implicit uploads |
| `enouia-session` | Conversation events and checkpoints | Activity sessions inferred from CLI logs |
| `enouia-provider` | Request/response/capabilities, Mock Provider; future model adapters | Identity ownership or automatic memory writes |
| `enouia-activity-contract` | ActivityData v1, batch v1, normalization/allowlist and compatible serialization | Filesystem, network, UI, Memory |
| `enouia-activity` | Collector adapters, archive merge, durable store, state machine, scheduler policy, uploader and publication observer | Memory/Context/Provider dependencies |
| `enouia-activity-runner` | `enouia-activity.exe` commands, exit codes, config selection | Independent domain logic |
| `apps/windows/src-tauri` | Narrow IPC, window/tray/hotkey, worker launch, Activity read facade | Business rules or raw credential plumbing |

Dependency rule: `enouia-activity` may depend on `enouia-common` and `enouia-activity-contract`; it MUST NOT depend on `enouia-core`, `enouia-memory`, `enouia-context`, `enouia-session`, or `enouia-provider`. Core may compose read-only Activity status through a facade. No circular domain dependencies. Schema-generated UI DTOs describe interfaces without making React a validator authority.

2026-10-04 follow-up (ADR-025): instead of a Runtime `enouia-core` (never created), `apps/desktop/src-tauri` embeds Enouia Memory's `enouia-memory-workspace` at a pinned revision behind a Runtime-owned adapter, until Memory MV-8's Host replaces it. The Runtime-local `enouia-memory`, `enouia-context`, `enouia-session`, `enouia-provider` and `enouia-core-contract` crates are frozen history. The Activity modules and their dependency rule are unchanged.

## 5. Target repository and installed data layout

Create directories only as their milestone needs them. The following is the target, not a claim that scaffold code already exists.

```text
enouia-runtime/
  README.md
  Enouia_Runtime_Architecture_v0.2.md       # preserved history
  Enouia_Runtime_Architecture_v0.3.md       # current authority
  handoff-2026-09-26-activity-to-enouia-runtime.md
  Cargo.toml / Cargo.lock
  package.json / pnpm-workspace.yaml / pnpm-lock.yaml
  apps/windows/
    src/{app,components,lib}/
    src/features/{chat,memory,context,activity,runtime-status,settings}/
    src-tauri/
  crates/
    enouia-common/  enouia-core/  enouia-memory/  enouia-context/
    enouia-session/ enouia-provider/
    enouia-activity-contract/
    enouia-activity/src/
      collectors/{github,codex,claude,cowork}/
      archive/ merge/ store/ sync/ scheduler/ upload/ health/
    enouia-activity-runner/
  contracts/{memory,context,provider,ipc,activity}/
  tests/{fixtures,contract,integration,recovery,comparison}/
  tests/fixtures/{memory,activity}/        # synthetic or reviewed sanitized data
  tools/windows/                         # install/uninstall task, diagnostics
  tools/activity/                        # pinned ccusage tool installation metadata
  examples/{config,vault}/                # synthetic examples, not live stores
  docs/{IMPLEMENTATION_PLAN_v0.3,ACTIVITY_MIGRATION_v0.3}.md
  docs/adr/README.md
```

Reserve `services/runtime-service`, `bridge/mcp`, and conversational `importers/{chatgpt,claude,generic}` for later milestones. The Claude conversation importer is unrelated to the Claude activity adapter.

2026-10-04 follow-up (ADR-025): the desktop app lives in `apps/desktop`, not `apps/windows`. `services/runtime-service`, `bridge/mcp` and the conversational importers belong to the Enouia Memory repository, not to this layout.

Default installed data root: `%LOCALAPPDATA%\EnouiaRuntime`. Support an explicit absolute override. Reject production roots inside source/build/install directories or a cloud-synchronized folder; use a local filesystem whose replacement semantics have been tested. Resolve and check symlinks/reparse points before managed writes. Backups may be exported separately to user-selected storage. The current repository being on `E:` does not make it the default data location.

Core persistence follow-up (2026-10-02): [ADR-020](docs/adr/020-core-vault-generations.md) adopts a complete-generation backend design. [Storage v1](docs/VAULT_STORAGE_v1.md) specifies generation-contained Vault files and a disposable generation-bound index. The illustrative stable Core paths below are superseded only after that ADR's adapter activation gates pass; no data migration or writer is activated. Activity layout remains as specified below. The user's latest work scope is backend design here, with frontend work progressing separately.

2026-10-04 follow-up (ADR-025): Memory's Vault root is an explicit owner choice handled by Enouia Memory, through the native dialog or `--memory-vault`; there is no default or remembered root. Runtime's data root holds Activity only, so the `vault/` and `indexes/` entries below are historical.

```text
EnouiaRuntime/
  config/runtime.json                    # config_version: 1; no secrets
  vault/identity/{core,runtime_rules,...}.md
  vault/memory/{facts,preferences,episodes,projects,checkpoints}/
  vault/{sessions,raw,assets,candidates}/
  indexes/memory.sqlite                  # disposable, rebuildable
  activity/
    config.json                          # local paths/aliases; private, no tokens
    CURRENT                              # atomic pointer to one committed generation
    generations/<generation-id>/
      manifest.json                      # hashes and local schema version
      activity.json                      # complete ActivityData v1 archive
      sequence.json                      # {"sequence": N}: highest reserved sequence
      pending.json                       # exact frozen batch bytes, or absent
      delivery.json                      # local outcomes, pause/retry state, receipts
    snapshots/                           # immutable recovery exports; never daily overwrite
    migration/                           # private source manifests and rollback bundle
    diagnostics/                         # bounded, redacted local reports
    sync.lock                            # exclusive process-scoped OS lock handle
```

`CURRENT` is the sole live generation selector. Files named `activity.json`, `sequence.json`, and `pending.json` in a generation are real durable state, not caches. Read-only readers pin a generation for the whole read. Do not expose several independently updated “current” files at the root. A legacy exporter creates a consistent trio in a separate directory for rollback.

| Data | Authority | Rebuild/retention |
|---|---|---|
| Identity, canonical memories, conversations, checkpoints, raw conversational sources | Vault files | Back up; index cannot recreate them |
| Memory SQLite / FTS / future embeddings | Derived index | Delete/rebuild must not affect Activity |
| Known activity daily values and last successful source snapshots | Activity archive | Durable; upstream may never return them again |
| Reserved sequence and pending bytes | Activity store | Durable; never reset on reinstall or UI/index repair |
| Local diagnostics, executable paths, scheduler state | Local Activity operational records | Private; never in public ActivityData |
| Public JSON/manifest | Moriium publisher | Derived presentation; neither Memory nor producer archive authority |
| CLI auth/SSH keys | Existing local tools and OS | Not imported, backed up, or uploaded by Runtime |

Keep all committed Activity generations through the migration/observation period. No automatic archive-day retention limit. Post-migration generation compaction needs a separate retention decision and verified backups; it must preserve the active pending bytes and highest reserved sequence. Ninety-day public **status history** is not an Activity archive retention limit.

## 6. Runtime Core contract retained and made concrete

Identity uses human-readable Markdown, initially `core.md` and `runtime_rules.md`; later style, relationship, and boundaries files remain provider-neutral. Canonical Memory uses one versioned JSON record per memory. Required fields: `schema_version: 1`, `memory_id`, `type` (`fact|preference|episode|project_state|session_checkpoint`), `content`, `source_id`, `created_at`, `updated_at`, and `status` (`active|superseded|archived`). Add optional `project_id`, tags, validity interval, confidence, and supersession links without overwriting historical meaning. `content` is text; ProjectState adds structured `project_id`, `state`, `decisions[]`, and `open_loops[]`; checkpoint records add `session_id`, covered turn range, `last_state`, and `open_loops[]`. Freeze full JSON schemas and fixtures in A1 before storage implementation.

Every canonical record has resolvable provenance. Manual saves create a local source record. Explicit “remember” or inspector save may commit after validation; inferred memory goes to Candidate Inbox (`approve/edit/reject`), and ephemeral remarks are not persisted by default. The first slice needs explicit proposals and manual review, not AI extraction. Use `SUPERSEDES` links, preserve older records, and reject cycles. File-based sessions preserve turns separately from checkpoints; a checkpoint is neither the conversation nor a replacement for its raw source.

Vault writes stage, validate, flush, atomically replace, then update SQLite. A crash after the file commit but before index update is repaired by rebuilding/indexing changed records. SQLite holds source/memory/relation/project/session/time indexes and FTS; any session content or candidate decisions needed for recovery must live in canonical files, not only SQLite. Raw imports are immutable by default and record importer versions.

The Context Compiler accepts query, session, client surface, provider capabilities, and token budget. It retrieves from the Memory domain only, initially using metadata and FTS with deterministic tie-breaking by memory ID. Capsule fields preserve v0.2: `capsule_id`, `generated_at`, `query`, `identity`, `user_context`, `relationship_context`, `active_projects`, `relevant_memories`, `recent_session_checkpoints`, `recent_turns`, `open_loops`, `provenance`, and `budget.max_tokens`. A1 freezes schema versioning, token estimation, overflow behavior, and inclusion reasons. The inspector shows the **actual** capsule sent, memory/source IDs, timestamps, why included, and exclusions. No hidden additional provider context.

Provider ports use `ProviderRequest`, `ProviderResponse`, `ToolRequest`, `ToolResult`, and `ProviderCapabilities`. The first provider is deterministic Mock: reports ProjectState identifiers/titles present in the capsule, without network or keys. Provider results may propose candidates but never bypass Memory validation. Session checkpointing must survive restart and preserve open loops.

Track A demo remains: manually create MoriMeta ProjectState, ask its next step, inspect included provenance, receive a Mock answer, generate a checkpoint, restart, retrieve the same state, delete/rebuild SQLite, and repeat. Ship main window, inspectors, basic tray, configurable `Ctrl+Alt+E` hotkey, and minimal input overlay. Keep expensive indexing and collectors off the UI thread. Context compilation target remains under 300 ms for the agreed small local fixture corpus; record corpus/machine/measurement rather than claiming universal performance.

## 7. ActivityData v1 and batch v1

### 7.1 Public data

```ts
type SourceId = 'github' | 'codex' | 'claude';
type Day = { date: string; value: number };
type Snapshot = {
  updatedAt: string;
  timezone: 'GitHub' | 'Codex' | 'Asia/Shanghai';
  metric: 'contributions' | 'tokens';
  days: Day[];
};
type ActivityDataV1 = {
  version: 1;
  sources: { github: Snapshot | null; codex: Snapshot | null; claude: Snapshot | null };
};
```

This is an illustrative type notation; the source-specific constraints below are normative. `sources` must contain all three keys. `null` means no successful snapshot is known. A source object contains exactly the four displayed fields. A day contains only `date` and `value`. Dates must be real calendar dates with exact `YYYY-MM-DD` round-trip validity; no duplicates per source. Values must be nonnegative JavaScript-safe integers (`0..9,007,199,254,740,991`) even if Rust could represent larger integers. Reject unsafe arithmetic in component/day sums; UI grand totals use checked integer arithmetic and exact decimal text if necessary, never rounded floating-point totals.

| Source | `timezone` literal | `metric` literal | Interpretation |
|---|---|---|---|
| github | `GitHub` | `contributions` | GitHub contribution calendar labels |
| codex | `Codex` | `tokens` | Account-wide, cache-inclusive, server-defined daily buckets |
| claude | `Asia/Shanghai` | `tokens` | Claude Code plus local Cowork; Shanghai calendar dates |

These timezone labels are contract literals, not three interchangeable IANA zones. Never rebucket Codex into Shanghai, sum Codex and Claude daily buckets into one calendar, substitute quota percentages/cost/noncached tokens, or claim local Claude logs cover remote Cowork.

Parse compatible valid timestamps; emit new timestamps as UTC ISO-8601 with milliseconds. Do not rewrite a migrated failed source's old timestamp. Reconstruct a fresh allowlisted object on every public serialization, including nested days. Unknown public input fields may be discarded as Moriium does; malformed required fields fail. Raw reports, paths, titles, model names, cost, session identifiers, tool configuration, environment values, credentials, and internal health codes MUST NOT be serialized.

Sort days ascending. Freeze byte serialization order for compatible hash reproduction: root `version,sources`; sources `github,codex,claude`; snapshot `updatedAt,timezone,metric,days`; day `date,value`; compact UTF-8 JSON plus one LF for published data. Moriium computes SHA-256 over those **data** bytes, not over the batch or a pretty-printed local file.

### 7.2 Upload envelope

The compatible normalized batch has the following shape (synthetic values):

```json
{
  "version": 1,
  "producer": "morii-workstation",
  "sequence": 42,
  "createdAt": "2026-09-26T08:00:01.000Z",
  "sources": {
    "github": {"attemptedAt":"2026-09-26T08:00:00.000Z","succeededAt":"2026-09-26T08:00:00.000Z","result":"success"},
    "codex": {"attemptedAt":"2026-09-26T08:00:00.000Z","succeededAt":null,"result":"failed"},
    "claude": {"attemptedAt":"2026-09-26T08:00:00.000Z","succeededAt":null,"result":"failed"}
  },
  "data": {
    "version": 1,
    "sources": {
      "github": {"updatedAt":"2026-09-26T08:00:00.000Z","timezone":"GitHub","metric":"contributions","days":[{"date":"2026-09-26","value":0}]},
      "codex": null,
      "claude": null
    }
  }
}
```

`sequence` is an integer in `1..MAX_SAFE_INTEGER`. The receiver's `validateBatch` derives `succeededAt` from `data.sources[id]?.updatedAt ?? null`; callers cannot assert a different successful time. Accept legacy input without `succeededAt`; normalize new batches to the displayed form. Exact imported pending bytes can omit it because the receiver normalizes them. Reject an imported pending object containing private extras rather than silently modifying a batch that may already have been sent.

Every source has `attemptedAt` and `result: success|failed`. Envelope `createdAt` and `attemptedAt` must pass Moriium's exact ISO round-trip check: `new Date(value).toISOString() === value` (emit UTC with milliseconds and `Z`, not an equivalent offset string). For success, a snapshot must exist and its `updatedAt` string equals `attemptedAt`. For failure, preserve the previous snapshot and previous `updatedAt`, or `null` if none exists. Snapshot time must be no later than its attempted time; attempted time must be no later than `createdAt`. Receiver rejects `createdAt > receiverNow + 300 seconds`; local clocks must be checked rather than timestamps invented. Old pending batches have no artificial retry-age expiration.

ActivityData validation alone accepts a broader parseable `updatedAt` than the public status manifest's exact ISO check for derived `succeededAt`. Migration must verify both layers. If a retained successful timestamp is not publishable through the existing manifest, flag the seed for explicit compatibility reconciliation; do not silently refresh or restamp a failed source.

Always send full merged data, never a delta. Zero additional days, zero token growth, or an explicit zero-valued day can be successful collection. A structurally empty/malformed upstream response is not evidence of zero usage. All-source failure may send a valid failure batch with retained data and old success times, so freshness is not fabricated. `runtime.json` heartbeats cannot replace this envelope.

Changing `producer`, version, source names, units, or server ownership requires a coordinated Moriium change and compatibility acceptance. v0.3 authorizes none of those changes.

## 8. Collector ports and adapters

Internal interfaces are deliberately distinct from public schemas:

```text
Collector.preflight(config, processRunner) -> CapabilityResult
Collector.collect(attemptedAt, clock, cancellation) -> SourceAttempt
SourceAttempt = Success { source, attemptedAt, validatedIncomingSnapshot }
              | Failed  { source, attemptedAt, localErrorCode }
Merge(previousSnapshot, SourceAttempt, acquisitionPolicy) -> MergedSource
ActivityStore.read() -> ConsistentGeneration
ActivityStore.commit(expectedGeneration, nextGeneration) -> GenerationId
Uploader.send(frozenBytes) -> TransportOutcome
PublicationObserver.observe(expectedDataHash, expectedSourceOutcomes) -> Observation
Sync.run(trigger) -> RunSummary
```

Collectors cannot write the archive, allocate sequences, upload, or acquire a different domain's store. `attemptedAt` is captured once per run for all three source attempts, before collection; `createdAt` is captured after collection. Record separate duration diagnostics locally. Preflight errors become failed attempts, retaining only the affected source. Storage/clock/ownership errors block the whole transaction.

Adapters run on this Windows account using explicit resolved executable paths/config. Environment values that contain secrets are only passed to the necessary subprocess/request in memory and never placed on a command line or persisted. No shell concatenation. Kill owned child process trees on timeout/cancellation. Set output bounds and redact stdout/stderr from diagnostics. A normal run has a 10-minute aggregate collection budget, within the 15-minute scheduled job limit; source defaults are GitHub 40 seconds (HTTP 30), Codex 90 seconds, Claude 120 seconds per store subject to the aggregate budget. Incomplete Claude store traversal fails the whole Claude attempt. Tests use fake processes and clock, not personal credentials.

### GitHub

Use the official contribution calendar through local authenticated `gh api graphql` or a process-local `GITHUB_TOKEN` / `GH_TOKEN` when supplied. Prefer an explicitly configured account/login; initial migration must verify the handoff account rather than infer from a machine username. Query at most one year (`end - 364 days` through `end` is the compatibility default). Record source date labels unchanged. Reject GraphQL errors, malformed calendars, invalid or repeated dates, and unsafe counts. GitHub can revise existing dates downward or upward; those are replacements, not additive increments.

### Codex

Use the chosen local CLI's `app-server` with initialize/initialized and `account/usage/read`. Probe actual method capability and response shape, not just an executable version string. Discovery is explicit override first, then locally discovered candidate executables, then capability-tested PATH fallback; record the selected path/version locally. Do not hardcode the desktop app's versioned install directory.

The handoff observed PATH `0.130.0` rejecting the method with `-32600 unknown variant` and bundled `0.158.0-alpha.2` working. These are dated compatibility observations, not pinned install paths or a current support guarantee. An unsupported method marks Codex unavailable and preserves its old snapshot; do not fall back to local session logs, quota percentages, `ccusage codex`, or extracted bearer tokens. CLI owns authentication; Runtime must not read `auth.json`.

Require nonempty `dailyUsageBuckets[{startDate,tokens}]`, real unique dates, safe nonnegative integers, and a safe nonnegative `summary.lifetimeTokens`. Sum all returned raw buckets before retention filtering and require exact equality with lifetime. The merged archive may exceed the current response total because history is retained. Do not compare merged lifetime to the response lifetime.

### Claude Code and local Cowork

Install/resolve `ccusage@20.0.20` as a Runtime-owned pinned tool, not from Moriium's `.cache`; invoke a configured Node executable and CLI in offline JSON daily mode with `Asia/Shanghai`. Dependency installation is a setup step, never a network package download in a scheduled run. Check package name/version in preflight. Preserve the old invocation semantics (`claude daily --json --offline --timezone Asia/Shanghai`) until fixture tests demonstrate compatibility with the packaged CLI.

Run the normal Claude store once, then each distinct local Cowork task's private `.claude` config store with process-scoped `CLAUDE_CONFIG_DIR`. Discover both `local-agent-mode-sessions` and `claude-code-sessions` under the local Claude application data tree; baseline traversal depth is six. Include only task stores with transcript files. Canonicalize/deduplicate store paths including overlap with the default store, avoid reparse traversal loops, and don't double count a shared store. ccusage owns transcript-level deduplication and cumulative-token interpretation. Do not invent a second raw transcript parser. An absent optional Cowork root is normal; access denied, truncated discovery, or an unreadable discovered store is a failure, not an empty store. If expected stores disappear, retain the old Claude snapshot and require an explicit local inventory review before adopting a new store set.

For each daily row validate `inputTokens + cacheReadTokens + cacheCreationTokens + outputTokens == totalTokens` with checked safe-integer arithmetic. Reasoning is already included in output; never add `reasoningOutputTokens`. Sum validated rows from disjoint stores by day, then merge that source's daily totals against the archive. A failure in any participating store fails the Claude source as a whole; publishing just the readable subset could erase known usage for a date.

## 9. Historical merge and failure semantics

For each source, construct a date-keyed map from all previously known days. On a successful attempt, replace the value for each explicitly returned accepted date; add new dates; retain previous dates absent from the response. For Claude, a lower complete report keeps the higher archived day under [ADR-029](docs/adr/029-claude-retains-higher-days.md); GitHub/Codex corrections and upward Claude corrections replace normally. Sort ascending. Never add incoming cumulative daily totals to old totals or substitute maxima for corrections beyond that documented Claude retention rule. Date set is monotonic; values and aggregate totals are not necessarily monotonic. Produce local deltas distinguishing new dates, revised dates, retained-higher Claude days and total change.

Acquisition policy: AI archive floor is `2026-01-01`; GitHub keeps its complete current one-year response even when it begins earlier. Floors apply only to admission of new response days, never eviction of migrated/known days. Freeze the run's end date using the legacy Shanghai date label for acquisition bounds, without transforming source dates. Ignore future incoming days beyond that bound as the compatibility collector does; record the count locally. If previous known dates exceed that bound or local time is before a stored successful time, block collection with `clock_regression` rather than pruning the archive. Resume once the clock is valid; do not fabricate forward times.

Validate complete upstream reports first (including Codex lifetime equality), then select admissible incoming days. No admissible incoming days is a failed collection, except that explicit valid zero rows are admissible. For failure, retain the previous source object exactly in semantic content and preserve its old time. Other sources can still advance. Missing today's record never deletes yesterday or marks today's actual use as zero. UI display filling of a calendar must not become persisted fabricated rows.

After merge, validate the whole ActivityData and enforce `oldDateSet ⊆ newDateSet` per source and nondecreasing source timestamps. Known non-null sources cannot become null. If a report is incomplete or the run is cancelled before all outcomes are finalized, do not commit any of its candidate data. Normal per-source timeouts produce explicit failed outcomes; catastrophic process interruption produces no batch.

### Deliberate differences from legacy implementation

These are safety decisions derived from the handoff, not reasons to silently alter golden expectations:

1. Legacy Codex importer accepts buckets without a safe lifetime field (its test explicitly permits this); Runtime fails that source because the handoff requires reconciliation.
2. Legacy merge filters all old days against `end`; Runtime blocks clock rollback instead of losing history.
3. Legacy collector uses `min(2026-01-01, githubLookbackStart)` for all sources; Runtime uses the stated AI floor for new AI days, keeps all imported older known days, and keeps full GitHub lookback.
4. Legacy Cowork directory reads can swallow access errors; Runtime distinguishes absent roots from unreadable/incomplete stores.
5. Runtime deduplicates store paths and uses generation transactions/flushes instead of treating independent file renames as a multi-file transaction.
6. Withdrawn by [ADR-029](docs/adr/029-claude-retains-higher-days.md) (2026-10-07): Claude stores lose transcripts upstream, so Runtime, like legacy, keeps a higher archived Claude day after a lower complete report and records it as a local delta.
7. Legacy Claude import checks each daily row but ignores the report-level `totals.totalTokens`; Runtime requires the report total to equal the sum of its daily rows, so a mismatch fails the whole source.
8. [ADR-031](docs/adr/031-strict-activity-validation-compatibility.md) classifies existing strict GitHub validation: legacy may collapse duplicate report dates or accept an unsafe combined total; Runtime fails that source under the normative unique-date/safe-integer contract and preserves its prior snapshot/time.
9. [ADR-031](docs/adr/031-strict-activity-validation-compatibility.md) classifies existing strict retained-time parsing: legacy archive parsing accepts local time without a zone, RFC 1123, hour 24 and impossible calendar dates; Runtime refuses those migration seeds. The public manifest's retained success-time validator rejects them too. This does not change accepted date-only/offset/no-millisecond forms, their publishability flags, or the requirement for explicit reviewed reconciliation without automatic restamping.

Record these cases in the comparison report. All ordinary valid baseline reports must match old daily values exactly. If a required stricter check cannot be met by the installed tools, leave that source degraded and resolve the evidence; do not silently weaken the contract.

## 10. Atomic persistence, sequence, and recovery

One writer lock covers recovery, pending retry, collection, merge, sequence reservation, durable commit, upload disposition, and pause/config mutation. UI manual runs, scheduler runs, imports, exports needing a consistent snapshot, and repair tools use the same canonical data-root identity. Use a process-owned OS exclusive lock; the existence of `sync.lock` alone is not ownership. A crashed OS process releases its handle. Never break a live lock based only on age or a PID file. Legacy stale-lock cleanup remains an operator action with its task stopped.

Commit protocol:

1. Under the writer lock, validate `CURRENT`, all generation hashes, local schema, archive, sequence, and any pending batch. Missing or corrupt existing state is an error, not “first run.”
2. Build a new immutable generation in a unique staging directory on the same volume. For a collection commit, it contains the complete archive, `N+1`, and the **frozen serialized batch** using that sequence, plus operational state.
3. Validate and flush every file; generate/flush a manifest containing file hashes. Atomically make the immutable generation available, then atomically replace and durably flush `CURRENT`. Use tested Windows replacement semantics, not a cross-volume copy. Readers see either complete generation.
4. Only after the commit is durable may the uploader see the batch. If any write/flush/replace fails, do not upload. Keep the prior valid generation and expose the storage error.
5. A later delivery-state commit keeps the same sequence high-water and archive; it may clear pending only under section 11's acknowledgment rules. Do not allocate another sequence just to update health or retry metadata.

Sequence is independent of wall-clock time, restarts, builds, and UI sessions. A new batch is exactly `highestReserved + 1`; gaps after recovery/import are legal, reuse is not. Stop before safe-integer exhaustion and require coordinated protocol work. Sequence 0 is allowed only in a newly provisioned local state with no batches and verified unused receiver identity. Migration always reconciles existing high-water; never assume 0 when a file is absent.

Recovery cases:

| Interruption | Required behavior |
|---|---|
| Before `CURRENT` commit | Ignore unreferenced staging generation; no batch was sent |
| After commit, before send | Resume exact pending bytes and sequence |
| During send / acknowledgment lost | Keep pending, retry same bytes; no new collection |
| After remote acceptance, before local acknowledgment commit | Same retry; remote duplicate must not regress state |
| After pending-clear commit | Next batch uses a strictly larger reserved sequence |
| Corrupt pointer/current generation or restored old backup | Block upload; recover from verified snapshot plus high-water reconciliation, never silently pick an older generation |
| Disk full, sharing violation, denied access | Preserve prior generation; report degraded storage; no truncate/in-place fallback |

Crash tests must cover every persistence boundary on Windows. Atomic visibility and power-loss durability are different: verify platform flush/replacement behavior with fault tests before claiming power-loss recovery. A backup restore cannot automatically prove the server's sequence; reconcile before enabling the producer.

## 11. Pending retry and upload protocol

At run start, recovery and pending handling precede all new collection. If pending exists, resend its original bytes/sequence/timestamps; no fresh collection, no resequencing, and no overwrite until delivery is resolved. This deliberately trades collection availability during an upload outage for a simple, compatible single-pending outbox. The UI must show that collection is blocked by pending delivery. Multiple queued batches are future work requiring an ADR.

Use local OpenSSH with a configured restricted alias, stdin-only batch, and no remote command or shell interpolation. Preserve `-T`, `BatchMode=yes`, `StrictHostKeyChecking=yes`, and `ConnectTimeout=15`; total send timeout is 60 seconds. Validate alias syntax against `^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$`. Host key enrollment and restricted key provisioning are operator setup steps; do not disable checks or copy keys. Limit serialized batch bytes to the receiver's 4 MiB cap before commit. Oversize batches block with no history truncation; a cap increase needs coordinated receiver acceptance.

Retries occur on the next hourly/logon trigger or explicit Retry, at most one automatic send attempt per invocation; no busy loop. Persist failure count, error code, next eligible retry, last transport time, and pending age. Restart does not erase retry state. An explicit manual retry can override the hourly wait, still under the lock. No batch deletion or mutation button in the UI.

**Current receiver limitation:** `receiveBatch` ignores an equal or lower sequence. Its CLI still prints “accepted” and exits 0 in that case. A successful SSH process therefore means **transport completed**, not confirmed newly accepted or published. Public manifests do not expose batch sequence. Do not infer acceptance from that text.

Runtime uses the following conservative delivery states without changing the receiver:

- `pending` / `transport_failed`: retain bytes; retry on the next permitted trigger.
- `transport_completed_unverified`: retain bytes and attempt bounded read-only observation of Moriium's configured static manifest and referenced activity JSON. Verify SHA-256 of fetched bytes, expected data hash, and matching `attemptedAt/succeededAt/result` for every source. The manifest must be fresh and the referenced URL must be the configured origin's exact `/status-data/activity/<hash>.json` path. Reject redirects across origin and invalid/unbounded responses.
- `publication_observed`: exact public data and outcome metadata match the pending candidate, showing its intended effect. Persist the evidence and clear pending in one generation commit. This confirms observed public effect, not a new sequence receipt.
- `reconciliation_required`: stale/older sequence ambiguity, a different higher published batch, conflicting receiver state, or persistent mismatched publication. Stop new collection; an operator obtains restricted receiver/publisher evidence through Moriium operations. The producer SSH key is not expanded to read server state.

After an initial send, observation may poll for up to 60 seconds with 5-second spacing. If not yet published, keep pending, end the invocation, and observe/retry on the next trigger. Configured freshness checks use the existing manifest expiry; an HTTP 200 alone is insufficient. If exact expected data/outcomes already appear (e.g. a lost acknowledgment), observation can resolve pending without changing its bytes. A public hash alone cannot prove an all-failed batch's new attempt metadata or sequence.

Operator reconciliation may clear pending only with archived evidence that this exact batch was accepted/published, or that a higher authoritative batch safely superseded it and its history/corrections have been reconciled into local state. Do not simply delete pending or renumber it. Missing public access is an operational setup blocker for automatic delivery confirmation; manual reconciliation is a supported fallback, not an automatic success claim.

When a retry is resolved, the same invocation may proceed to one new collection if sufficient deadline remains; otherwise defer to the next trigger. The production high-water and one-writer migration gates remain necessary even with public observation. Local `lastPublishedObservation` describes external evidence only; Runtime does not own publication.

## 12. Scheduler and configuration

Use Windows Task Scheduler with an installed absolute `enouia-activity.exe sync --config <absolute path>` action and an independent working directory. Baseline behavior mirrors the checked local registration script: current interactive user, hourly trigger, logon trigger delayed 15 minutes, StartWhenAvailable, IgnoreNew overlapping launches, allow battery execution, 15-minute overall execution limit. The shared lock is still authoritative; Task Scheduler's overlap setting does not protect manual launches.

No task runs under SYSTEM or a different account to gain access to personal CLI sessions. Logged-out and powered-off periods are not covered; after resume/logon, one catch-up run is enough, not replay of every missed hour. Show this constraint in settings. Task registration is an explicit migration/install operation and must not occur on ordinary UI launch or build. Default upload and automatic scheduling are disabled until cutover gates pass.

Persist an Activity pause flag in its operational state. The task can launch and exit intentionally paused; pause survives restart. Pausing affects collection **and** upload. Quit closes the UI without disabling the installed task. Tray labels distinguish `Pause conversation runtime` from `Pause activity sync`; they must not imply one controls both. Configuration changes apply between runs under the lock. Export/import only nonsecret config; secrets stay in CLI/OS stores.

Versioned Activity config includes data root, selected executable references (gh, Codex, Node, ccusage, ssh), GitHub login, Claude store/discovery settings, restricted SSH alias, public manifest origin/URL, collection budget, source freshness policy, and production/sandbox mode. Production identity is fixed. Migration maps existing `MORIIUM_*` path settings once into Runtime-owned configuration; Runtime must not keep a live fallback to Moriium directories or environment variable names. Missing config yields `unconfigured`, not an attempt against a guessed endpoint.

## 13. Windows Usage / Activity UI and health

Provide a dedicated Activity screen beside Chat, Memory, Context, and Runtime Status. Required content:

- Separate GitHub, Codex, and Claude daily charts and accessible tables, with metric and source timezone labels, date range, recorded-day count, exact totals, last attempt, and last successful collection.
- Clearly distinguish no data, explicit zero, retained historical data, failed/stale source, and an incomplete current day. Never plot a failed source as freshly collected. A combined AI daily total is not offered.
- Show schedule enabled/paused/logged-out limitation, next trigger if known, last run, pending sequence/age, last transport result, publication observation status/hash, and blocking reason.
- Manual `Run now`, `Retry pending`, and `Pause/Resume activity sync` use the runner and its lock. Read-only preview of the allowlisted payload and export of sanitized diagnostic summary are available. Ordinary users cannot edit sequence, delete pending, or reset the archive here.
- Tool capability state and local configuration editing stay local; no raw reports or credential display. Keyboard navigation and narrow-window layout are acceptance requirements, not optional polish.

Typed IPC operations: `activity_get_overview`, `activity_get_days(source, range)`, `activity_preview_public_payload`, `activity_run_now`, `activity_retry_pending`, `activity_set_paused`, `activity_get_run(runId)`. Mutation commands return a run ID immediately; progress is delivered as sanitized DTOs. Errors are structured codes (e.g. `busy`, `unconfigured`, `unsupported_method`, `source_invalid`, `clock_regression`, `storage_failed`, `delivery_unverified`) rather than raw subprocess strings. Add a schema version to local IPC responses. Frontend never receives executable invocations or secrets to run itself.

Runtime health composes independent components: Core, Vault, MemoryIndex, Provider, Session, ActivityCollector per source, ActivityArchive, ActivityScheduler, ActivityDelivery; later Bridge/Replica. Use `Healthy|Degraded|Unavailable|Recovering` plus a separate operational mode (`unconfigured|idle|running|paused`). Source age is a field, not merely a status color. Default activity stale threshold is 3 hours, matching the checked Moriium baseline; freeze it in compatibility tests and surface settings changes locally without claiming to change Moriium policy.

An Activity fault makes the summary degraded while preserving healthy Core components. Collection success, transport completion, and publication observation remain different fields. Local health refresh does not advance any source's `updatedAt`. The existing VPS `runtime.json` is a separate Runtime-presence protocol (checked baseline TTL: 3 minutes); this phase does not create or upload it. A UI being open or an activity batch arriving must not fabricate a Runtime heartbeat. Enabling that external heartbeat later requires an independent lifecycle/transport decision.

## 14. Security, privacy, and recovery obligations

No telemetry, raw activity report retention, credential migration, or Memory upload by default. CLI reports exist transiently for normalization. Error output can contain secrets: retain only allowlisted error categories/counts/durations. Fixture capture must be synthetic or reviewed and stripped of usernames, paths, session content, and credentials before commit. Daily aggregates are permitted public data but still require the configured activity delivery boundary.

Use user-only Windows filesystem permissions for local state; POSIX mode flags alone do not establish Windows ACLs. Protect against path traversal, reparse escapes, malicious filenames, partial writes, replay, imported source injection, and accidental cross-domain write permissions. Activity inputs are data, never prompts or shell instructions. Encryption at rest remains a deferred ADR; ordinary local files are not claimed to be encrypted. Backup/restore covers both domains independently and preserves provenance and sequence constraints.

Future Memory threat work from v0.2 remains: unauthorized MCP calls, token leaks, malicious memory writes/candidate poisoning, source prompt injection, provider exfiltration, and server log leakage. Future MCP writes must be authenticated, source-aware, audited, and candidate-gated. No anonymous `memory_update` endpoint.

## 15. Verification, cutover, and rollback gates

Full procedures and evidence templates are in the [migration runbook](docs/ACTIVITY_MIGRATION_v0.3.md). Required gates are:

1. Freeze compatible schemas and synthetic fixtures against the inspected Moriium source; capture intentional differences explicitly.
2. Test adapters and merge deterministically on the same reports/clock/seed as the old implementation; compare every source/date/value and outcome timestamp, not just totals.
3. Crash/lock/retry tests prove consistent generations, no lost pending batch, and no sequence reuse. Activity survives Memory index deletion and UI shutdown.
4. Use separate work roots and an isolated receiver/publisher for end-to-end comparison. Test partial failures, empty/malformed reports, zero growth, corrected values, rolling windows, method absence, network loss, duplicate/old sequences, lost history, timestamp regression, and public hash/times.
5. Inventory production state, freeze old writer, capture the **final** complete archive/sequence/pending, reconcile receiver/publisher high-water, and import. Preserve the old rollback bundle. Resolve old pending by its original sequence before allowing any new batch.
6. Execute one explicit real Runtime cycle; verify collection, transport, publication, and zh/ja/en About pages separately, including no-JS and stopped author Node behavior. Only then enable the new scheduled task and observe at least one scheduled run.
7. Keep the old automatic entry point disabled but recoverable until the observation gate passes. Removal is a later Moriium change, not part of this design or initial implementation.

Rollback is a **writer handback with current state**, not restoration of an old sequence. Stop/quiesce Runtime, export the latest compatible archive/high-water/pending trio, reconcile pending/remote state, seed the old isolated work directory, then enable only the old task. Retain all snapshots and receipts. Do not revert Moriium's public contract or author database. If a safe high-water cannot be established, keep both writers stopped and preserve the last static public data.

## 16. Milestone model and future roadmap

M0 freezes shared contracts and scaffolds the repository. Then A1–A3 (Core) and B1–B4 (Activity) are parallel work tracks; neither domain implementation waits for the other's feature completion. Shared IPC/health contracts and the final Windows shell integration are explicit join points. B5 is cutover, not a coding task. See the [milestone table](docs/IMPLEMENTATION_PLAN_v0.3.md) for task-level dependencies and acceptance.

Retain the longer-term v0.2 route after this phase: product 0.2 conversational ChatGPT import into immutable raw sources and reviewed candidates; product 0.3 real provider adapters with the same identity/context foundation; product 0.4 authenticated local MCP/tunnel tools (`context_get`, `memory_search`, `memory_read`, `memory_propose`, `memory_update`, `session_checkpoint`); product 0.5 replaceable HTTPS VPS bridge with auth/rate limiting/minimal logs; product 0.6 disposable warm replica of an explicit allowed context subset. MCP provides semantic continuity, not transparent capture of all conversation tokens. Exports remain bootstrap/backup/repair inputs.

2026-10-04 follow-up (ADR-025): Enouia Memory's MV-7 to MV-10 (real Provider, Memory Host and MCP, gateway, replicas) replace the Memory items of product 0.3–0.6 above, and conversational import also belongs to Memory. Runtime receives these through pin bumps or, after MV-8, a Host client. Track A is replaced by Memory's MV stages plus Runtime integration slices; J1 stays the join point.

The future bridge must not own canonical Memory or Context Compiler rules. Delete-the-VPS Test means recreating the bridge does not lose canonical Memory; similarly, loss of Moriium delivery availability must not destroy the Activity archive. A warm replica cannot become the only copy of identity, preferences, project state, or checkpoints. These future milestones do not extend this phase's server ownership.

## 17. Completion definition for this design

Implementation may begin from the companion first-task brief, with documented defaults and blocked operations identified. No further interpretation is needed to decide who owns data, what can be sent, how history merges, how pending/sequence survive a crash, or where parallel work joins. Environment facts listed as unresolved in the plan must be established at their gates; they are not permission to invent paths, credentials, server state, or deployment success.
