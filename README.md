# Enouia Runtime

The current baseline is **architecture v0.3**. M0 provides an offline Rust workspace, Activity v1 contracts, and [shared IPC/Track A boundary agreements](docs/CONTRACT_BOUNDARIES_M0.md). The B1.1 pure merge, B1.2 GitHub adapter, Codex usage-result normalizer, Codex app-server session protocol, Claude daily-report collector/normalizer, Cowork store discovery, Windows process adapters, and same-input legacy comparison are implemented. B2 has a Windows single-writer lock, generation validation, a pinned disk reader, a same-volume generation commit path, a published-generation recovery audit, a locked run-start decision, a persisted pause flag, exact-pending-bound retry records, a read-only delivery overview, and legacy trio inspection, archive comparison, export, and paused offline import primitives. B3 has restricted SSH transport with automatic retry eligibility and manual wait override, pure public-content matching, origin-bound observation, a bounded curl-based public HTTP adapter, and an observation-gated pending-clear commit. The one-shot executable now composes these modules with explicit configuration and diagnostic/migration/pause commands. Explicit B3.2 packaging now supplies independent installed management tools and disabled sandbox task registration, with real synthetic scheduler execution checks. Full UI integration/acceptance, power-loss durability evidence, live tool acceptance, and production cutover remain pending.

The [Quiet Runtime desktop surface](docs/FRONTEND_IMPLEMENTATION_v1.md) implements the Claude Design seven-page frontend in `apps/desktop`, with a separate Tauri Windows shell. Inside the native shell, Memory, Context, Sessions and the Vault status on Home and Settings use Enouia Memory's pinned workspace Core ([ADR-025](docs/adr/025-enouia-memory-integration.md), [Memory integration v1](docs/MEMORY_INTEGRATION_v1.md)). Browser previews and the Runtime Inspector stay explicitly fictional. The native Activity surface reads the separately installed producer through its runner ([ADR-028](docs/adr/028-activity-surface.md)). The [companion shell](docs/adr/026-companion-shell.md) provides one tray, close-to-tray, scoped Quick Search and opt-in login startup; explicit Exit releases the Vault. Runtime additionally reserves Vault directory identities ([root admission evidence](docs/validation/Root-admission-v1.md)). The unsigned [current-user installer](docs/adr/027-desktop-installer.md) (`npm run desktop:bundle`) owns application files only. Signing, remaining native acceptance, full J1 acceptance and production activation remain pending. See [Activity integration evidence](docs/validation/Activity-desktop-integration-2026-10-08.md). [Frontend validation](docs/validation/Frontend-surface-v1.md) records the demo baseline; the [Memory integration report](docs/validation/Memory-integration-v1.md) and its linked follow-ups preserve evidence for each native release.

The [2026-10-08 combined Activity validation](docs/validation/Activity-unified-2026-10-08.md) integrates the remaining Claude work (migration preflight, publisher regression checks, Claude history retention/discovery and explicit production packaging) with the current native desktop shell. It also closes two reproduced validation gaps. B4 compatibility acceptance and B5 deployment/activation remain open; merging implementation is not production cutover.

Read in this order:

1. [Architecture v0.3](Enouia_Runtime_Architecture_v0.3.md) — domain ownership, repository/data layout, contracts, durability, UI, health, and future scope.
2. [Implementation plan](docs/IMPLEMENTATION_PLAN_v0.3.md) — parallel Track A / Track B, acceptance tests, unresolved gates, and the exact M0.1 task for Sol.
3. [Activity migration runbook](docs/ACTIVITY_MIGRATION_v0.3.md) — comparison matrix, seed/high-water reconciliation, cutover, and rollback.
4. [ADR register](docs/adr/README.md) — adopted decisions and deferred work.
5. [ADR-025](docs/adr/025-enouia-memory-integration.md) — Enouia Memory owns the Memory domain; Runtime hosts its local client.
6. [Memory integration v1](docs/MEMORY_INTEGRATION_v1.md) — pinned revision, adapter, desktop surfaces, build checks and pin bumps.
7. [ADR-026](docs/adr/026-companion-shell.md) — tray, quick search, login startup and the four stops.
8. [ADR-027](docs/adr/027-desktop-installer.md) — current-user installer, ownership rules and session-end shutdown.

[Design validation evidence](docs/DESIGN_VALIDATION_v0.3.md) records preserved-input hashes, protocol-source hashes, checks performed, and the limits of this design pass.

