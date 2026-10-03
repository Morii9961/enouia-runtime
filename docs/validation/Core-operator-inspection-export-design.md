# Read-only operator plan design — 2026-10-03

Executed `python scripts/check-operator-design.py`: **2** selected synthetic inspection/review examples, **18** retained generations, **282** copy entries and **23** corrupted-example refusals passed. Payload is **153,605** bytes; the selected-history compact plan is **64,569** bytes. Its SHA covers exact compact UTF-8 plus LF without an embedded self-hash.

The examples distinguish selected history from explicitly named history with absent CURRENT; the latter claims no canonical binding or repair. Validation reuses known synthetic storage byte/lineage oracles, not a native root scan or source/destination access. Rehashed negative plans still refuse lost ancestors/entries, changed hashes/totals/raw data and selector/root observations. Other cases refuse incomplete/unverified premises, process/destination/hash mismatch, canonical-write claim, client path and restore action.

Schema/reference/syntax/link integrity, readiness hashes and source scope are checked. No actual copy/publication/scan/approval/expiry, OS lock/ACL/topology, selector repair, private data or Activity sentinel executes. P04/O01-O14 remain unaccepted. See [the design](../VAULT_OPERATOR_v1_DESIGN.md).
