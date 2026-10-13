# Recover a paused partial suggestion queue after Core recreation

Date: 2026-10-13 (Asia/Shanghai). Baseline `62b7feb`; exact Memory pin unchanged.

The existing fixed-Core suggestion consumer now recreates its Workspace after one acknowledged cursor step and an explicit pause. A fresh Session list/detail recovers the original run ID, paused state and cursor 1. Its preview retains exactly the original partial candidate observations; external setup stays off. Application is refused as `cancelled` while paused and the reread cursor remains 1. Resume uses the IDs read from the saved header, advances no cursor, and a separate local application completes the remaining suggestion. Ordinary edited review and another Core recreation still recover the completed job and approved content. The sole fake transport call is not replayed.

All 5 fixed-Core consumer tests, formatting and strict Clippy passed. This test-only slice reuses the unchanged frontend 69 tests, strict fixture checks, native-host 61 tests, pin/dependency guards and ordinary release build from this continuation. No production source, dependency or configuration changed.

The test closes and recreates an embedded Core within one process and reopens only its own temporary synthetic Vault. It does not establish desktop process restart, crash/power-loss durability, physical Windows/Narrator, real model/personal workflow, installed-artifact or human acceptance. No Provider HTTP, credentials, personal Vault, installer or Activity activation was used.
