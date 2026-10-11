# Staged Activity package-choice saves

Date: 2026-10-10. Baseline: merged PR #28, `7eb401587ff10da99c40e2546a3f31aa09c15a41`. This changes only the desktop's saved package choice. Activity's producer/store, IPC, scheduler and Memory pin are unchanged. J1/B4 remain partial and B5 inactive.

The previous writer used `std::fs::write` on the live settings path. Its truncate-before-write step could destroy the previous choice if writing stopped partway through. The prior [write-sharing drill](Activity-claude-choice-write-2026-10-10.md) refused opening the file before truncation; it did not exercise this boundary.

## Behavior

The host now creates a unique same-directory staging file with `create_new`, writes the complete bounded absolute choice, flushes it with `sync_all`, closes it and renames it over the live settings file. It never falls back to an in-place write. Ordinary write, flush or replacement failure returns `saved: false` and removes only that attempt's staging file. The connected package remains available for the current window, as before.

A killed process can leave a staging file. Startup reads only the exact `activity-install.json` path, so it retains the previous choice and ignores that remnant. A later successful save does not remove another attempt's remnant. This is a settings-file replacement on the tested local Windows filesystem; it does not establish power-loss durability or Activity-store recovery.

## Evidence

The [hashed proof](Activity-atomic-choice/proof.json) binds four fresh native reports to a frozen copy of the desktop produced by the unsigned NSIS build. The native suite runs serially, with a fresh synthetic package, settings file, WebView profile and owned processes for each mode.

| Actual native scope | Result |
| --- | --- |
| [Read/write sharing allowed, replacement refused](Activity-atomic-choice/replacement.json) | 18/18 |
| [Existing write-sharing refusal](Activity-atomic-choice/write.json) | 16/16 |
| [Directory blocking the settings filename](Activity-atomic-choice/directory.json) | 16/16 |
| [Actual actions and pinned-Core isolation](Activity-atomic-choice/actions.json) | 35/35 |

The replacement drill proves that opening for write remains possible while the real picker save returns `saved: false`. Exact old settings and three-source history survive, and the attempt leaves no staging file. Release allows a canonical replacement and a restart reconnects it. Existing write refusal and directory failure also recover without changing the Activity store.

The [Rust test record](Activity-atomic-choice/tests.json) comes from the complete **40 host + 3 pinned-Core** test run. One host entry is the child-test entry point. Four behavioral tests cover:

- A controlled `WriteZero` after a partial staging write, preserving old bytes and allowing retry.
- Actual termination of an owned Rust test subprocess at three deterministic boundaries: the legacy truncate/partial-write control loses its old choice; partial and fully flushed staging writes preserve it. Retained staging bytes remain untouched by a later successful save.
- A real Windows reader sharing read/write but refusing delete, with exact old bytes and successful retry after release.
- A reader sharing deletion keeps its complete old-file snapshot while a new open reads the new choice.

The process-death cases exercise the same settings helper inside a test subprocess. They do not terminate the desktop mid-save. `WriteZero` is injected; actual disk-full and flush failure are not tested.

Fresh checks also pass desktop fmt/clippy, strict TypeScript/build, 58 frontend tests, native release and unsigned NSIS builds, 26/26 rendered/source installer checks, Memory guard with 8 negative checks, and resolved domain guard with 7 negative checks. The sandbox-only SSR loading failure is retained in tool output; the same source/dependencies passed 58/58 in the normal host environment without a frontend change.

The C17 index gains 22 selectors (18 native replacement checks and 4 behavioral Rust tests): **61 reports / 990 selectors / 63 negative checks**. Regression scopes overlap and these counts are not full acceptance. All 18 matrix rows retain their gaps.

No personal settings, Vault/archive, account, credentials, task or server was used. The installer was built, not installed, signed or published. Real storage exhaustion/power loss, long-running contention and production remain outside this evidence.
