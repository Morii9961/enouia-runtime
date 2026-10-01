# B4 historical evidence coverage

Date: 2026-10-01. Status: partial isolated validation; no C01–C18 row is signed off and production is not activated.

[coverage.json](B4/coverage.json) maps every migration matrix row to exact selectors in seven committed machine reports. Its report hashes pin the historical bytes, including fixture/helper provenance recorded when each rehearsal ran. They do not imply that every older helper hash matches today's source. Updated harnesses need their own fresh evidence; changing a report requires deliberate index reconciliation.

Run `node scripts/check-activity-evidence.mjs --self-test` from the repository root. The checker verifies all 18 unique rows, report hashes/states/counts, 59 existing evidence selectors, the two unresolved frozen comparisons, explicit row gaps and inactive B4/B5 gates. Eight negative checks reject missing rows, changed report bytes, invented selectors, escaping paths, automatic acceptance/activation, missing gaps and duplicate reports. This is an offline documentation integrity check; it runs no collector, scheduler, network transport or reference checkout.

The linked reports cover 30 frozen-input comparisons, receiver/publication checks, exact retry and legacy handback, actual pinned ccusage on synthetic transcripts, 23 store-process deaths, two publisher-process deaths and three release-runner deaths. Those scopes overlap. Adding their counts is not a measure of full acceptance or real account coverage.

Both unresolved GitHub differences remain open: duplicate dates and an unsafe aggregate sum. Live O1–O4/O6 evidence, remaining O5 durability/tooling evidence, installed schedule observations, Core/Activity UI isolation and real cutover/rollback are still required. The index uses the operational gate definitions in the implementation plan; it does not rename or waive them.

Power loss, disk-full, mid-write interruption and the Windows process-spawn/job-assignment interval remain unverified by the forced-death rehearsals. Publisher recovery explicitly removed one abandoned lock owned by an already terminated sandbox child; it did not establish an automatic production stale-lock reclamation policy.
