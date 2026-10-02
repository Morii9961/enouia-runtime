# Core read and result wire v2 — backend design

Date: 2026-10-02. Status: proposed closed shapes and synthetic examples, no IPC handlers or advertised support. Authority: [ADR-023](adr/023-command-receipts-and-jobs.md), [commands v2](CORE_COMMANDS_v2_DESIGN.md), [jobs v1](CORE_JOBS_v1.md). The [wire schema](../contracts/ipc/backend-read-results-v2.schema.json) supplements those designs; existing v1 Rust DTOs and frontend files are unchanged.

## Reads and deliberate completeness

`core_read` carries `schemaVersion: 2` and one closed query. Transport invocation correlation belongs to the future IPC adapter; disconnected/replaced callers cannot receive another invocation's response. The following are proposed wire kinds, not registered command names:

| Query | Successful result | Binding/completeness |
|---|---|---|
| `get_capabilities` | `capabilities` | Actual implemented reads/mutations/background controls, commit modes and providers only |
| `get_snapshot` | `snapshot_inventory` | One requested collection of canonical IDs plus all collection counts; bounded page, not a partial model snapshot |
| `get_memory`, `get_source`, `get_session`, `get_candidate` | Exact corresponding record | Required expected binding; entire validated canonical record or refusal |
| `list_candidates` | `candidate_page` | Decision status filter; IDs and derived pending/approved/rejected status only; full proposal via get |
| `search_memory` | `memory_search` | Expected binding plus explicit query/project/Session/as-of/limit; complete retrieval policy execution before matched/no-match |
| `get_capsule` | `recorded_capsule` | Invocation ID at expected binding; exact retained compact bytes and immutable input binding |
| `get_preview` | `preview_capsule` | Process/job/capsule IDs; disposable pinned binding, expiry and `persisted=false` |
| `get_invocation` | `invocation` | Entire retained ledger; does not itself prove the Provider was called |
| `get_operation` | `operation` | Sanitized canonical receipt observation; separate observed and last-changed commit bindings |
| `get_health` | `health` | Nullable binding, canonical/index states, write permission and structured issue codes |
| `get_job`, `poll_job_events` | `job`, `job_events` | Process/job identity; existing bounded status/event shape |

Inventory collections are Memory, source, Session, invocation or operation, sorted by opaque ID in binary order. They include retained inactive/terminal records; candidate enumeration has its own decision filter. The inventory works without SQLite and never substitutes stale index counts. Its item prefix must match the requested collection. Full record reads resolve complete provenance from the pinned bundle; the schema alone does not establish it.

First inventory/candidate page carries null page token and null process ID. Inventory may also use null expected binding to select the current complete bundle. Later pages require token, exact original binding and process ID. Server-owned opaque tokens bind Vault/generation, process, query kind/collection/filter/limit and next offset; no decoded client path or SQL is accepted. Bind generation/filter checks before reading subsequent items. Generation advance yields `stale_page`; token/process expiry yields `process_expired`. No cross-generation concatenation or implied automatic retry is allowed.

Initial token retention is ten minutes, at most 256 live tokens/process and 64 per Vault. Evict oldest unused tokens deterministically; exhaustion is `busy`, expiry is explicit. Tokens are continuation handles, not authorization. Pages contain at most 100 IDs/summaries, exact remaining count and a next token exactly when remaining count is nonzero. Opening a full Session refuses `response_limit` if necessary; it never returns an event prefix as the whole Session.

Non-page canonical reads with expected binding refuse `stale_generation` if the current binding differs at the final checked observation. `get_operation` alone permits null expected binding for lost-ack lookup of the selected complete receipt; its returned observed binding remains explicit. Read-only recovery health is available with null binding when no complete selector can be validated. There is no successful fabricated snapshot in that state.

## Retrieval and exact capsule bytes

Search returns unique IDs, contiguous rank ordinals, lane classification, priority, scope-versus-literal selection and bounded matched term/field/ordinal evidence. Field names exactly match the index projection: `content`, `state`, `decision`, `open_loop`, `last_state`, `tag`. Scope hits retain explicit project or Session/checkpoint evidence and have no invented lexical matches. At most 256 match explanations/hit are returned with an exact omitted count. Canonical content is fetched separately; this response is not a new capsule format.

