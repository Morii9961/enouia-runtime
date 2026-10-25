# ADR-037 — Explicit synthetic native Memory adoption

Date: 2026-10-25. Status: accepted for the isolated synthetic adoption slice. Production adoption is not activated.
Authority: Morii explicitly authorized Core-8 independent Runtime adoption after Core-7.
ADR-035/036 are already used by the parallel Activity work; this decision preserves that work.

## Decision

Amend ADR-025's Workspace-only seam for one explicit synthetic capability. The
normal desktop still uses workspace IPC v1 and existing owner records. Pin every
Memory dependency to `bf6bfd10bf3c870ae2ce7ceb5c6bd635b08bf327`, including the
Memory-owned Host/Vault libraries needed by the native adapter. Do not add local
paths, branches, patches, Runtime domain dependencies or Memory business rules.

`--memory-synthetic` creates a fresh temporary example through Memory's own
System admission and witnessed transactions. It uses three fixed synthetic
statements and a fake generator, never real user input, accounts or models.
The original public fixtures come from that exact Memory revision. This is
bootstrap test data, not a Runtime semantic engine or a production writer.
No existing root is opened; the legacy startup root argument is ignored in this
mode. Login autostart opens neither a synthetic root nor the legacy argument.
Real Provider setup is skipped and Provider changes are refused before bootstrap.

The main window alone receives `memory_automation`. Requests require schema 2
and `memory-native-read-1` before operation decoding. They cannot choose a root,
actor, profile or sensitivity ceiling. Core-7 returns authorized pages/details,
selected sources/history and native recall simulation; unsupported global views
remain unavailable. Native controls only lock/unlock the synthetic binding.
Read outputs carry `native_read`; lifecycle acknowledgements carry
`native_control` and never claim a memory commit or owner confirmation.

Only pure reads may wait on explicit pre-read Busy in the native blocking worker,
with a two-second retry budget and no binding/writer lock held between attempts.
Each attempt re-enters current Memory authorization. Controls, unknown outcomes,
stale cursors and version failures are never replayed; the frontend sends one IPC
request. Lock signals withdrawal before waiting for an in-flight observation. A contended status hides displayed
observations until the same snapshot is freshly confirmed; revocation, changed
snapshots and other failures clear them. Control epochs reject late open replies.

Initialization, reads and teardown stay off the UI thread. Memory owns the
bounded generator and maintenance workers. Lock/exit also fence unpublished
initialization; shutdown joins the workers. Failed exit leaves this optional
reader unavailable until restart. Temporary examples remain for diagnosis and
are never reopened automatically. No real data cleanup or migration is implied.

## Adoption gates and limits

The pin/lock/manifest, native unit/consumer tests, Node/DOM checks, dependency
boundaries, embedded-assets build and owned-process native smoke must pass for
this slice. See [evidence](../validation/Core8-native-adoption-2026-10-25.md).

Legacy Context, Sessions, Provider and Quick Search retain their v1 roots and
semantics. They do not silently consume the synthetic V2 root. The new Memory
region offers an explicitly read-only recall simulator; it is not a saved
legacy Context capsule. Activity/Usage stays independent and never supplies
cognitive input. No shared frontend App/router/token or Claude tree is changed.

Production System authentication/capture, real Provider/embedding quality,
personal migration, recovery and deployment require their own activation gates.
Rollback restores a matching Runtime pin/lock/adapter combination on supported
v1 roots; never downgrade a V2 root or rewind policy/deletion watermarks.

2026-10-25 integration: Memory PR #55 preserves current main and Core-1..7;
Runtime adopts the tested integrated revision above with all 58 Workspace v1
commands. See [integrated evidence](../validation/Core8-main-integration-2026-10-25.md).
