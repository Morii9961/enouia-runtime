# Core command/async-job design validation

Date: 2026-10-02. Baseline `281b182`. Scope: proposed backend shapes/digest vector and review, no enabled IPC or worker.

[Command design](../CORE_COMMANDS_v2_DESIGN.md), [job design](../CORE_JOBS_v1.md) and [ADR-023](../adr/023-command-receipts-and-jobs.md) define twelve candidate mutation kinds, closed envelope/receipt/job/event shape schemas, typed read boundaries, expected-generation mutation guards, canonical duplicate/conflict lookup, accepted inputs and terminal results, same-Session gaps, queued cancellation and bounded disposable workers/events. The receipt stores a last-changed generation ID rather than its own manifest hash to avoid circular hashing.

Executed `python scripts/check-command-design.py`: six create-Session digest comparisons passed, four invalid envelope examples were refused, twelve envelope operation kinds match the receipt registry, and the receipt's top-level self-manifest hash is absent. The committed vector hash is `eecf5e231d493f57b482df62f33f6b4a010dc6541befe21d2508dd0381389a4b`. Seven duplicate/conflict outcomes are declared fixture data, not executed canonical retry lookups.

The helper deliberately supports the single closed create-Session example; it is not a JSON Schema engine or a validator for every operation. Incoming object key order/action token do not alter that semantic request digest; changed title, exact original whitespace and expected generation do. Future Rust typed digest fixtures must cover every command before activation.

Reviewed the existing v1 IPC drafts/results, Session provenance, complete-generation commit, invocation state rules and index ownership. Added submission cancellation for the saved-input-before-preparation gap and distinct user/assistant source references. No raw SQL/path/client-generated canonical identities or blanket client approval marker are introduced.

Local Markdown link/fence, JSON/schema-reference and Python syntax checks passed; staged whitespace checks passed. Rust sources/dependencies and v1 DTO/schema files are unchanged. Actual read/result serialization, full shape conformance, canonical receipt uniqueness/CAS, simultaneous retries, authorization, async cancellation/races/cursors/process restart and Activity filesystem isolation remain unverified. No Runtime write, frontend edit, service or account operation occurred.

Work continues into the consolidated backend implementation/acceptance plan and storage/Windows port design boundaries without a routine continuation stop.
