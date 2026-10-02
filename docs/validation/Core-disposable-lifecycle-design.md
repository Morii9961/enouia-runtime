# Disposable lifecycle decisions — 2026-10-02

Executed `python scripts/check-disposable-lifecycle-design.py`: **42** selected frozen decisions and **8** invalid-premise refusals passed: ten page, eight event-range, seven preview, eight admission and nine retention cases. Expected outcomes were separately specified in the fixture; inputs declare process/binding/cache snapshot premises.

Boundaries include age 599,999 versus 600,000 milliseconds, terminal age 1,799,999 versus 1,800,000, event cursor 44 versus 43 at head 300, future cursor, fourth worker, thirty-second queued job, 164 action keys, 64 page handles/Vault, 4 MiB preview bytes and 128 terminal jobs. Matching retained actions replay even when capacity is full. A retained preview's original binding survives generation advance; it remains disposable.

Malformed selected inputs refuse page/poll bounds, numeric booleans, impossible offset/clock and worker count. No real cache, worker, event snapshot, clock, entropy, IPC, canonical receipt or cancellation executed. Process-wide page capacity/LRU/pinning, key linkage, actual payload allocation, publication and concurrent final observations remain untested. This is selected design evidence, not P09/O11 acceptance. Runtime/Activity/v1 IPC/frontend sources and dependencies are unchanged.
