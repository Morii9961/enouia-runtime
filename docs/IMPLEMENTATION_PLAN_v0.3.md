# Enouia Runtime v0.3 — implementation plan

Date: 2026-10-01. Status: M0.1 and Activity B1-B3 implementation are present and locally verified. B4 remains partial; B5 production activation and Core A1-A3/J1 remain pending. The [C01-C18 evidence index](validation/B4-coverage.md) links seven historical machine reports, records both unresolved GitHub comparisons, and names the remaining acceptance gates. It does not sign off any matrix row or activate production.

Activity currently includes strict three-source adapters, generation storage/recovery, persisted pause and exact-pending retries, migration inspection/import/export, restricted transport with public observation, and scheduler packaging. Development evidence covers frozen comparison, isolated legacy handback, pinned native ccusage on synthetic stores, store/publisher process death, and ready tool-tree cleanup after release-runner death. Live inventory/authentication, deployment, scheduler triggers/battery/resume, full storage durability and UI acceptance still require evidence. Individual B1-B3 validation reports remain under docs/validation.

Authority: [Architecture v0.3](../Enouia_Runtime_Architecture_v0.3.md). Procedure: [Activity migration runbook](ACTIVITY_MIGRATION_v0.3.md). Decisions: [ADR register](adr/README.md). Read the original handoff as evidence, but use v0.3 for current ownership and design. Architecture v0.3 is not the future product 0.3 provider milestone.

## 1. Delivery structure

The phase is complete when the Windows Core vertical slice and Activity producer both pass their gates. Production cutover is separate from implementation completion. Track A may ship its local demo while Track B remains in isolated validation; Activity can be tested headlessly before the Core demo exists.

```text
M0 shared scaffold/contracts
  +--> A1 Memory/Session --> A2 Context/Mock --> A3 Windows Core UI ---+
  |                                                               +--> J1 integrated shell
  +--> B1 adapters/merge --> B2 store/outbox --> B3 delivery ----------+--> B4 isolated acceptance
                                                                           |
                                                                     B5 cutover/observation
```

B2 may start after B1's pure contracts/fixtures are stable while remaining adapters are implemented. B3 consumes the fake ports before real tooling is available. “Parallel tracks” describes independently schedulable work and module ownership; it does not authorize starting agents, tasks, uploads, or background processes in this documentation pass.

## 2. Final milestone plan

| Milestone | Work and ownership | Dependencies | Exit evidence |
|---|---|---|---|
| M0 — repository and contracts | Git baseline, Rust workspace foundations, contract schemas, synthetic fixtures, shared health/clock/error ports, documented commands | Current design | Offline contract tests, source/hash manifest, dependency-boundary check; no production reads/writes |
| A1 — durable Memory and Session | Canonical JSON, Markdown Identity, provenance/candidates/supersession, file sessions/checkpoints, rebuildable SQLite/FTS | M0 | Round trips, recovery/index rebuild, retained history, candidate isolation |
| A2 — local continuity | Retrieval/ranking/budget, actual Context Capsule, deterministic Mock Provider, orchestrated turns/checkpoint | A1 | MoriMeta demo as automated integration test, exact included/excluded memory IDs, restart equivalence |
| A3 — Windows Core surface | Tauri shell, chat, Memory/Context inspectors, tray/hotkey/overlay, Core settings/health | A2 + M0 IPC contracts | Windows startup and interaction checks, no frontend persistence/network shortcuts |
| B1 — collectors and history | Three adapters, strict source validators, Cowork discovery, capability probes, pure merge/deltas | M0 | Same-input legacy comparisons; known intentional differences; all source failure fixtures |
| B2 — durable Activity state | Generation store, Windows lock/atomic commits, high-water sequence, immutable pending, pause/retry state, migration import/export | M0; B1 model/merge | Windows crash-boundary matrix, concurrent-run exclusion, import/export reversibility |
| B3 — runner and delivery | Headless executable, bounded subprocesses, restricted SSH, static observation, scheduler tools/config diagnostics | B1 + B2 | Fake transport then isolated receiver acceptance, installed execution independent of repos/UI |
| J1 — integrated UI and health | Activity screen, typed operations, async progress, component isolation | A3 + B3 | Closed-UI scheduled execution; Activity fault leaves Core usable; freshness shown accurately |
| B4 — comparison and migration rehearsal | Frozen reports, independent work roots, old/new receiver/publisher comparison, rollback rehearsal | B3; J1 for UI acceptance | Signed-off test matrix and rehearsal bundle; no live writer conflict |
| B5 — production cutover and observation | Final inventory/freeze/import, real cycle/public verification, task enable, at least one scheduled run | B4 + all operational gates | Distinct evidence for collection, upload, publication, three-language rendering, schedule, rollback readiness |

