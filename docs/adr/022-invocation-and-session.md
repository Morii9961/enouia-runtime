# ADR-022 — Persist exact capsules before Mock and commit answers with Session

Date: 2026-10-02. Status: adopted backend design; Runtime implementation/activation pending. Authority: ADR-006/007/020/021. The user explicitly requested continuous backend work across completed design slices; frontend work remains separate.

## Decision

Persist a generation-contained invocation/request and exact compact capsule before any Provider dispatch. The invocation binds the historical validated input generation, one triggering user turn and a process-owned same-Session lease. Distinguish prepared, dispatching, cancellation intent and terminal outcomes. A validated response, exact assistant turn/source and completed ledger result commit as one complete bundle.

Cancellation is serialized with completion under canonical locking. Restart does not implicitly run a Provider or reconstruct an unrecorded historical response. Explicit retries create new invocation/request identities while retaining the prior attempt and existing user turn. Checkpoint creation remains a separate explicit human operation against retained ordered turns.

[Ledger v1](../INVOCATION_LEDGER_v1.md) specifies files, closed record fields, transitions and crash/race limits. The [record schema](../../contracts/invocation/record-v1.schema.json) and byte fixture are design artifacts, not a persistence adapter.

## Additive Vault follow-up and gates

Add allowed `invocations`, `capsules`, `requests` and `responses` paths and prepare/dispatch/cancel/finalize/recover invocation operations only when their validators/adapters pass. Exact compact capsule files have **no terminal LF**; the general JSON-with-LF rule remains for the other objects. Existing canonical model/Provider/Capsule schemas and Activity storage semantics do not change.

Before activation, prove exact input/request/capsule correspondence, complete source/Session validation, single active invocation per Session, live-owner exclusion, prepare-before-dispatch, cancellation race outcomes, lost-ack lookup and real interrupted-process recovery. All selected ancestors/capsules remain retained. No tools, inferred approval, real inference provider, credentials or production migration are enabled.
