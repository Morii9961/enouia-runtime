# Saved suggestion recovery after embedded Core recreation

Date: 2026-10-13 (Asia/Shanghai). Baseline `dca57a4`; exact Memory pin unchanged.

The source suggestion panel now names the Core-issued Session and run IDs, with full IDs in its title, and directs later recovery through saved Sessions. Current source resume/identity checks pass 10/10 ([record](Memory-core-reopen-browser.json)); the original 9-check resume report remains historical.

Runtime's existing fixed-Core suggestion consumer test now shuts down that embedded Workspace, replaces it with a fresh default-config Workspace, and opens only the same test-owned temporary Vault through the picker-token path. The new instance has no external setup or operation table. A fresh Session list/detail recovers the same completed job, cursor 2 and candidate IDs. Saved preview recovers current candidate/review metadata and the original proposals; the memory list retains the edited approved content. The original fake transport count remains exactly one.

All 5 consumer tests, formatting/strict Clippy, frontend tests 69/69, TypeScript/strict affected-fixture checks, frontend and ordinary no-bundle desktop build, and pin/dependency checks (8 + 7 negatives) pass. Unchanged native-host 61 tests reuse this turn's successful full run. Neither Runtime's host nor Memory production source/pin was changed.

This establishes graceful in-process embedded-Core recreation and synthetic Vault readback. It does not establish desktop process restart, crash/power-loss durability, physical Windows/Narrator, installed artifacts, personal workflow, real Provider/key use or human acceptance. No system shutdown, installer, Activity activation or private recovery cache was introduced.
