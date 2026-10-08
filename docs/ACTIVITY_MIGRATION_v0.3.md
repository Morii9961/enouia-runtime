# Activity producer migration, comparison, and rollback

Date: 2026-09-26. Status: future runbook; none of these production operations has been executed by this design task.

Read [Architecture v0.3](../Enouia_Runtime_Architecture_v0.3.md) and the [implementation plan](IMPLEMENTATION_PLAN_v0.3.md). This runbook implements the user's local-producer-only scope. Moriium continues to own receiver, publisher, public validation, static paths, and About pages.

## 1. Operating invariants

Exactly one production writer may use producer `morii-workstation`, even if two writers have separate local directories. Independent local locks do not prevent collisions at a shared receiver. Isolation requires both a separate work root **and** a separate receiver/publisher inbox/public root. The public producer name stays fixed in both isolated and production envelopes; test isolation is environmental, not a new unilateral producer identifier.

Never modify a pending batch's bytes, sequence, attempt times, or source snapshots to make a retry look new. Never restore an old sequence over a higher reserved/accepted value. Never replace full historical state with a fresh upstream response. Manual Moriium build-snapshot refresh keeps separate files and remains available.

Use the input handoff's totals only as a dated sanity check. Fresh inventory, file hashes, date/value comparisons, and receiver/publisher state determine migration readiness. Code presence and successful tests do not establish deployed services or enabled schedules.

## 2. Evidence bundle

For every rehearsal and cutover create a private, timestamped bundle outside both repositories. Include:

- Old task definitions/enabled state/account/action, active-process check, old and new binary/tool versions.
- Input archive inventory: path, size, SHA-256, validation result, per-source last success, recorded-day count, minimum/maximum date and checked total. Record every missing date and conflicting value across candidates.
- Exact final old `activity.json`, `sequence.json`, `pending.json` if present, nonsecret configuration, and source hashes. Do not include CLI login files or SSH keys.
- Receiver inbox high-water, pending batch identity/hash, publisher high-water and current public activity hash/source times, obtained by the Moriium operator. Record “not deployed” or “not available” explicitly.
- Chosen seed, conflict resolutions, state conversion report, pre/post hashes, comparison results, rollback export and verification results.
- Separate timestamps and results for collection, transport, observed publication, About checks, task enable, and first scheduled run.

An output folder named by date must not overwrite an earlier bundle from the same day. Bundle manifests distinguish data hash (normalized public ActivityData), exact pending-byte hash, and physical archive file hash; these are not interchangeable.

Only a sanitized summary and synthetic fixtures go into Git. Local paths and diagnostic inventories are private operational data.

## 3. Seed selection and high-water reconciliation

1. Inventory the old automatic work directory, current repository snapshot, and repository-external archives. Do not start any collector during selection.
2. Validate each ActivityData v1 candidate, compare **per-source date sets and values**, and inspect successful times. “Newest filename,” “largest total,” and “most recorded days” alone do not identify an authoritative snapshot: corrected values may decrease and sources may have different freshness.
3. Prefer the final valid continuous archive when it contains all known history. If no single file is complete, construct a reviewed seed: retain all known dates; use a documented authoritative snapshot for conflicts, normally the later valid successful snapshot for that source. Equal-time conflicts require explicit resolution; do not choose the maximum number. Preserve all originals. Do not stamp migration time as `updatedAt`.
4. Inventory the old local reserved sequence, any pending sequence, receiver inbox sequence, publisher sequence, and evidence of other producer runs. Set imported high-water to at least their maximum. Missing information for an already-used identity blocks activation; sequence 0 is valid only when the operator establishes that the identity has never been used and no production state exists.
5. If old pending exists, its data is immutable. A richer candidate seed cannot be substituted into it. Carry pending with an archive that contains its data/history while preserving any separately reconciled newer history, but do not generate a new batch until pending is resolved. The receiver may already have accepted it; inspect receipt/publication evidence.
6. Resolve pending by original-sequence delivery or explicit operator reconciliation. If remote high-water is higher, compare remote data and all corrections before declaring pending superseded. Preserve the exact pending bytes and evidence in the migration bundle even after resolution.
7. Run the converter offline and verify its exported legacy trio matches the intended archive/high-water/pending. Seed writes do not mean upload is enabled.

