# Identity-only storage byte vectors — 2026-10-02

Executed `python scripts/check-storage-bytes-design.py`: **3** selected synthetic Identity-only generations, **13** exact byte objects, **29** mutated-bundle refusals and **5** malformed JSON decoding refusals passed.

The bootstrap and two Identity edits are frozen as Base64 bytes, length/hash metadata, inventories and exact selectors. The helper reconstructs no Runtime root and writes no canonical files. Rehashed negative mutation/header examples exercise historical semantic conditions after byte consistency; other negative examples exercise earlier shape/inventory/byte gates.

The test's fixture producer and oracle use Python serialization. Passing them does not establish independent Rust serializer parity or the complete legal model corpus. Model/source/candidate/Session/raw/invocation/operation collections are absent. All P01-P10 remain unimplemented and O01-O14 unaccepted, including complete DTO/graph acceptance. No Windows file port, actual pointer publication, restart, storage failure, personal data or live Provider behavior is tested.

Affected Markdown/JSON/Python integrity and source scope are checked separately. Existing Runtime, Activity, v1 IPC and frontend sources remain unchanged by this slice. See [the design](../STORAGE_BYTES_v1_DESIGN.md) for the exact selected proof boundary.
