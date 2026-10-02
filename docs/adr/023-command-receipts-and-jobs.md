# ADR-023 — Canonical retry receipts and disposable async jobs

Date: 2026-10-02. Status: adopted backend design; handlers/activation pending. Authority: ADR-020/021/022. Continuous backend design is authorized; frontend remains separate.

## Decision

Propose versioned typed backend mutation envelopes with expected generation and an untrusted action/retry token. Resolve retries from canonical generation-contained operation receipts: identical requests replay the retained result, conflicting reuse fails, and a missing disposable index cannot cause duplicate saves/turns/reviews. Receipt and synchronous mutation commit together. Long Mock submissions distinguish accepted user input from a later atomic assistant/source/result completion.

Do not persist a receipt's own manifest hash inside the receipt: derive the complete selected commit binding after publication, using the stored owning generation ID. Lost acknowledgement is an observation problem, not permission to repeat a mutation or infer Provider success.

Async job status is disposable and process-owned. Canonical operation/invocation files determine durable outcomes; index/preview jobs have no implicit canonical effect. Bound worker queues, event cursors, cache/retention and cancellation arbitration. Existing v1 Core IPC and frontend files are unchanged.

[Commands v2](../CORE_COMMANDS_v2_DESIGN.md), [jobs v1](../CORE_JOBS_v1.md), the mutation envelope, receipt and job/event shape schemas specify the design. Complete read/result DTO schemas, semantic traces, canonical lookup/authorization, queue/event/worker implementations and actual races remain activation prerequisites. Receipt paths and operation kinds are additive Vault follow-ups that do not activate a writer.