Do not collapse B4 into “unit tests pass,” B5 into “code merged,” or J1 into “screen renders.” A release report names which milestone is complete and which external gates remain open.

## 3. Track A — Runtime Core work packages

### A1.1 Models and provenance

Progress: the [Memory/source/candidate model portion](MEMORY_MODELS_v1.md) is implemented with synthetic schemas and lifecycle tests. Session events/turn-range resolution, IPC and Context budget contracts remain open; this does not complete A1.1 or start Vault persistence.

Owner paths: `crates/enouia-memory`, `crates/enouia-session`, `contracts/{memory,ipc}`, `tests/fixtures/memory`.

Freeze schema v1 for all five memory kinds, source registry records, candidates, conversation events, and checkpoints. Use one JSON record per memory and Markdown Identity. Define ID generation, timestamp/status invariants, validation errors, explicit manual-commit vs inferred-candidate entry points, and reversible supersession. Complete schema details before writing migrations; do not store required fields solely in SQLite.

Acceptance/tests: all kinds round-trip without lossy fields; a source ID resolves; invalid dates/statuses/IDs fail; supersession preserves older content and rejects cycles; rejected or unapproved candidates are excluded from retrieval; a conversation can have multiple checkpoints linked to covered turns.

### A1.2 Vault, index, sessions, and recovery

Owner paths: Memory/Session persistence and `enouia-common` atomic-file utility, with shared changes reviewed at M0 boundaries.

Implement versioned paths, atomic writes, update/rebuild of SQLite FTS and metadata indexes, durable conversations/checkpoints, and a backup/export inventory. Indexing must be cancellable and not block the UI. Invalid config must produce recoverable diagnostics without erasing old files.

Acceptance/tests: commit file then fail index update, restart/rebuild and recover; remove/corrupt SQLite and recover the same active records; interrupted write never leaves partial canonical JSON; prevent path traversal/reparse escape; disk-full failures preserve prior data. Prove Activity's directory and sequence remain unchanged during all Memory repairs.

### A2.1 Context and Provider ports

Owner paths: `enouia-context`, `enouia-provider`, `contracts/{context,provider}`.

Implement FTS/metadata retrieval, stable ranking, deterministic budget truncation and reasons for exclusion, actual capsule inspection, and Mock Provider. Freeze the initial conservative token-estimation rule and overflow behavior in A1/M0 schema follow-up; do not add a real provider or embedding dependency. Each provider invocation consumes the recorded capsule rather than assembling hidden context.

Acceptance/tests: exact expected IDs for synthetic MoriMeta/Moriium/project fixtures; excluded inactive/unrelated records remain excluded; over-budget capsule truncates deterministically; no arbitrary raw archive content or Activity data appears in a capsule; Mock makes no network calls; same session survives restart.

### A2.2 Orchestration

Implement typed Core commands for manual memory create/read/propose/review, chat turn, context inspection, checkpoint, and health. A turn cancellation must not manufacture a completed response/checkpoint. Record actual response and source references before reporting a durable successful turn.

Acceptance: automated MoriMeta demo from Architecture section 6, before and after index rebuild. Report context compilation performance against a named fixture corpus; target under 300 ms for normal local requests, without UI-thread blocking.

### A3 Windows shell

Owner paths: `apps/windows` except `features/activity`, which Track B integrates at J1 through the agreed facade.

Build conversation, Memory Inspector, Context Inspector, tray, configurable hotkey, minimal overlay, config and health views. React gets typed DTOs only. `src-tauri` adapts commands and launches the worker; domain decisions stay in crates. Pin toolchains/dependency versions when scaffolding the actual app and record supported Windows environment in the build instructions.

Acceptance: manual ProjectState creation and retrieval, actual capsule view, restart continuity, tray/open/quit/hotkey conflict behavior, keyboard use, no direct frontend file/SQLite/CLI calls. Clearly distinguish closing the UI from pausing Activity.

## 4. Track B — Activity & Usage work packages

### B1.1 Pure contract and merge

Owner paths: `enouia-activity-contract`, `enouia-activity/merge`, `contracts/activity`, `tests/fixtures/activity`.

Implement both validators, public allowlist reconstruction, sorted days and compatible data-byte serializer, checked arithmetic, and per-source success/failure merge. Unit input is `previous + three SourceAttempt values + fixed clock`; output is complete ActivityData plus local deltas. No filesystem/CLI/network code in this package.