If the receiver/publisher has not been deployed, B5 waits for a separately accepted Moriium deployment. Runtime does not take over server ownership to bypass that gate.

## 4. Old/new comparison method

Use the checked Moriium protocol and test files as the reference. Record HEAD and file hashes/dirty status; a local HEAD alone is insufficient to reproduce working-file behavior. Runtime owns independent code, schemas, fixtures, and tests. The old reference may be invoked in a development-only harness or isolated checkout; no import is allowed in Runtime production code, packaging, or regular offline tests.

Feed both implementations the same prior archive, fixed clock, source responses, source/store inventory, and simulated failures. First compare pure normalization/merge. Then compare complete batch fields and normalized public serialization. Then run each against its own identical isolated receiver/publisher instance. Never compare two sequential live collections as if their different totals prove a bug; current-day upstream data can change between requests.

For each source emit a diff of missing dates, added dates, revised values, retained values, units/zones, updatedAt, attemptedAt, result, and derived succeededAt. Check immutable public file SHA-256 and manifest source times; pretty-print ordering is not a semantic diff, but published bytes must match their own hash and expected normalized data.

Expected deliberate differences are only those in Architecture section 9: strict Codex lifetime requirement, clock-regression preservation, AI new-day admission floor, strict Cowork discovery errors/path deduplication, stronger local transactions, report-level Claude total reconciliation, strict GitHub unique-date/safe-aggregate validation and the four explicitly classified retained timestamp refusals ([ADR-031](adr/031-strict-activity-validation-compatibility.md)). Claude downward replacement was withdrawn by [ADR-029](adr/029-claude-retains-higher-days.md): both implementations retain the higher archived day after a lower complete report. Document each fixture's actual behavior; strict refusal classification does not authorize seed restamping. A stricter transport confirmation state is also expected: Runtime waits for observed publication or reconciliation rather than treating SSH exit 0 as sufficient. Any other divergence requires investigation before cutover.

## 5. Acceptance matrix

| ID | Stimulus | Required evidence |
|---|---|---|
| C01 | Three successful normal reports | Exact old/new daily values, source literals, normalized ActivityData; all attempt/success times match |
| C02 | GitHub rolling lookback and shortened AI history | Every known historical date remains; reported corrections replace; no extra summation |
| C03 | Existing value corrected downward/upward | GitHub/Codex corrections in both directions and upward Claude corrections agree; a lower Claude report keeps the higher archived day in both ([ADR-029](adr/029-claude-retains-higher-days.md)), with unchanged date set and a local retained-higher delta |
| C04 | Each source fails separately; then all fail | Failed snapshot/time retained; others advance; null stays null if no prior success; failure outcomes remain visible |
| C05 | Valid unchanged/zero-valued reports vs malformed empty report | Zero growth remains successful/fresh; empty/malformed input fails without fabricated zero history |
| C06 | Duplicate/impossible/leap dates, negative/unsafe totals, wrong units/zones | Rejection/normalization consistent with contract; checked sums never overflow |
| C07 | Codex unsupported method, malformed response, missing/mismatched lifetime | Retain prior source; strict lifetime difference recorded; no fallback to percentages/log totals |
| C08 | Claude cache/reasoning, multiple Cowork stores, duplicate paths, unreadable store, inconsistent report total | Include cache once, reasoning once; no double counting; incomplete or total-mismatched source retains old aggregate; record the stricter report-total check |
| C09 | Old previous dates beyond rolled-back local end; timestamp rollback | Block rather than delete dates/restamp history; clock repair resumes safely |
| C10 | Private sentinels at every nesting level, raw error text | No sentinel/path/title/model/cost/session/credential in wire or exported diagnostic DTO |
| C11 | Two concurrent manual/scheduled processes, stale legacy lock | One writer; no collection/sequence race; legacy stale-lock handling requires quiescence |
| C12 | Kill before/after each generation/sequence/pending commit boundary; disk full | Valid complete generation only; committed pending survives; no reused sequence |
| C13 | Network disconnect before receipt and after receipt but before acknowledgment | Exact bytes and sequence retried; no new collection while unresolved |
| C14 | Equal/lower sequence and receiver exit-0 no-op; higher remote state | Remote data never regresses; no false publication claim; ambiguous pending requires reconciliation |
| C15 | Receiver accepts candidate losing a historical date or old successful time | Publisher retains prior public data and reports degraded; Runtime retains unresolved pending |
| C16 | Interrupted publisher manifest switch; stale HTTP 200; data hash mismatch | Last complete public version remains readable; observer does not accept stale/incorrect evidence |
| C17 | UI closed, Memory index removed, author Node stopped, Moriium repo unavailable | Installed Activity runner still operates with local CLI prerequisites; Core repair does not touch Activity; public reads remain static |
| C18 | Full cutover then rollback rehearsal with new accepted sequences | Latest history/sequence/pending handed back, no old backup reset, one enabled writer, subsequent old batch advances safely |

