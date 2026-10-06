# Operation feedback — local evidence

Date: 2026-10-06. Baseline: `05351da`. Scope: Runtime frontend and its synthetic Windows acceptance harness. Memory remains pinned at `a181308b3496c07281c1030cc53b7c9f1bbb7705`.

The operation view used to retain its previous status when a new operation ID arrived, briefly showing an earlier completion or cancellation. It also offered Cancel for verification and backup although those pinned workers do not observe cancellation. Each operation ID now owns a fresh watcher, retry and cancellation state. Active import, import resume and index rebuild offer cooperative cancellation; the request stays distinct from Core's terminal cancellation. Other active workers explain that they finish before locking or exiting. Progress reaching its total still does not imply success.

The rendering test covers queued/running cooperative operations, requested cancellation, all terminal states, verification/backup without Cancel, and full progress that remains running. No dependency, native adapter, Core contract or data format changes.

| Check | Result |
|---|---|
| Frontend type checking and React/client suite | Pass; 14 tests |
| Locked offline host/Core tests and Clippy with warnings denied | Pass; 19 host unit tests and 3 pinned-Core integration tests; formatting remains clean |
| Domain and fixed-pin/surface checks | Pass; 7 and 8 negative checks respectively |
| Embedded-assets Windows GNU release | Pass; no installer |
| Ownership-checked full regression | 61/61 pass on a fresh synthetic Vault, nine screenshots and zero autofill rows |
| Final focused operations and foreign-listener refusal | 9/9 pass on another fresh synthetic Vault; two screenshots |

The full report precedes adding the standalone foreign-listener negative assertion to full mode; future full runs include that additional check. The final focused run executes the same negative assertion.

Native acceptance uses 500 synthetic Runtime export sessions. The real import is cancelled through its button, Core reports `cancelled`, and Resume finishes with exactly 500 sources. A held real observation proves that a new operation does not show the preceding cancellation while awaiting its own status. Verification runs in the real Core; a synthetic read-error delivery proves the visible Retry path can recover its actual clean terminal result. This injected read failure is frontend evidence, not an actual storage failure. The test does not slow or modify a Core worker.

The harness observes only its own top-level native dialog and descendants. An earlier run timed out while recursively walking all desktop descendants; the focused dialog lookup passed. One full regression lost overlay focus after the first query and correctly cleared its query/results; that incomplete run is not counted as a passing regression. A later attempt found another instance on the fixed debugging port and stopped at the no-Vault check. The harness now chooses temporary loopback ports, verifies each listener's process ancestry belongs to its spawned host before attaching CDP, and closes every debug session on failure. A negative test rejects an unrelated Node listener. The passing regression uses the ownership-checked connection.

No personal data, cloud Provider, migration, production Activity, installed artifact or production activation was used. This does not prove arbitrary cancellation timing, cancellation of non-cooperative workers, long verify/backup exit latency, real disk error recovery, Narrator or contrast-theme acceptance. Paging and remaining W01–W05 paths are separate gates.

Release executable SHA-256: `c7dafb808f7e20808bc7bfb29ce04dbba41e7c399579123f4ecb83cdbb3d2b00`.
