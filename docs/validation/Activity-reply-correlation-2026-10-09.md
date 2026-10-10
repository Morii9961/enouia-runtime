# Activity request/reply correlation

Date: 2026-10-09. Scope: Runtime client validation of the existing Activity IPC v1. B4/J1 remain partial; B5 inactive.

Three new frontend regressions reproduce acceptance of a status for another run, source/range changes in a filtered-days reply and an opposite pause acknowledgement (45/48 before, 48/48 after). The client now requires the requested run ID, source and inclusive date bounds, and the requested pause state. Run IDs, exact accepted/status/pause field sets and optional status operation/summary types follow the existing schema. This changes no producer, protocol, store or Memory semantics. A successful pause acknowledgement confirms this invocation, not exclusive ownership over future state.

The [native baseline](Activity-unified/run-contract-before.json) passes **5/12**, with seven refusals absent. The [new native run](Activity-unified/run-contract-after.json) passes **12/12**: wrong/invalid run ID, extra status, unrelated operation, non-object summary, extra accepted fields and opposite pause acknowledgement are refused. A valid matching terminal status remains accepted. These operations/statuses are modeled inside the owned page and intercepted before native IPC; they perform no actual collection or delivery, and the complete Activity store stays identical.

A [separate actual-action rerun](Activity-unified/run-contract-actions.json) on a fresh synthetic package and outside-Git Vault passes **35/35**, including real healthy Core rebuild, pause/resume, run acceptance/status, retained history, approved Memory readback after Activity source failure and exact pending across owned-shell termination/restart. [The proof](Activity-unified/run-contract-proof.json) hashes all linked reports and binaries.

An initial baseline helper passes 4/12 because its valid-status assertion searches for lowercase completed instead of the rendered Completed label. The [intermediate report](Activity-unified/run-contract-intermediate.json) is preserved. Correcting that assertion produces the 5/12 baseline above without product changes.

Fresh checks: **48/48 frontend tests**, strict TypeScript/frontend build, unsigned NSIS build, **26/26 installer source/rendered checks**, Memory/domain guards (8/7 negatives), harness syntax, whitespace and evidence integrity **31 reports / 367 selectors / 31 negative checks**. Unchanged host/Core/pin/lockfile reuse the existing **32+3 tests** and fmt/clippy evidence. The installer is built and checked, not installed, signed or published.

Desktop SHA-256: 7477d3dad794cf332e3f405e404c3a2ab2bcf7919063a292316f2e6e45f6caf5. Unsigned installer: 21f6ccc404ea433545cb54931917040b3b29a1b83c2728adfa2872b1e45854e4. Runner stays cb665419f42ff088425012f9e43cebf22a21d2647f0a1a19b97df7ca236c8b7a; Memory stays pinned to ff692ccb6fbc1c387254d5ffbef41b105eeb2a84.

No personal Vault/archive, real-account collection, existing/production task, credential, public upload, server or Moriium source is changed. These checks do not establish production privacy, sustained stress, power transitions or full installed-account acceptance.