Also test scheduler hourly/logon/catch-up/pause/battery settings, process cancellation/deadlines, the receiver's 4 MiB limit without truncation, fresh-config rejection, sequence exhaustion, and UI keyboard/freshness behavior at their owning milestones.

For C15, submit intentionally invalid candidates only to the isolated receiver. Production rollback/cutover must not deliberately corrupt public input for testing.

## 6. Migration stages and gates

### Stage 0 — preflight inventory (no production mutations)

Confirm the actual old task(s), work directory, logon identity, current process state, receiver/publisher deployment and protocol version, restricted SSH setup, and static manifest URL. Validate candidate archives and establish tool capabilities. Record local Node/Codex/gh/ssh/ccusage paths and login availability without reading auth files. Establish a Runtime-owned install/data root, disabled task definition, and independent sandbox endpoint.

Gate: O1–O3 have enough evidence for an isolated rehearsal; no assumed live activation. If tools are missing, use fixtures and record the operational blocker.

### Stage 1 — isolated rehearsal

Copy validated inputs into a sandbox, retaining producer name and original pending state where relevant. Run C01–C18 using isolated receiver/publisher roots. Verify offline importer and legacy exporter. Exercise the documented intentional differences. Build/install a Runtime package and run it with UI closed, unrelated working directory, and no access to either repository. Keep original personal archives immutable.

Gate: tests, hash/time comparisons, fixture provenance, and rollback rehearsal pass; unresolved differences are not waived as “approximately equal.”

### Stage 2 — freeze old producer and take final snapshot

Disable the old Windows automatic task(s), confirm no process is still collecting/uploading, and prevent any alternate automatic writer for the same producer. If a run is active, wait for it to end or stop it using its documented recovery procedure; do not copy files mid-write. Take a final coherent backup of archive/sequence/pending/config and re-read remote high-water. This final snapshot supersedes any earlier rehearsal seed.

Manual Moriium `pnpm activity:refresh` remains a separate build-snapshot operation, but it is not used to mutate the automatic work directory during cutover. Record which copies are frozen. Do not delete old task definitions, scripts, or data.

Gate: old producer quiescent; final state and server evidence archived; exact pending disposition known.

### Stage 3 — import and resolve outstanding delivery

Run migration import offline under Runtime's writer lock with scheduling/upload disabled. Verify per-source dates/values/success times, high-water, pending-byte hash, and legacy export. Replay an old pending batch only at its original sequence through the restricted receiver when this production action is authorized. Observe its published data/source outcomes or perform operator reconciliation. Re-read remote state if ambiguity remains.

Gate: imported history is at least as complete as all selected authoritative sources; no unhandled old pending; reserved sequence is not below known local/remote high-water. No automatic collection yet.

### Stage 4 — one explicit Runtime production cycle

Enable configured delivery for one manual run, with the scheduled task still disabled. Validate that every source either succeeds correctly or retains old state with an explicit failed outcome. For full cutover acceptance, demonstrate three successful source collections; a temporarily degraded source can be investigated while both schedules remain off. Confirm next sequence, retained history, immutable pending, transport result, public hash/source times, and pending clearance evidence.

