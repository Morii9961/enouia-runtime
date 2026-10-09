# Activity outcome display boundary

Date: 2026-10-09. Scope: frontend rendering of the existing optional Activity run summary; no protocol, producer or Memory change. B4/J1 remain partial; B5 inactive.

Two real-component regressions reproduce raw unknown-state text and fractional/out-of-range source-failure counts entering the run card (48/50 before, 50/50 after). Outcome labels now come only from the known own properties of RUN_STATES. Other string states display the fixed Run outcome unavailable label, including constructor/toString names. Failure counts display only positive whole numbers among the three sources; zero, negative, fractional, excessive and unsafe counts are omitted. The schema's generic optional summary remains accepted: unknown future states receive a safe presentation fallback rather than a new protocol refusal.

The [prior native baseline](Activity-unified/run-outcome-before.json) passes **15/22**, failing four unknown/prototype-state labels and three invalid count assertions. The [new native run](Activity-unified/run-outcome-after.json) passes **22/22**, including a fictional private-path marker, future state, prototype names, invalid counts, normal outcome/count and exact store preservation. All starts/statuses are intercepted inside the owned page before native IPC. No system clipboard or actual mutation is involved.

A [separate actual-action rerun](Activity-unified/run-outcome-actions.json) on a fresh synthetic package/Vault passes **35/35**, covering real run/status, pause/resume, healthy Core rebuild, retained history, Memory readback after Activity failure and exact pending across owned-shell termination/restart. The [proof](Activity-unified/run-outcome-proof.json) records raw report hashes, helper/build identities and limitations. C10/C17 link exact scoped selectors and remain partial.

Fresh verification: **50 frontend tests**, strict TypeScript/frontend build, unsigned NSIS build, **26 source/rendered installer checks**, Memory/domain guards (8/7 negatives), harness syntax, whitespace and evidence integrity **35 reports / 445 selectors / 36 negative checks**. Unchanged host/Core/pin/lockfile reuse the previous **32+3 tests** and fmt/clippy evidence. Native compilation took 1m38s and finished normally; the installer is built, not installed, signed or published.

Desktop SHA-256: 56715abfda68ded92a11f444810b07ae752407554f9fb96099ead25783aca061. Unsigned installer: 8b1984b09928a8657936b8806b0d08d06669dbc674f4c02c10f9e990157cb395. Runner remains cb665419f42ff088425012f9e43cebf22a21d2647f0a1a19b97df7ca236c8b7a; Memory pin remains ff692ccb6fbc1c387254d5ffbef41b105eeb2a84.

No personal Vault/archive, existing/production task, credential, public upload, server or Moriium source is changed. This does not establish authenticated-data privacy, production timing or full installed-account acceptance.