Historical inputs are preserved locally. The public [architecture v0.2](Enouia_Runtime_Architecture_v0.2.md) is unchanged; the public [Moriium activity handoff](handoff-2026-09-26-activity-to-enouia-runtime.md) and affected validation notes have personal figures and machine paths redacted. Their embedded startup instructions are not the current task authorization; v0.3 and an explicit implementation request govern the next work.

Enouia initially takes only the Windows activity producer. Moriium retains About presentation, public ActivityData validation, VPS receiver/publisher, and static JSON. Runtime must work without the Moriium repository, build process, author database, or copied credentials. Activity data is never Memory/Context data by default.

## Rust workspace

```text
enouia-common                  Clock + FakeClock, process/file/lock ports, health/error DTOs
        ↑
enouia-activity-contract       ActivityData v1 + batch v1 normalization and serialization
        ↑
enouia-activity                B1.1 merge + B1.2 GitHub, Codex, and Claude adapters/normalizers
enouia-windows-process         Windows process adapters and Cowork store discovery
enouia-activity-store          B2 Windows lock + generation validator/reader/writer/recovery/run-start/migration primitives
enouia-activity-delivery       B3 locked pending transport + origin-bound observation port
enouia-activity-runner         B3 one-shot executable, explicit config, orchestration and CLI
```

The root workspace also contains the Runtime-local Core crates `enouia-memory`, `enouia-session`, `enouia-core-contract`, `enouia-context` and `enouia-provider`. They keep building and testing but are frozen history for the Memory domain (ADR-025). The desktop shell in `apps/desktop/src-tauri` is a separate Cargo workspace with its own lockfile. It embeds Enouia Memory's `enouia-memory-workspace` at the revision recorded in [docs/integration/memory-pin.json](docs/integration/memory-pin.json). The root domain workspace does not depend on Memory.

`enouia-common` depends only on Serde. `enouia-activity-contract` depends on common, Serde, and serde_json. Neither crate imports Moriium, Memory, Context, filesystem storage, a subprocess runner, or a network client. The two [JSON Schemas](contracts/activity/) describe normalized wire objects; the Rust validator also enforces real/unique dates, safe sums, time relations, and privacy allowlists. The [fixture](tests/fixtures/activity/moriium-oracle-input.json) is synthetic. Its expected public bytes and SHA-256 were generated by the checked Moriium normalizer once during development and are committed as independent test expectations. Regular builds/tests do not use that checkout.

Toolchain pin: Rust/Cargo **1.98.1**, Windows `x86_64-pc-windows-gnu`, edition 2024. Direct dependencies include `serde = 1.0.229`, `serde_json = 1.0.151`, and Windows-only `windows-sys = 0.61.2`; exact resolved transitive versions are in [Cargo.lock](Cargo.lock). A local crate cache allows the checks to run without network access.

From the workspace root, with the pinned Rust toolchain installed:

```powershell
$env:CARGO_NET_OFFLINE = 'true'
cargo fmt --all -- --check
cargo test --workspace
cargo clippy --workspace --all-targets -- -D warnings
```

On the restricted development host, rustup's attempt to check the pinned channel cannot write its cache. Its installed `stable-x86_64-pc-windows-gnu` toolchain is Rust 1.98.1, so the recorded checks set `$env:RUSTUP_TOOLCHAIN = 'stable-x86_64-pc-windows-gnu'` and call the installed Cargo binary directly. This changes only toolchain selection for the command, not the project pin.

The public file serializer emits compact UTF-8 JSON plus one LF in the v1 field order. It returns SHA-256 over those exact bytes. Batch normalization derives `succeededAt` from each source snapshot; `validate_publishable_batch` separately checks the stricter public-manifest timestamp rule. An imported pending object with unknown fields is rejected rather than silently changed. The activity parser accepts date-only and ISO timestamps with explicit offsets; non-ISO strings accepted by JavaScript `Date.parse` are not currently accepted. A migration seed with such a timestamp requires explicit compatibility review and is not silently restamped.

[M0.1 validation report](docs/validation/M0.1.md) records the Moriium source hashes, fixture provenance, executed checks, and known limits. [M0 validation](docs/validation/M0.md), [IPC schemas](contracts/ipc/activity-v1.schema.json), and the [boundary agreement](docs/CONTRACT_BOUNDARIES_M0.md) establish the local UI handoff. A1 starts with full Memory/Session schemas and provenance; B1 starts with pure merge and collector adapters against synthetic attempts. These remain separate later milestones.