Validate zh/ja/en About pages: no JavaScript still displays their static build snapshot (which need not equal the latest dynamic batch); JavaScript fetches only the existing static manifest/JSON and renders the new data. Stopping the author Node service must not break static reads. Prefer performing disruptive server-process checks on a matching staging deployment; coordinate any live stop through Moriium operations. No request should route activity through `/api/status/` or the author database.

Gate: real collection, restricted transfer, observed publication, and three-language consumer checks all have distinct evidence. If publication cannot be proven, keep pending and stop; do not enable hourly delivery based on SSH success alone.

### Stage 5 — enable Runtime scheduling and observe

Enable exactly one new task using the installed binary/config, verify old task remains disabled, and observe at least one actual hourly/logon scheduled invocation to completion. Verify account/session access, next sequence, source success times, public data/source metadata, UI health, and absence of concurrent writers. Keep the rollback bundle and old automatic entry point recoverable.

Gate: scheduled run evidence is recorded separately from the manual cycle. A longer soak period may be selected by the operator; at least one scheduled run is mandatory. Only after stable success may a separate Moriium change remove obsolete producer entry points. Do not remove the manual build-snapshot refresh path as an incidental cleanup.

## 7. Rollback procedure

Triggers include lost/changed historical values without explanation, invalid source units/times, unresolved pending/high-water conflict, storage corruption, repeated scheduler failure, or consumer contract regression. Source-specific transient failures normally retain history and degrade health; they do not themselves justify erasing state.

1. Pause/disable Runtime scheduling and uploads. Quiesce its process under the shared lock. Confirm the old task remains stopped. Preserve current files and diagnostic evidence; never restore an older generation in place to “undo” an upload.
2. Export the latest valid Runtime archive/highest reserved sequence/exact pending bytes into a new private legacy-compatible directory. Preserve all successful corrections and newly collected dates from Runtime, even if rolling back its binary.
3. Reconcile pending and remote accepted/published high-water. A pending batch may be safely retried by the old producer at its original sequence if it still satisfies the existing protocol; if the server is ahead or publisher rejects history/time, resolve the conflict first. Do not unilaterally renumber pending. Preserve any skipped reserved sequences in the exported high-water.
4. Validate the exported ActivityData and batch with the old Moriium validators in a development/operations context. Compare every date/value/time with current Runtime state. Rehearse the next old sequence under an isolated endpoint when format/tool compatibility is uncertain.
5. Seed a distinct old automatic work directory from this **current** export, preserving its original directory backup. Restore only its nonsecret config paths and existing local authentication references; do not copy credentials from Runtime.
6. With Runtime disabled, perform one old manual sync, verify receiver/publisher/static About behavior, then re-enable only the old task. Keep Runtime state read-only for investigation and eventual forward migration.
7. Record operator, reason, state hashes, high-water, pending disposition, source comparisons, and observed successful scheduled handback.

If the active generation is corrupt or no authoritative high-water is available, keep both writers off. Recover archive history from verified snapshots/remote published data with explicit conflict review, obtain server high-water evidence, and only then resume. The last valid static public files remain the serving fallback. A paused producer may become stale publicly; that is preferable to claiming fresh data or reusing an old sequence.

Rollback does not require changing producer ID, public JSON schema, About markup, VPS ownership, Memory Vault, or author database. Database/Memory restore operations must never implicitly reset Activity delivery state.

## 8. Cutover report template

```text
Run ID / time / operator:
Old source HEAD + working-file hashes:
Runtime build + tool versions:
Old writer stopped / verified quiescent:
Final seed selection + conflict decisions:
Per-source dates/value/time comparison:
Local reserved / pending / remote inbox / publisher sequence:
Pending original byte hash + disposition/evidence:
Comparison matrix and intentional differences:
Runtime manual collection result:
Transport result (not publication):
Observed public data hash + source outcomes + received/published times:
zh / ja / en; no-JS snapshot; JS static requests; author Node independence:
New task enabled; old task disabled:
Actual scheduled run evidence:
Rollback bundle + export validation:
Remaining blockers / next owner:
```