Eligibility/filter/deduplication/cap counters follow [retrieval v1](MEMORY_RETRIEVAL_v1.md), with fixed-stage single-record counting. Fully executed zero-hit retrieval returns `no_match`; index refusal, stale binding, cancellation and resource exhaustion return `read_rejected`. Complete query execution, canonical projection equality and count correctness remain handler acceptance work.

Capsule inspection transports canonical base64 of exact compact UTF-8 bytes, SHA-256, length and capsule ID. The backend checks canonical base64 padding/roundtrip, no BOM/LF, duplicate JSON keys, byte/hash/ID equality, complete input-bundle provenance and budget before returning it. Inspection must not parse/reserialize and claim those regenerated bytes were consumed. Initial payload is bounded to 32,768 bytes, consistent with the Mock ledger.

Recorded capsule read reports its invocation status: `prepared` proves saved preparation, not dispatch or consumption. Only separately validated completion/result evidence supports a consumed-result claim. Preview exposes the disposable job identity and expiry, with no invocation/operation completion reference. Never convert a preview cache entry into a recorded result because the bytes happen to match.

## Mutation outcomes and replay

`core_command_result` has three tagged outcomes:

| Outcome | Meaning |
|---|---|
| `rejected` | No newly accepted canonical operation; structured reason and nullable observed binding |
| `durable_operation` | Canonical sanitized operation view plus observed binding, replay marker and optional live job |
| `commit_unknown` | Selection after attempted switch is unresolved; writes blocked, no fabricated failure/completion |

The operation view contains kind/status/time/result references and a backend-derived **last-changed committed binding**. It omits client-key/request hashes and original retry token. An accepted/running submission's original input refs must exist; assistant refs remain null. A completed submission requires assistant/source/invocation refs resolved in that completed generation. Failed/cancelled/interrupted submission retains input and has no assistant refs. Synchronous/control operations commit completed receipts atomically; cancellation control completion means recorded control, not guaranteed worker termination.

A replay may observe a newer current binding while returning the original commit binding and refs. The backend verifies the commit generation in retained same-Vault lineage; neither the UI nor a job can replace it with the latest binding. A terminal receipt has no live-job association in the mutation reply; terminal job inspection is separate. Identical retries use canonical lookup before stale-parent rejection as already specified in ADR-023.

Rejected replies echo a token only after it passes closed token validation; malformed/unparseable input returns null token. Do not echo arbitrary malformed content. `commit_unknown` carries an attempted operation ID only as an investigation reference, not evidence that a receipt committed. It cannot return model result refs or a success binding.

## Disposable background controls

`core_background` proposes `index_rebuild` and `context_preview` at an exact expected binding, with bounded typed preview arguments. A process-local action token deduplicates identical accepted work; conflicting reuse returns `request_conflict`. Retain keys with their jobs under the existing terminal job limits, at most 164 retained/queued/active keys; expired keys return no fake historical replay. New process IDs require a new explicit action.

`job_accepted` returns the pinned binding/job identity and `canonicalChanged=false`; it proves no canonical save or completed preview/index publication. `cancel_job` takes only a process/job reference and applies to index/preview jobs. It returns `job_cancel_observed` with cancellation intent or retained terminal state; intent is not worker completion. Mock jobs reject this transient control and require canonical `cancel_submission`/`cancel_invocation`, preventing a disposable flag from claiming durable cancellation. Process-local conflicting-token deduplication also applies to this control.

All background status/event/ref reads use the process-owned lifecycle/caps from jobs v1. No service, scheduler, UI timer or frontend close behavior is introduced.

## Privacy, limits and acceptance

Enforce an initial 24 MiB exact serialized reply ceiling and refuse `response_limit` before transport. JSON `maxLength` is supplementary; actual UTF-8 byte/nonblank/calendar/budget limits require backend checks. Typed content reads are authorized local private inspection and may contain intentional user text; diagnostic/status/capability fields exclude raw paths, queries, credentials and native error output. No read DTO becomes Activity public data or implicit Provider input.

The [selected wire probe](../scripts/check-read-results-design.py) and [synthetic examples](../tests/fixtures/backend/read-results-v2.json) check this schema keyword subset, selected cross-field distinctions and the frozen 2,171-byte capsule. The probe is not a general JSON Schema engine, Rust semantic validator, durable receipt store or IPC implementation. Full request/result pairing, canonical lineage/refs, every command digest, page/token expiry/races, worker controls and health/authorization traces remain activation gates; see [evidence](validation/Core-read-results-design.md).
