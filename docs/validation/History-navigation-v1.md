# History planning: previous-page navigation

Date: 2026-10-19 (Asia/Shanghai). Baseline `7dd0a0e`, branch `codex/history-plan-back-navigation`. Memory stays pinned at `976ef6b`, workspace IPC v1 with 48 commands. No native production source, permission, dependency or domain contract changes.

The original history surface could only move forward or replan from the beginning. It now retains a stack of previously issued Core cursors, offers **Previous history batches**, and displays the observed range. Returning to a page rereads Core; no source payload or page result is cached and no offset is fabricated. First-page reads use null, intermediate pages use the original Core cursor. A new first-page read resets navigation. Failed reads, changed bounds and the existing head/selection/Vault invalidation discard the stack.

Paging temporarily withholds old references and navigation. When a keyboard-owned paging button is replaced, completion focuses the new range; errors return owned focus to the fresh-plan control. Moving focus elsewhere is respected. Paging creates no task, grant, extraction, candidate or approved memory.

The actual component journey passed all 26 assertions, including first/last-page controls and range, backward request arguments, keyboard focus, pending/error withholding and first-page recovery without restoring old navigation. Full frontend regression passed 113 Node tests and 65 synthetic DOM journeys (878 assertions). Strict fixture and production TypeScript, runner syntax, whitespace and pin guard with eight negative cases passed. The final Windows GNU no-bundle build passed, with a 26.08-second native release step.

The real Windows/Core smoke passed [20/20 checks](History-navigation-native.json), adding three-page backtracking and keyboard focus checks to the prior history flow. Exact-byte report SHA-256: `d0e9c27e392cc1e83ff2271838470467f5460e5a7d62482f3d9ec2ccaeda1434`. Tested no-bundle executable SHA-256: `e4e9c40f01f8d9d224df6bbe0501b16cac1a45845b282e3b0ad1c754eacdfd68`. All inputs are generated synthetic fixtures; no personal input, credential, live Provider, installation or human acceptance is included. Unchanged native code/dependencies reuse the preceding [68 native tests, 7 pinned-Core consumers, strict Clippy and dependency evidence](History-planning-v1.md).

NSIS development packaging also passed, including all 26 ownership checks against the actual rendered template. Setup size is 9,611,526 bytes, SHA-256 `42a6fbbf5584ffe1f74c5f9f618cfdfc2734fb6093b1416f8c61c6f91bf0de01`, Authenticode `NotSigned`. The package was not executed or installed. This is still a development package, not a final v1 freeze.

The separate [local materialization scope](../integration/history-materialization-host-request-v1.md) is owner-approved for the following implementation slice. This navigation change neither creates those jobs nor adds a materialization command.
