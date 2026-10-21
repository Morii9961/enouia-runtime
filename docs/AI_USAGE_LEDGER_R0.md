# AI Usage Ledger — R0 compatibility study

Date: 2026-10-21 (Asia/Shanghai). Delivery: design and source inspection only. Implementation authority is [ADR-035](adr/035-ai-usage-ledger.md), subject to its adoption and gates. **R1–R3 are not started: UsageSnapshot v1 is not frozen in the inspected Dashboard main.**

Follow-up: a [local Dashboard candidate review](AI_USAGE_LEDGER_CANDIDATE_REVIEW.md) now verifies an uncommitted Schema/fixture/checker snapshot and records remaining time/quality mappings. The initial remote-main observations below remain historical evidence; candidate files do not yet supply an immutable protocol commit or activate R1.

## Baseline and evidence

Runtime checkout and remote main: `5deb9546eead991b0ea7382aa7574a6b4e6cd712`; the initial worktree was clean and detached. Existing worktrees were listed and left intact. Open Runtime PR #92 concerns Memory history request inspection and is untouched. Work proceeds on `codex/ai-usage-ledger-r0` from that baseline.

Dashboard remote main: `d0fb1c9708f52570f5a898ff65437c39669a6795`. Its recursive tree returned 450 entries and `truncated: false`; no usage/ledger schema, implementation or fixture path is present. Open PRs #41/#42 concern frontend design and deployment; a usage PR search returned none. This establishes the inspected main's state, not the absence of unpublished work elsewhere. No local Dashboard checkout is required or modified.

The supplied architecture and pasted request were read as separate inputs. The proposal's example and prices are not adopted protocol or pricing facts. No private audit figures, usernames, source paths, personal logs or price tables are copied into fixtures or these documents. [Verification](validation/AI-usage-ledger-R0.md) records the checks and their limits.

## Existing producer and reuse inventory

| Component | Current behavior and source | Ledger reuse / restriction |
| --- | --- | --- |
| GitHub collector | [github.rs](../crates/enouia-activity/src/github.rs): contributions | No role in AI token facts |
| Codex collector | [codex.rs](../crates/enouia-activity/src/codex.rs): app-server `account/usage/read`, bucket/lifetime reconciliation, `Codex` day label | Keep unchanged; no local-JSONL fallback or model attribution from totals |
| Claude collector | [claude.rs](../crates/enouia-activity/src/claude.rs): selected Node + fixed ccusage, one process per store, `claude daily --json --offline --timezone Asia/Shanghai`, 120s/store and 4 MiB output cap | Invocation/checked-arithmetic patterns only; daily output is insufficient canonical ledger evidence |
| Cowork inventory | [cowork.rs](../crates/enouia-windows-process/src/cowork.rs): canonical path dedup, expected-store checks, reparse refusals, depth 32 / 50,000 directory limits | Design reference; cannot copy broad profile discovery into a selected-root-only scanner; no message dedup across separate invocations |
| Collector orchestration | [collectors.rs](../crates/enouia-activity-runner/src/collectors.rs): exactly three collectors | No usage collector added to this array |
| Runner and store | [run.rs](../crates/enouia-activity-runner/src/run.rs), [store](../crates/enouia-activity-store/src/lib.rs): Activity lock, CURRENT generation, high-water reservation and pending-before-send | No ledger writes, SQLite connection, counters, revision or lock in these files |
| Delivery | [delivery crate](../crates/enouia-activity-delivery/src/lib.rs): restricted SSH and exact public observation | No reuse for UsageSnapshot; no destination configured or contacted |
| Installation / scheduling | [installer](../scripts/install-activity.ps1), [production registration](../scripts/register-activity-production.ps1), [scheduler policy](ACTIVITY_SCHEDULER.md) | Mechanism reference only; no script execution, task inspection/registration/enablement or config change |
| Desktop Activity | [activity.rs](../apps/desktop/src-tauri/src/activity.rs): selected installed package; runner `overview`/`preview` and explicit actions | No new IPC/page/startup path; Memory adapter and pin untouched |
| Common ports | [common](../crates/enouia-common/src/lib.rs): clock/cancellation/process/error abstractions | Pure helpers may be reviewed; Activity health IDs and safe-JS-integer wire arithmetic are not the new domain model |