[B1.1 validation](docs/validation/B1.1.md) covers the pure merge over the committed attempt fixture: date-keyed replacement, history retention, zero values, per-source failure, acquisition bounds, safe totals, and clock regression. The [GitHub adapter validation](docs/validation/B1.2-GitHub.md) covers a bounded authenticated-CLI request, strict calendar normalization, and a separate local CLI capability check. [Codex normalization validation](docs/validation/B1.2-Codex-normalization.md) covers complete daily-bucket and lifetime reconciliation; [Codex session validation](docs/validation/B1.2-Codex-session.md) covers the app-server handshake over a bounded JSON-lines port; [Claude normalization validation](docs/validation/B1.2-Claude-normalization.md), [Claude collection validation](docs/validation/B1.2-Claude-collection.md), and [Cowork discovery validation](docs/validation/B1.2-Cowork-discovery.md) cover token arithmetic, per-store CLI requests, and bounded inventory; [Windows session validation](docs/validation/B1.2-Windows-session.md) and [Windows runner validation](docs/validation/B1.2-Windows-runner.md) cover real synthetic child processes and job-owned lifetimes. [Same-input comparison](docs/validation/B1-legacy-comparison.md) checks the actual old importers against the new adapters on synthetic reports. A live authenticated Codex capability check and Runtime-owned ccusage installation check remain B1 work. The B2 [lock](docs/validation/B2.1-Windows-lock.md), [generation validation](docs/validation/B2.1-generation-validation.md), [reader](docs/validation/B2.1-Windows-reader.md), [writer](docs/validation/B2.1-Windows-writer.md), [recovery audit](docs/validation/B2.1-recovery-audit.md), [run-start decision](docs/validation/B2.1-run-start.md), [delivery overview](docs/validation/B2.1-delivery-overview.md), [legacy inspection](docs/validation/B2.2-legacy-inspection.md), [archive comparison](docs/validation/B2.2-archive-comparison.md), [legacy export](docs/validation/B2.2-legacy-export.md), and [legacy import](docs/validation/B2.2-legacy-import.md) reports cover local persistence progress. `enouia-activity` depends only on the contract, common ports, and serde_json; it does not implement a subprocess runner, filesystem store, network client, Memory, or Context dependency.

Future usage scope: [Claude Design integration note](docs/CLAUDE_DESIGN_USAGE.md) and [ADR-019](docs/adr/019-claude-design-usage.md) record the requested addition of official `claude_design` product tokens to the **existing** Claude calendar. Account access, component overlap, Shanghai-day aggregation, old-history reconciliation, and coordinated Moriium wording must be verified before activation. Current ActivityData v1 bytes and three-source meaning are unchanged.

The B3 [restricted SSH validation](docs/validation/B3.1-restricted-ssh.md) covers transport of committed pending bytes without treating exit zero as a publication receipt.
[Public-content matching validation](docs/validation/B3.1-public-content-match.md) covers the separate manifest/data hash and source-outcome checks.
[Origin-bound observation validation](docs/validation/B3.1-origin-bound-observation.md) covers fixed paths, no-redirect responses, and fetch bounds through a test port.

[One-shot runner usage](docs/ACTIVITY_RUNNER.md) documents the commands, sandbox configuration, result codes, and current operational limits. [Runner validation](docs/validation/B3.1-runner.md) records the copied-executable checks and integrated state-machine evidence.

[Installation/scheduler guide](docs/ACTIVITY_SCHEDULER.md) and [B3.2 validation](docs/validation/B3.2-scheduler.md) document disabled defaults, data-preserving uninstall, and the actual sandbox task checks.

[Partial B4 reference acceptance](docs/validation/B4-reference-receiver.md) records actual receiver CLI, publisher and loopback HTTP checks using synthetic data and a copied reference snapshot. This optional development harness is independent of regular builds/tests; full migration and production acceptance remain open.

[B4 frozen comparison](docs/validation/B4-frozen-comparison.md) records 30 identical-input cases, exact per-source daily/time/hash comparisons, declared policy differences, and two legacy GitHub validation differences that remain unaccepted. The pure Rust fixture bridge is an offline development example, not a new production collector.

[B4 subprocess handback](docs/validation/B4-subprocess-handback.md) records exact-byte retry failures, real loopback publication observation, and the actual copied old producer taking over the latest sequence/history through two subsequent runs. All account/SSH tools remain synthetic; production migration and scheduled rollback are pending.