Acceptance: complete source map; exact units/zones; impossible/duplicate dates rejected; safe-integer boundaries; private sentinel fields stripped at every nested public level; preserved history through moving windows; upward/downward corrections replace; zero growth succeeds; failed sources retain old timestamps; clock rollback blocks rather than evicts days. Public serialization hash matches normalized Moriium output for identical data.

### B1.2 Tool adapters

Implement GitHub calendar acquisition, Codex app-server handshake/capability and lifetime reconciliation, pinned ccusage normalization, normal/local Cowork store discovery and aggregation. Explicit process runner/clock interfaces allow recorded fixtures and fake executables. Subprocess stdout/stderr stays private and transient. No source adapter touches delivery state.

Acceptance: missing/unsupported executable affects one source; Codex `-32600` retains old data; absent/invalid lifetime fails as a documented stricter rule; incomplete Claude store fails that source; absent optional root does not fail; duplicate default/Cowork path counted once; cache/reasoning arithmetic matches; source-specific bounds and output limits are tested. A real local capability check is recorded separately from deterministic tests and needs no authentication-file copying.

### B2.1 Store and transaction state machine

Implement generation store, consistent readers, exclusive Windows writer lock, durable `CURRENT`, sequence allocation and immutable pending, local receipt/failure/pause state. No independent mutable root-level copies. No auto-GC during migration.

Acceptance: fault injection before/after each flush/replace/send/receipt; all observed states are a valid old or new generation; an already committed sequence is never reused; all retries use identical bytes; two OS processes/UI+task cannot collect or reserve simultaneously; sharing violation/disk-full does not truncate; corruption and unknown restored high-water block delivery. Test generation export/import including pending bytes and skipped sequence values.

### B2.2 Import/export and backups

Implement an offline migration inspector and state converter. Inputs are user-selected files copied into an isolated migration area, never live linked Moriium paths. Generate per-source date/value/time/hash comparison and conflicts; require a recorded reconciliation choice for conflicting archives. Produce a legacy-compatible output trio for rollback.

Acceptance: current archive + sequence + pending are imported consistently; pending sequence cannot exceed imported high-water after normalization; unrelated newer archive is not silently substituted into pending; existing Runtime state cannot be reset with bootstrap; export retains current sequence, all dates, source times, and exact pending bytes. Restore requires remote high-water gate before upload. No credentials in backup.

### B3.1 Runner, uploader, and observer

Implement commands:

```text
enouia-activity diagnostics --config PATH
enouia-activity sync --config PATH
enouia-activity retry-pending --config PATH
enouia-activity set-paused true|false --config PATH
enouia-activity migration-inspect --input PATH --output PATH
enouia-activity migration-import --bundle PATH --config PATH
enouia-activity migration-export-legacy --config PATH --output PATH
```

No command defaults to a Moriium work directory or uploads during inspect/import/export. Read-only diagnostics redacts paths in exportable summaries; full local configuration is restricted to local settings. Define stable exit categories: `0` completed/no-op; `2` completed with source failures; `3` busy/paused/not-due (intentional no-op, distinguished by JSON result); `4` delivery unresolved; `5` invalid config/capability prerequisite; `6` storage/clock/migration integrity failure. Run summaries include explicit state so task-history numeric codes are not the sole diagnostic surface.

Uploader uses stdin-only restricted SSH and exact frozen bytes. Observer validates same-origin static manifest and activity hashes/outcome times. An exit-0 old-sequence no-op must never cause a “published” claim or automatic pending deletion. Enforce the single-pending head-of-line behavior and persistent retry eligibility.

Acceptance: timeout/disconnect before receipt and after receiver acceptance, duplicate same sequence, higher remote state conflict, stale HTTP 200, mismatched hash/outcomes, and publisher rejection all retain or resolve pending correctly. Configured one-shot runner executes with UI closed and Moriium repo absent. No runtime npm install, author DB, or API dependency.

### B3.2 Scheduler packaging

Create install/uninstall/query scripts using installed binary/config paths, interactive user, hourly/logon triggers, bounded execution, IgnoreNew, catch-up, and hidden execution. Setup resolves Node, gh, Codex, ssh and Runtime-owned ccusage; records versions without copying login files. Runtime launch must not auto-register a task.

Acceptance: sandbox task uses only sandbox config/endpoint; production task initially disabled; manual and scheduled overlap is locked; no machine-wide environment changes; pause persists; battery/resume behavior and login limitation are visible; task uninstall preserves all Activity data. Production registration occurs only at B5.

### J1 Activity UI and health

