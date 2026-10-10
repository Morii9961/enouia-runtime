# Activity run status recovery

Date: 2026-10-09. Scope: native frontend tracking of one accepted Activity run. B4/J1 remain partial; B5 inactive.

The [prior native baseline](Activity-unified/run-polling-before.json) passes **8/17**. One busy status query stops tracking indefinitely. The collecting, persisting, uploading and observing stages stop polling and enable operation controls prematurely. These stages already exist in Activity IPC v1; the current one-shot installed runner normally reports running followed by its outcome.

The page now treats all six documented nonterminal stages as active, retaining operation-control locks until a terminal status. Failed queries retry the same run ID with exponential delays from one to thirty seconds, without repeating Run now or Retry pending. A matching successful reply clears only the query's own error text. Unmount cancels the pending timer and ignores late results. Human-readable labels cover the additional stages; no backend or protocol changes are introduced.

The [new modeled native run](Activity-unified/run-polling-after.json) passes **17/17**: the first busy reply remains visible and locked, the next query restores Completed without a second start, and queued plus all four intermediate stages remain locked and reach their terminal reply. Every mutation is intercepted before native IPC; the complete Activity store stays identical and the package choice is removed. The first retry is observed; sustained failures and the thirty-second ceiling are not dynamically exercised.

A [separate actual-action rerun](Activity-unified/run-polling-actions.json) on a new synthetic package/Vault passes **35/35**, covering real run acceptance/status, pause/resume, healthy Core rebuild, retained history, approved Memory after Activity failure and exact pending across owned-shell termination/restart. The [proof](Activity-unified/run-polling-proof.json) binds raw reports and exact binaries.

Fresh verification: **48 frontend tests**, strict build, unsigned NSIS build, **26 installer source/rendered checks**, Memory/domain guards (8/7 negatives), harness syntax, whitespace and **32 reports / 384 selectors / 32 negative checks**. Unchanged host/Core source, pin and lockfile reuse **32+3 tests** and fmt/clippy evidence. No installer is installed, signed or published.

Desktop SHA-256: c0cdf97f701955b00d2c646fa8aeb80d69b5cc534a064ec95592167941a4f7dd. Unsigned installer: 68b6e50f7a59da98c0b62d0cd19d5a6d975fc776e82b9be06d2a55c9bf5ab079. Runner remains cb665419f42ff088425012f9e43cebf22a21d2647f0a1a19b97df7ca236c8b7a; Memory pin remains ff692ccb6fbc1c387254d5ffbef41b105eeb2a84.

No personal Vault/archive, credential, public upload, existing/production task, server or Moriium source is changed. These synthetic checks do not establish authenticated collection, power-transition behavior, production availability or complete B4/J1 acceptance.