[Pinned ccusage capability](docs/validation/B1.2-ccusage-capability.md) verifies the real 20.0.20 wrapper/native tool and actual Runtime two-store aggregation on synthetic transcripts, including Windows extended store paths. Persistent tool installation and personal inventory acceptance remain pending.

[B4 store hard-kill rehearsal](docs/validation/B4-store-hard-kill.md) verifies 23 actual writer-process terminations across new pending, pause, and receipt commits. Readers retain complete old/new generations and recovery blocks ambiguous published orphans. Power-loss and storage fault durability remain unverified.

[B4 publisher hard-kill rehearsal](docs/validation/B4-publisher-hard-kill.md) verifies old-manifest retention after actual copied publisher death, abandoned-lock refusal, explicit sandbox lock reconciliation, and actual Runtime/curl recovery observation over two new sequences. Deployed-service recovery remains pending.

[B4 runner hard-kill rehearsal](docs/validation/B4-runner-hard-kill.md) verifies ready synthetic collector/transport trees terminate with the actual release runner, committed state stays exact, and restart preserves sequence/pending behavior. The process-creation/job-assignment interval remains untested.

[B4 C15 regression acceptance](docs/validation/B4-reference-regression.md) delivers ten synthetic date, source and success-time regressions through the actual runner and a marked SSH stand-in to the copied receiver. The publisher keeps prior public bytes and reports `degraded`; Runtime keeps each exact pending despite completed transport. Deployed publisher, About rendering and operator reconciliation remain pending.

[B4 C06 literal comparison](docs/validation/B4-literal-comparison.md) finds identical unit/zone rejection in Runtime and the copied public validator. Migration now flags and refuses seeds whose retained success time the manifest cannot publish. Twelve legacy-only `updatedAt` shapes remain unaccepted.

[B4 evidence coverage](docs/validation/B4-coverage.md) maps C01–C18 to ten historical machine reports and concrete remaining gaps. `node scripts/check-activity-evidence.mjs --self-test` checks report hashes and evidence links offline; it does not sign off B4 or activate B5.

The paragraphs below, from A1 Memory model v1 through the selected orchestration histories, describe Runtime's local Memory/Core design. [ADR-025](docs/adr/025-enouia-memory-integration.md) supersedes it: the Memory domain now belongs to Enouia Memory, and these paragraphs are frozen history. Their evidence remains valid as historical design evidence. The dependency-boundary guard among them still applies to the Activity, shared and frozen Core crates.

[A1 Memory model v1](docs/MEMORY_MODELS_v1.md) now provides five-kind records, source provenance, explicit candidate review, retained supersession/undo and strict pure validation. [Seventeen offline checks](docs/validation/A1.1-memory-models.md) cover the synthetic model fixture. Durable Vault/Session/Context and UI work remain pending.

[A1 Session model v1](docs/SESSION_MODELS_v1.md) links retained conversation events to canonical checkpoints with existing ordered turn ranges and exact source provenance. [Eleven offline checks](docs/validation/A1.1-session-models.md) cover two checkpoints over four synthetic turns. Semantic replay is verified; filesystem restart persistence remains pending.

[Local Core IPC v1](docs/CORE_IPC_v1.md) defines typed Inspector, candidate review and Session requests with backend-owned canonical identity/provenance/times. [Seven offline checks](docs/validation/A1.1-core-ipc.md) verify closed DTOs and explicit model-only versus canonical-file commit results. UI and actual Context handlers remain pending.

[Context Capsule v1](docs/CONTEXT_CAPSULE_v1.md) now provides exact canonical provenance, conservative local UTF-8 budgeting and deterministic whole-record selection from ranked inputs. [Ten offline checks](docs/validation/A1-context-capsule.md) verify the frozen synthetic capsule and candidate/overflow boundaries. FTS/query scoring, real Provider calls, persistence and Inspector UI remain pending.

[Offline Mock Provider v1](docs/PROVIDER_MOCK_v1.md) now consumes only prepared exact capsule bytes and returns included ProjectState content/state/open loops with a consumed hash. [Eight offline checks](docs/validation/A2-mock-provider.md) verify its deterministic behavior and candidate-only tool contracts. Real providers, persistence, retrieval and orchestration remain pending.

[Resolved dependency boundaries](docs/validation/Core-dependency-boundaries.md) now guard the independent Activity/Core graph and pure model dependencies. The read-only checker includes six forbidden-dependency negative checks and consumes offline Cargo metadata.