Owner paths: `apps/windows/src/features/activity`, Activity read facade/IPC and health adapters. Track A owns global navigation/lifecycle; Track B owns source meaning, DTO content, and Activity operations. Agree on the route and DTOs at M0, avoid shared-file ownership ambiguity.

Acceptance: three source calendars/tables and separate time boundaries; totals/recorded days/last success/last attempt; failure and stale retention; schedule/pending/transport/publication indicators; safe manual actions and payload preview. No raw paths/titles/tokens in exported diagnostics, no sequence reset UI. Kill UI during a headless run and verify state; degrade Activity while performing the Track A demo. Test pending wait does not block the UI thread.

## 5. Interfaces and integration ownership

Future Activity extension (recorded after the v0.3 baseline): [ADR-019](adr/019-claude-design-usage.md) and the [Claude Design integration note](CLAUDE_DESIGN_USAGE.md) target official `claude_design` product tokens in the existing Claude daily series. This is outside B1's three-source compatibility acceptance. It needs separate component history, UTC-hour to Shanghai-day aggregation, controlled overlap checks, old-archive reconciliation, and a coordinated Moriium label change before any public value changes. Do not treat this note as a fourth-source schema change or a reason to block the baseline B1/B4 work.

| Interface | Producer / consumer | Freeze and change rule |
|---|---|---|
| ActivityData/batch v1 | Runtime / Moriium | Existing public authority; change requires joint protocol acceptance |
| Collector / SourceAttempt | Adapters / Activity sync | M0 fixtures; B1 can add local error variants without wire changes |
| ActivityStore generation format v1 | B2 / runner+read facade | Versioned local format, backup+migration required for changes |
| Clock / ProcessRunner / AtomicFile / lock | Common / both tracks | M0 types; platform implementation in storage packages; never leak raw errors |
| HealthComponent DTO | Both domains / Core+UI | Status and operational mode separate; observed times explicit |
| Activity IPC v1 | Backend / React | M0 schema; additive optional fields allowed, incompatible changes versioned |
| Core/Memory/Context/Provider schemas | Track A crates / inspectors | A1 freezes full schemas before persistence; preserve provenance |
| Legacy migration bundle | B2 / old Moriium producer | Validated exact trio plus private manifest; no live link or secrets |

Cross-track changes to common DTOs or top-level workspace files require updating their fixtures in the same change. No Activity library dependency on Memory or Core is permitted. UI and integration code may compose both. A standalone Activity test/build must not require a Vault, an author DB, a web build, or a real inference provider.

## 6. Test and evidence policy

Tests are milestone-specific; do not rely on unverified “should work” claims. Proposed commands become real repository scripts at their owning milestone:

- M0: `cargo fmt --all -- --check`, `cargo test --workspace`, `cargo clippy --workspace --all-targets -- -D warnings`, plus a documented dependency-boundary check.
- A3/J1: frontend typecheck and relevant component/IPC tests, Windows build, focused interactive smoke test. Pin the exact commands in README when the shell is introduced.
- B1: deterministic fixture/merge/privacy/serialization suites.
- B2: Windows process concurrency and crash-recovery suite, including fault-injected filesystem outcomes.
- B3/B4: isolated receiver/publisher contract suite and same-input old/new report; no default test reaches production.
- B5: operational evidence from the migration checklist, never replaced by CI output.

Use the runbook's C01–C18 matrix as the B4 checklist. Store sanitized evidence in `docs/validation/<milestone>/`; private migration data stays outside Git. Each report records versions/commit hashes, clock/fixtures, work roots (redacted in public reports), pass/fail, intentional differences, and remaining blockers. Assertions compare dates/values/timestamps per source; matching aggregate totals alone is inadequate.

## 7. ADRs and unresolved decisions

Phase design decisions are settled in the [ADR register](adr/README.md), including independent Activity domain, local-only ownership, one-shot Windows execution, contract/merge, transactional outbox, existing SSH transport, and two-track delivery. The following are **remaining environment facts or bounded later decisions**, not open invitations to redesign these boundaries:

