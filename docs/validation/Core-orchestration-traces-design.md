# Selected orchestration histories — 2026-10-02

Executed `python scripts/check-orchestration-traces-design.py`: **26** symbolic histories and **164** frozen observations passed. **26** altered false-completion summaries were rejected. **5** deliberately corrupted symbolic states violated invariants; a call before recorded dispatch was refused with the prior model snapshot intact.

The selected histories include completion/cancellation order, accepted-input gaps, failure, dispatch-intent-before-call, declared owner exclusion/restart, explicit prepared resume versus new terminal attempt, retained input continuation, old-generation replay, conflicting retries, Identity/unrelated-Memory changes, unknown selection, live-owner refusal and transient-versus-canonical cancellation. Inspect [the matrix](../ORCHESTRATION_TRACES_v1_DESIGN.md) for itemized scope.

The corruption cases omit an assistant source, reopen a completed receipt, revive a completed ledger, substitute a frozen capsule label or drop a retained Session prefix. The oracle's proposal validation checks algebraic/status consistency; its model copy/commit is not a Windows filesystem test. Frozen expected summaries were generated from and reviewed against this selected oracle. They are implementation requirements, not independent proof of a functioning Runtime.

Fixture operation/invocation/input aliases, digest labels and generation ordinals are not canonical IDs or hashes. After an unknown selector outcome, the reported counts describe only the last validated snapshot and cannot establish whether completion actually selected. No real Mock call, Session/source text reload, manifest/response bytes, cryptographic request comparison, OS owner/lock proof, process termination, index repair, Activity sentinel comparison or disk restart was performed.

P08 and O03-O09 remain unaccepted. Full Rust wire pairing/provenance/time/bounds, real receipt/source/ledger atomics, actual multi-process cancellation/retry/recovery and physical storage fault evidence remain future work. Runtime/Activity/v1 IPC/frontend source files and dependencies are unchanged by this design slice.