Protected wires: [ActivityData v1](../contracts/activity/activity-data-v1.schema.json), [batch v1](../contracts/activity/batch-v1.schema.json), Activity IPC v1 and its established desktop behavior. Public sources stay exactly `github/codex/claude`; Codex is account/service-day data and Claude is Code/Cowork Shanghai-day data. The new ledger is local observations, never a fourth Activity source or a summed account-plus-local series.

Read baseline: AGENTS.md; Architecture v0.3 (especially sections 7–13); ACTIVITY_RUNNER / SCHEDULER / MIGRATION; ADR-028/029/030 and current ADR register including 033/034; PROJECT_STATUS.md. Status prose is historical evidence, not current production inspection. No project status snapshot is generated by R0.

## Pinned ccusage findings

Primary source: tag `v20.0.20`, resolved commit `bd7f89b469aee5635fb2e6722dd6d70f2d113ac1`. Inspected [daily loader](https://github.com/ccusage/ccusage/blob/bd7f89b469aee5635fb2e6722dd6d70f2d113ac1/rust/adapters/claude/src/daily.rs), [entry loader](https://github.com/ccusage/ccusage/blob/bd7f89b469aee5635fb2e6722dd6d70f2d113ac1/rust/adapters/claude/src/lib.rs), and [metering types](https://github.com/ccusage/ccusage/blob/bd7f89b469aee5635fb2e6722dd6d70f2d113ac1/rust/crates/ccusage-core/src/types.rs). This is source review, not a new executable capability run. The repository's [historical 16-check probe](validation/B1.2-ccusage-capability.md) used synthetic transcripts; it does not test the ledger gaps below.

1. Daily totals add ordinary input, cache reads, cache creation and output. `TokenUsageRaw::cache_creation_token_count` uses the nested 5m+1h breakdown when present, otherwise the creation total. Both durations collapse to one output counter.
2. Absent cache-read/cache-creation fields default to zero in the tool's deserialization; duration members also default to zero. Therefore a daily report's zero cannot establish source-field presence or a measured zero for this ledger.
3. Daily dedup matches message ID + optional request ID, with a sidechain exception matching a parent message under changed request IDs. It prefers a non-sidechain record, then larger token total, then cost/speed tie-breaks. Missing message IDs have no such dedup identity. These selection policies do not constitute an auditable revision history.
4. Runtime invokes ccusage once **per store** and sums reports; canonical path dedup does not remove copied transcripts in different stores. Aggregate reports lack the IDs needed to repair that overlap afterwards.
5. The daily loader reads each file into memory; read failures, unsupported null fields and malformed lines can be skipped. Valid report-total reconciliation alone does not establish complete inventory or bounded-memory safe parsing.
6. Daily output can contain model breakdowns, but the loader applies model aliases and a fast suffix before aggregation. It drops request identity, exact raw model, cache-lifetime detail, missing-field presence and request-level tier/context. Runtime's adapter further keeps only dates and totals. Do not recover these fields by guessing from a breakdown name.
7. Tool costs and pricing machinery are irrelevant to Runtime's new ledger. The existing offline command stays unchanged; no installed package is discovered, run, downloaded or upgraded in R0. New ledger code must not import monetary fields or use inferred prices to select a measurement.

Conclusion: reuse the existing command only for separately labelled synthetic daily comparison, never ingest its aggregate alongside raw facts into the same total. ADR-035 proposes a narrow ledger-only count parser exception; without adoption, request-level Claude support must remain unavailable.

## Candidate field mapping and protocol gaps

Names below quote the **proposal**, not a frozen Schema. There is no Runtime UsageSnapshot v1 JSON format in this delivery. Unsupported source versions remain unsupported rather than coerced to this table.

| Proposed field | Observable source / derivation | Missing, ambiguous or incompatible case |
| --- | --- | --- |
| `schema_version`, `kind` | Dashboard authority only | Version identifiers and forward compatibility not supplied |
| `dataset_id` | Fresh local random alias | No machine/user/account/path hash; syntax/entropy limits need agreement |
| `revision` | Transactional dataset revision | Integer vs decimal string, range scope, replacement and equal-revision conflict rules unresolved |
| `generated_at` | Explicit export metadata | Not usage time; precision/canonicalization and deterministic-repeat policy unresolved |
| `timezone`, `range`, row `date` | Valid event timestamp -> Asia/Shanghai; half-open range | Timestamp precision and timezone-less/missing time must be explicit; account buckets cannot be projected |
| `collector.*` | Build + adapter algorithm identifiers | Allowed IDs/version grammar, migration/replay behavior unresolved |
| `source`, `provider` | Registered adapter identity | Separate Codex local / Claude Code / Cowork granularity and overlap policy need frozen enums |
| `model` | Exact event model or unambiguous event context | Unknown/mixed -> unknown; no latest-model aliasing; strict identifier safety/length budget needed |
| `effort` | Explicit supported source field / bounded context | Cross high/xhigh boundaries and ambiguous intervals -> unknown; null vs unknown vs not_applicable and confidence unresolved |
| `metering` | Accepted supported reported counters | Reported vs inferred attribution are different dimensions; enum not supplied |
| `rate_context`, `service_tier` | Explicit supported per-request condition | Never inferred from weekly totals/model name/effort; missing -> unknown; no default standard/short |
| `counts.input_total` | Codex input includes cache; Claude ordinary input + read + creation when known | Claude missing cache fields can make total unknown; never apply Codex subtraction to Claude |
| `counts.input_uncached` | Codex total minus all known exclusive cache buckets; Claude explicit ordinary input | Codex missing write counts -> unresolved; cannot blindly subtract read alone |
| `counts.input_cache_read` | Explicit cached-input subset (Codex), additional cache read (Claude) | Missing -> null, explicit zero -> decimal zero; ccusage report presence insufficient |
| `counts.input_cache_write_5m/1h` | Explicit, supported Claude duration counters | No default lifetime; unsupported Codex cache categories must not be squeezed into Claude lifetimes |
| `counts.input_cache_write_unknown` | Reported creation total without duration classification | Residual only if semantics prove a complete disjoint partition; missing total -> null |
| `counts.output_total` | Reported output, including any reasoning subset | Validate differences and integer bounds before accepting |
| `counts.output_reasoning_subset` | Explicit reported reasoning field | Optional subset <= output; missing -> null, not zero; never add to output |
| `quality_flags`, completeness | Finite diagnostic codes + known/unknown masks | Closed enums, conservation status and unknown propagation missing |
| `coverage.*` | Bounded scan inventory, conflicts, missing spans, retained history | Counts/precision/confidence and distinction between no usage and not observed need agreement; no free-text log notes |
| Snapshot hash / supersession | Canonical allowed aggregates and explicit revision | Hash algorithm/byte canonicalization and full-snapshot replacement scope not frozen |

Counts use decimal strings without leading zeros/sign/exponent, plus explicit unknowns; missing members and explicit null need separately documented validation. Aggregating known + unknown must not turn a known subtotal into a complete total. Cache ratio, if offered locally, is `known cache-read / corresponding known input-total` with coverage and a zero-denominator state, never a global hit-rate claim over missing inputs.

The minimum unblock package from Dashboard is: immutable schema commit + content SHA-256, adopted semantic/replacement rules, closed source/quality/knownness enums, canonical numeric/hash rules, explicit limits, accepted/adversarial fictional fixtures, and a runnable offline conformance command with expected results. Both repositories pin the same artifacts; Runtime never depends on Dashboard's checkout at build/runtime. No message is sent to another chat or repository by this study.

## Security budget to resolve before R1

The protocol must freeze maximum export bytes, rows, date span, model/effort identifier length, decimal digit width and nesting depth. R0 does not select an incompatible transport limit. Unknown source data must never reach an export as arbitrary strings.

The independent scanner must also declare per-run inventory/byte/time limits, per-file and preallocation line limits, JSON depth, maximum event/session counts and cancellation latency. These operational limits differ from export limits. Budget exhaustion produces partial coverage without erasing prior facts; output limits never truncate rows silently. R1 fixtures below require exact boundary and boundary+1 cases after values are chosen. This avoids inventing wire budgets before Dashboard's decision.

## Synthetic fixture specification (not executed)

All labels, IDs, models and counts below are fictional. These are scenario definitions for R1–R3, not a shared conformance corpus or a source-log format claim. `I/C/O/R/T` denote Codex inclusive input/cache-read/output/reasoning/total; use explicit event IDs and source versions only once publicly verified. Every absent field must have variants for null, explicit zero, invalid type and unsupported version.

| Case | Fictional stimulus | Required result |
| --- | --- | --- |
| C01 cumulative vs last | Proven baseline `(0,0,0,0,0)` -> `(100,60,20,5,120)` -> `(150,80,30,8,180)`; last increments 120 then 60 | Exactly 180 total, I=150/O=30/C=80/R=8; writes and uncached unknown if not reported |
| C02 repeated / copied | C01 events repeated and copied into archive | One chain; unchanged semantic revision/export under fixed metadata |
| C03 missing baseline | First observed snapshot is `(100,60,20,5,120)` | Unallocated checkpoint/gap; no invented date/model allocation of 120 |
| C04 context switches | Separate sessions and within-session high -> xhigh -> high with explicit fictional model IDs | Attribute only provable deltas; never apply last session's context to another |
| C05 mixed interval | One cumulative difference spans a context/model switch without event binding | Keep usage unattributed; no proportional allocation |
| C06 order / collisions | Reverse complete lines, equal timestamps, conflicting same session/event ID | Use proven source order only; unresolved chains/conflicts quarantined, no guessed sort |
| C07 reset / truncate / roll | Counter drop; rewritten prefix; rotated file; file disappears | No invented new epoch; old confirmed history retained; replay/conflict health explicit |
| C08 bad counts | C>I, R>O, T != I+O; difference violates subset; negative/fraction/overflow | Reject without partial addition or unsigned wrap |
| C09 missing metadata | Unknown model/effort/tier, auto-review without exact model, no cache-write fields | Unknown preserved; no alias/default pricing or inferred zero |
| C10 day boundary | Events at `2030-02-03T15:59:59Z` and `2030-02-03T16:00:00Z` | Dates 2030-02-03 / 2030-02-04 in Shanghai; missing time is unallocated |
| L01 Claude known writes | Ordinary 11, read 13, creation 12 with 5m=5/1h=7, output 17 | Input 36, total 53; four input buckets exclusive, output 17 |
| L02 unknown duration | Ordinary 11, read 13, creation 12, no duration fields, output 17 | Unknown-duration write 12; 5m/1h unclassified, not assumed 5m |
| L03 missing vs zero | Ordinary 11/output 17; read/creation absent vs both explicitly zero | Missing case has unknown input-total; explicit-zero case input 11/total 28 |
| L04 inconsistent writes | Creation 12 with 5m=5/1h=8; or only one duration member present | Conflict/partial state; no silent sum/max/default zero |
| L05 cross-store duplicate | Same message/request in normal and distinct Cowork roots | Count once across source union; no summing daily duplicate reports |
| L06 sidechain / revisions | Parent replay with changed request ID; streamed revisions up and down; missing IDs | Versioned identity rule; conflicts quarantined; no automatic maximum; indistinguishable requests not collapsed |
| L07 ccusage loss | Missing cache fields, malformed/unreadable input, alias/fast model mutation | Daily comparison cannot claim presence, completeness or raw model/tier identity |
| S01 file safety | Escape/junction/link/replacement race, large/deep file/line, over-budget inventory | Bounded refusal with codes only; no outside-root read or allocation before cap |
| S02 growing tail | Complete lines + unfinished final line, then append completion; malformed complete line | Complete prefix retained, tail deferred exactly once; bad completed line isolated |
| S03 source failures | Missing selected root/file, denied read, timeout, cancellation | Prior history and last-success retained; attempt failure/coverage explicit |
| S04 numeric encoding | `9007199254740993` plus `9` -> `9007199254741002`; `00`, `+1`, `1e3`, limit+1 | Exact decimal sum beyond JS safe integer; reject noncanonical/out-of-range values |
| S05 export privacy | Nested body/path/user/secret sentinels, path-like model, arbitrary diagnostic text | No source-derived free text, IDs, paths, costs or secrets in exported whitelist |
| P01 durability | Writer contention; kill before/during/after transaction commit; reopen | One writer, complete old/new revision only; no lost confirmed weeks or duplicated correction |
| P02 replay / revision | Same scan twice; supported downward correction; parser-version replay; deleted source | Determinism, explicit replacement revision and retained evidence; no old+new summation |
| P03 scale | Generated 100k then up to 1m events within declared budget | Record machine/OS/tool versions, peak memory, wall time, counts and limits; no preset performance claim |
| X01 conformance | Shared frozen valid/adversarial snapshots in both repos | Same accept/reject results; schema/hash/version match; unavailable in R0 |

## Handoff and acceptance

Morii or the Dashboard owner provides the frozen contract package and resolves the mapping gaps. Resume R1 with synthetic adapters only after that package and ADR adoption; then independently verify R2 durability/security and R3 export. A real local sample requires Morii to choose exact read roots/ranges separately. Production scheduling, live monitoring, VPS upload, actual API valuation and Memory changes remain outside this task's authorization.
