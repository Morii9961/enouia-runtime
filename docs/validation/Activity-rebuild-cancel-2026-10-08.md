# Cooperative rebuild cancellation and recovery stay independent of Activity

Date: 2026-10-08. Base revision: `5d3ba02`. Product code, binaries and Memory pin are unchanged. Scope: actual cancellation before the first index transaction is applied, followed by a fresh rebuild of 241 approved synthetic memories.

The `--rebuild-cancel` mode uses the same pinned-Core-only seed and actual running-worker Activity read bracket as the overlap drill. `operation_cancel` returns the same running operation with `cancelRequested: true`. The worker reaches the real terminal state `cancelled`, no error, `cancelled: true`, `reachedHead: false`, **zero commits applied** and no watermark. Complete canonical Vault and Activity trees remain byte-identical across cancellation.

A new `index_rebuild` has a fresh operation ID and reaches succeeded. All 241 approved memories remain listed, canonical Vault and Activity bytes stay unchanged, and the ordinary source-failure/pending/restart workflow passes. A real index-dependent search after Activity's source failure additionally returns the original approved isolation memory; the test does not rely on its position in the first list page.

The [native report](Activity-unified/rebuild-cancel-native.json) passes **46/46**, exit 0, including six cancellation/recovery assertions. The [proof](Activity-unified/rebuild-cancel-proof.json) binds raw report, harness/binary hashes and exact pin. Offline evidence checking parses the actual running cancel response and actual cancelled terminal result, including zero commits/no watermark. Harness syntax, Git whitespace, Memory integration self-test (8 negative checks) and Activity evidence integrity (**20 reports, 177 selectors, 19 negative checks**) pass. Unchanged product checks from the confirmation slice are reused.

Memory stays pinned to `ff692ccb6fbc1c387254d5ffbef41b105eeb2a84`; desktop SHA-256 stays `9067ccb52f321b10ffe2acd1ed6f4f04b43dff2d3e79c124bd557781c3bfad6a`, runner stays `cb665419f42ff088425012f9e43cebf22a21d2647f0a1a19b97df7ca236c8b7a`. Synthetic artifacts remain in `enouia-activity-rebuild-cancel-20261008` temporary storage.

This is cooperative cancellation before the first applied batch. It is not partial-index-progress recovery, sustained stress, concurrent Activity mutations or production acceptance. No personal Vault, real account, task or public upload is used. C17/J1/B4 stay partial and B5 inactive.