| ID | Unresolved item | Owner / deadline | Safe default and blocked operation |
|---|---|---|---|
| O1 | Actual old scheduled tasks, work root, latest complete archive, pending and local high-water | Migration operator, before B4 rehearsal/B5 final freeze | Read-only inventory; block production import/cutover until established |
| O2 | Live receiver/publisher deployment, max accepted/published sequence, restricted SSH alias/key/host key, static origin and manifest URL | Moriium operator, before B3 live diagnostics/B5 | Isolated fake endpoint; no guessed credentials, no production send |
| O3 | Chosen installed Codex executable/method capability, Node/gh/ssh paths and runtime-owned ccusage install location, login identity, local Claude store inventory | Runtime installer/operator, before B3 local acceptance | Fixture adapters; unsupported source degraded; no auth copying |
| O4 | Conflicting seed archive values/times, preexisting pending ambiguity, remote high-water mismatch | Migration operator with Moriium evidence, before B5 | Preserve originals; stop both writers rather than merge by `max` or reset sequence |
| O5 | Exact Rust/Node/frontend versions and Windows atomic replacement/flush implementation | Sol, M0 for tooling; B2 for persistence | Pin supported versions based on primary docs/local capability and prove Windows semantics; block durability claims until tested |
| O6 | Delivery confirmation when public endpoint is inaccessible or an old sequence is indistinguishable | Moriium + Runtime operator, before automatic cutover | Keep pending and require manual evidence; protocol redesign is outside phase |
| O7 | Archive-generation pruning policy, backup destination/frequency, encryption at rest | User/maintainer, after B4 and before retention feature | Retain generations; user-only ACLs; no encryption claim, no credential backup |
| O8 | Future daemon, Runtime heartbeat transport, MCP auth/topology, warm replica selection/conflict policy | Future phase owner | Deferred; not prerequisites for this local producer and Core slice |

O1–O4/O6 may block production activation but do not block offline implementation. Sol resolves O5 as routine implementation work with evidence, rather than asking for approval of every library choice. Any proposed change to settled domain ownership or the public protocol requires a new ADR and coordinated review.

## 8. Exact first implementation task for Sol

**Task M0.1: Bootstrap the offline Rust workspace and freeze Activity v1 contracts.** This is the first coding task, not “implement the whole Runtime.”

Use this brief verbatim when implementation is authorized:

```text
Work in the Enouia Runtime workspace. Read Architecture v0.3, IMPLEMENTATION_PLAN_v0.3,
ACTIVITY_MIGRATION_v0.3, the ADR register, and the handoff completely.
Follow applicable repository instructions discovered at implementation time.

Implement only M0.1:
1. Inspect the current directory and preserve all existing documents. If it is
   still not a Git repository, initialize a local repository without creating a
   remote, pushing, or making an automatic production configuration.
2. Add Cargo workspace/toolchain metadata and only enouia-common plus
   enouia-activity-contract crates. Add ignore rules for build products,
   runtime data, private migration files, and secrets. Do not ignore design docs.
3. Define shared Clock and HealthComponent/error DTO interfaces, using fake clock
   support in tests. Do not implement filesystem storage or subprocess execution.
4. Add machine-readable ActivityData v1 and batch v1 contract schemas, typed Rust
   models, validation, allowlisted normalization, and deterministic public-data
   serialization. Enforce source literals, real/unique dates, safe integers,
   sequence/time/outcome relations, and derived succeededAt.
5. Add synthetic fixtures for null sources, explicit zero days, all-success,
   failed retained source, invalid/duplicate/leap dates, unsafe integers,
   timestamp/sequence errors, and private sentinel stripping. Include a public
   data-byte/hash fixture matching the existing Moriium normalizer.
6. Read the referenced local Moriium protocol files if available, record HEAD,
   working-file SHA-256s and deviations, and capture only sanitized expected
   outputs. Do not import or link that checkout into the build. If absent, use
   this specification and mark cross-repo compatibility unverified, not passed.
7. Document and run cargo fmt --all -- --check, cargo test --workspace, and
   cargo clippy --workspace --all-targets -- -D warnings. Check that production
   source paths/manifests contain no Moriium imports or runtime data dependencies.
   Document the crate dependency graph and next A1/B1 task boundaries.
8. Stop and report files changed, contract test evidence, intentional differences,
   blocked evidence if any, and proposed next A1/B1 tasks.

Do not create the Tauri UI, collectors, scheduler, uploader, persistence store,
real provider, daemon, MCP service, or production migration. Do not read/copy
credentials, import personal archives, register a task, upload, or modify Moriium.
```

M0.1 acceptance is an offline, independently buildable contract foundation. The contract crate must compile/test with no reference to the Moriium checkout. Metadata schemas alone do not prove real-date, cross-field, or privacy validation: tests must exercise the Rust implementation. If toolchain installation or network access is unavailable, preserve the scaffold and report that validation is blocked; do not claim checks passed. Do not expand this task to solve operational O1–O4 through live migration.

After M0.1 review, finish the remaining M0 shared IPC/Track A schema agreements, then start A1 and B1 independently. Large-scale implementation ends at explicit milestone boundaries for review; production cutover remains a separate operational action.
