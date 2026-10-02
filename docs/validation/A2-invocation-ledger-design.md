# A2 invocation ledger design validation

Date: 2026-10-02. Baseline `d58ab4a`. Scope: backend record/byte design, not persisted invocation or Session orchestration.

[Ledger v1](../INVOCATION_LEDGER_v1.md), [ADR-022](../adr/022-invocation-and-session.md) and the [closed shape schema](../../contracts/invocation/record-v1.schema.json) define recorded preparation, consumed versus response-file hashes, legal state transitions, same-Session leases, cancellation arbitration, restart interruption and complete assistant/source/result publication. Existing Memory/Session/Capsule/Provider DTO schemas remain unchanged. The compact capsule without LF is an explicit exception to the general Vault JSON-with-LF convention.

Read the existing prepared-request and response validators, actual Mock cancellation/refusal behavior, Session append/linkage validators and Core commit-result boundary. This design commits dispatch intent before the call and requires complete canonical observation afterward. No automatic checkpoint/approval, real provider, tool execution, account data or frontend file is introduced.

Executed `python scripts/check-invocation-design.py`: two byte/shape examples passed; 13 invalid identity/time/result/unknown-field/changed-byte examples were refused; the fixture declares 11 legal edges with no terminal outgoing edge or cancellation-to-completion edge. Exact frozen capsule is 2,171 bytes with existing hash `7ac11a64f3671a0566640a7ee86dea86f7acd411daf1bdf16740b6d0ce1c8d6d`. The independently frozen compact response plus LF is 657 bytes with hash `dcbc59b02b4a41c168ad635d6a0d91e04de57c63da913d65250d85834a657a1f`.

The [binding fixture](../../tests/fixtures/invocation/bindings-v1.json) explicitly does not represent a persisted input generation or validated completed Session. The checker supports only the schema's selected local shape keywords; it is not a JSON Schema conformance engine or a Runtime transition/storage implementation. Declared edges are reviewed design data, not executed process transitions. Windows ownership, real dispatch/cancellation races, canonical response/source append, checkpoint operations, restart/lost-ack handling and Activity byte isolation are unverified.

The first ad hoc byte read encountered the host's GBK default; explicit UTF-8 reads reproduced the expected frozen hash. The committed checker always uses UTF-8. Local JSON/Python syntax, schema-reference/link targets, Markdown fences and staged whitespace checks passed. Rust source/dependencies and actual Mock behavior are unchanged, so no new Cargo claim is made.

Work continues directly into backend command/async-job contracts, then the consolidated implementation/acceptance plan under the user's continuous design instruction.
