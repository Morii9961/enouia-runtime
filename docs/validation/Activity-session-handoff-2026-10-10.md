# Activity session handback

Date: 2026-10-10. Latest product baseline: `588d5922e49a6fee3416e028761c6b6dc90c2b71`. Branch: `codex/activity-choice-atomic-save`. [PR #29](https://github.com/Morii9961/enouia-runtime/pull/29) remains a draft; main is not merged.

This continuation adds five verified fixes after the earlier eight-fix review: future ages remain unknown; saved-choice clearing refuses false success under hidden file existence; schedule decoration rejects malformed containers before a worker panic; day conversion validates the requested series before filtering; and requested-source units/day boundaries are checked before metadata is discarded. Each product slice was verified, committed with the required Codex trailer and pushed.

| Evidence | Current scope |
| --- | --- |
| Frontend | 63 tests, reused with unchanged model/client source identities |
| Native host/Core | Fresh 54 host + 3 pinned-Core tests; fmt/clippy |
| Latest frozen desktop | `fc243915ec135ff24477addc0bbcfd41a7bcefd00175106749cc3b0176352312` |
| Latest native drills | 36/36 source metadata, 49/49 day-series, 35/35 actual producer/Core actions |
| Packaging/guards | Strict TypeScript/build, unsigned NSIS, 26 ownership checks, Memory/domain guards with 8/7 negatives |
| Evidence index | 72 reports, 1,267 linked selectors, 79 executed negative checks; all 18 rows partial |

The [closing source audit](Activity-final-review/closing-source-receipts.json) rechecks 52 recorded source receipts against their exact Git blobs, matches all 72 indexed report hashes to the product baseline, and confirms the frozen desktop/runner bytes. It adds zero B4 selectors. The earlier 83-check cumulative review belongs to its original eight-fix executable; it was not relabelled as a test of later builds.

Memory remains pinned at `ff692ccb6fbc1c387254d5ffbef41b105eeb2a84`; Memory domain, adapter, surfaces and dependencies were not changed here. Activity producer/store and IPC schemas also remain unchanged. Controlled-runner drills use actual native IPC and newly owned sandbox packages; their original executable, manifest, saved choice and Activity store are restored/preserved as each report states. Original permission descriptors and bytes restore exactly in the clear-denial drill. Owned fixtures and frozen executables remain under ignored `target` and temporary directories.

Continuation stays within the Runtime Activity/frontend scope. Review [B4 coverage](B4-coverage.md) and the dated follow-ups before claiming a broader acceptance result. Remaining real storage/power-loss, physical accessibility/input, personal-data and production cutover gates require their own evidence and authorization. J1/B4 remain partial and B5 is inactive. A Memory pin bump or new shell/installer integration stage starts only when the owner asks for it; this handback does not activate any such stage.
