# Cumulative Activity keyboard and feedback review

Date: 2026-10-10. Product baseline: `3cc9354a01afeef256ffaf91e84c0294dbd6b269`, containing the eight Activity adapter, frontend and evidence fixes in PR #29. This follow-up changes no product source and adds no B4 selector or acceptance gate.

The [proof](Activity-final-review/proof.json) records five fresh journeys on the final frozen desktop `8af3a06d1a6c38091215b96928c1883f855f3d3f18cd1c00d2d336518df604b5`. Its SHA-256 is `47547c7f2de02b9e035687032c8ecf50645a38acd56afa0dadbac1169dc9e1f3`. Raw report hashes were checked, all 83 checks pass, every process returns exit code zero, and every package manifest remains exact. Eleven product/host/harness file digests match the exact committed baseline bytes. The frozen executable remains unchanged throughout.

| Journey | Result | Evidence scope |
| --- | --- | --- |
| [Keyboard actions](Activity-final-review/keyboard.json) | 11/11 | Actual owned producer: surface shortcut, skip link, native package picker, recorded days, public preview, durable pause/resume, run, exact pending retry, refresh and forget |
| [All recorded days](Activity-final-review/days.json) | 16/16 | Keyboard expansion and exact full histories for all three sources, followed by the existing action flow |
| [Copy feedback](Activity-final-review/copy.json) | 22/22 | Modeled clipboard completions and delayed read delivery; actual healthy setup and source recovery; exact retained store and choice |
| [Independent errors](Activity-final-review/errors.json) | 23/23 | Modeled read/run-status failures and recovery, including equal and distinct messages; no actual run mutation |
| [Polling lifecycle](Activity-final-review/poll.json) | 11/11 | Modeled transient failures reach the 30-second backoff ceiling, retain one start and one run ID, recover, and discard a late response after unmount |

The keyboard screenshot was inspected: refresh retains failed history, pending sequence and exact retry feedback. Keyboard input is injected through CDP in the owned window; this does not establish physical keyboard, foreground hotkey or full accessibility acceptance. The clipboard substitution changes no real clipboard content. Keyboard/action fixtures use only synthetic data and loopback transport, without creating a scheduled task.

The same desktop already has [16/16 date precision, 18/18 sequence boundaries and 35/35 actual producer/Core action evidence](Activity-date-only-2026-10-10.md), plus 62 frontend tests. The proof hashes these current frontend/date records and the reused 47 host + 3 Core test record. Rust source, Cargo files and Memory pin are unchanged; fresh Memory/domain checks still have 8/7 negatives. Native/unsigned NSIS build and 26 installer ownership checks belong to the same frozen build.

These are cumulative regressions of previously indexed behavior, so they contribute zero new B4 selectors. The [index](B4-coverage.md) stays at 67 reports / 1,117 linked selectors / 74 negative checks; all 18 rows remain partial. J1/B4 are not signed off and B5 is inactive. No personal Vault, data, accounts, credentials, live delivery, installation, signing or deployment was involved.
