# Positive pending sequence contract

Date: 2026-10-10. Baseline: `ae1ea0191ba6bddeccf99126a60ade1c4b002ea0`. This changes only frontend response validation to match the existing [Activity IPC v1 schema](../../contracts/ipc/activity-v1.schema.json). Producer/store, native adapter, wire schema, Memory pin and dependencies remain unchanged. J1/B4 remain partial; B5 is inactive.

The schema requires `delivery.pendingSequence` and `pending.sequence` to be positive safe integers when present. The client reused a nonnegative-number predicate and accepted zero for both. A zero pending reply therefore reached the connected UI instead of becoming a contract failure.

Both fields now require integers from **1 to 9,007,199,254,740,991**. `delivery.pendingSequence: null`, absent/null pending detail and `producer.highestReserved: 0` retain their existing legitimate empty-state behavior. No new cross-field relationship or producer rule is introduced.

The [hashed proof](Activity-sequence-contract/proof.json) records [18/18 native boundary checks](Activity-sequence-contract/sequence.json), versus the same [16/18 old-build baseline](Activity-sequence-contract/before.json). Overview replies are explicitly modeled using actual healthy source data: both zero fields, negative/fractional/unsafe numbers and numeric strings refuse before source display or mutation enablement. Positive minimum/maximum sequences render exactly, and null pending/zero reservation recover the source cards. All run/retry/pause requests are blocked by the drill, none are attempted, and saved choice/store/manifest remain exact. Setup and healthy preview reads remain actual native IPC. This is client contract evidence, not an induced producer fault.

The [frontend test report](Activity-sequence-contract/tests.json) records **60/60**, including ten field/value refusals and exact positive/empty boundaries. Before the product change the same suite was **59/60**, failing with `Missing expected rejection: delivery: 0`. Separate [23/23 error-ownership](Activity-sequence-contract/errors.json) and [35/35 actual producer/Core](Activity-sequence-contract/actions.json) regressions pass on the new frozen desktop, with their own modeled-error and actual-action scopes.

Fresh checks: strict TypeScript/build, native/unsigned NSIS build, 26 installer ownership checks, Memory/domain guards with 8/7 negatives. The [47 host + 3 Core tests](Activity-runner-pipe/tests.json) remain applicable because the exact Rust source, Cargo manifest/lock and Memory revision are unchanged; the proof records that host-source digest. C17 adds 20 selectors (18 native and two frontend tests). Evidence integrity is **66 reports / 1,099 selectors / 73 negative checks**. All 18 rows retain their remaining acceptance gates.

No personal data, accounts, credentials, scheduled task, live delivery or server was touched. The installer was built, not installed or signed; no B4/B5 gate is activated.