[Core Vault storage v1](docs/VAULT_STORAGE_v1.md) and [ADR-020](docs/adr/020-core-vault-generations.md) now select complete immutable generations and one hash-bound pointer for the backend persistence design. The [V01-V22 recovery matrix](docs/VAULT_RECOVERY_MATRIX_v1.md) specifies required future evidence; no Vault adapter, executable semantic storage fixtures or recovery tests are implemented by this design. Current work is backend design; frontend work is progressing separately. The [Core continuation note](docs/CORE_NEXT_STEPS.md) records the next backend design boundary.

[Disposable index v1](docs/MEMORY_INDEX_v1.md), [retrieval v1](docs/MEMORY_RETRIEVAL_v1.md) and [ADR-021](docs/adr/021-index-and-retrieval.md) now define a generation-bound candidate SQL schema, literal query behavior, deterministic ranks and rebuild/cancellation rules. `python scripts/check-retrieval-design.py` runs the isolated synthetic in-memory SQL design check; [validation](docs/validation/A1.2-index-retrieval-design.md) records 18 lexical cases in two rebuild orders and 48 assertions on development SQLite 3.53.1. This is not a persisted Runtime index, complete Context integration or a packaged SQLite dependency.

[Invocation ledger v1](docs/INVOCATION_LEDGER_v1.md) and [ADR-022](docs/adr/022-invocation-and-session.md) now specify prepared/dispatch/cancel/complete boundaries and atomic assistant/source/result commits. `python scripts/check-invocation-design.py` verifies synthetic exact-byte/shape examples; [validation](docs/validation/A2-invocation-ledger-design.md) states their limits. No ledger adapter or actual Session continuation is implemented by this design.

[Command v2 proposal](docs/CORE_COMMANDS_v2_DESIGN.md), [jobs/events v1](docs/CORE_JOBS_v1.md) and [ADR-023](docs/adr/023-command-receipts-and-jobs.md) now specify exact-generation guards, canonical retry receipts and bounded asynchronous observations. `python scripts/check-command-design.py` checks the closed create-Session/digest design vector and schema operation parity; [validation](docs/validation/Core-command-jobs-design.md) distinguishes those checks from actual IPC/idempotency/worker behavior. Existing v1 IPC is unchanged.

[Backend implementation sequence](docs/BACKEND_IMPLEMENTATION_SEQUENCE_v1.md), [storage shape](contracts/vault/storage-v1.schema.json) and [Windows Vault ports](docs/WINDOWS_VAULT_PORTS_v1.md) now bind ten planned slices and fourteen unaccepted operation boundaries. `python scripts/check-backend-readiness.py --self-test` checks the readiness manifest's 60 frozen artifact hashes, the dependency plan and fourteen deliberately invalid plans. The checker is now historical: its git-scope rule rejects any non-design change since the design baseline, so it has failed since the frontend commit `b49379d`, while the frozen artifact hashes still match. [Readiness evidence](docs/validation/Backend-design-readiness.md) states the narrow integrity-only proof; it does not implement persistence or sign off A1/A2.

[Read/result wire v2](docs/CORE_READ_RESULTS_v2_DESIGN.md) specifies canonical inventory/inspection, historical receipt outcomes, exact recorded-versus-preview capsule bytes and disposable background controls. `python scripts/check-read-results-design.py` verifies 42 selected synthetic wire examples and 23 negative cases; [validation](docs/validation/Core-read-results-design.md) records the limits. Actual handlers, semantic traces, authorization and durable behavior remain pending.

[All-command digest vectors](docs/COMMAND_DIGEST_VECTORS_v2_DESIGN.md) now freeze 22 byte examples across twelve proposed command kinds, shared defaults and nested field order. `python scripts/check-command-digests-design.py` verifies 132 comparisons, four text/array/numeric distinctions and 22 refusal examples; [validation](docs/validation/Core-command-digests-design.md) records that Rust/f64 parity and durable retries remain unaccepted.

[Selected orchestration histories](docs/ORCHESTRATION_TRACES_v1_DESIGN.md) freeze 26 symbolic cancellation/retry/restart/ownership histories with 164 observations. `python scripts/check-orchestration-traces-design.py` checks those expected histories and false completion/invariant cases; [validation](docs/validation/Core-orchestration-traces-design.md) explicitly excludes actual calls, process restart, canonical files and durability.

This project is published under the [MIT License](LICENSE).
