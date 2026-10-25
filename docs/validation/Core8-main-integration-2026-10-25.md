# Core-8 main integration

2026-10-25. Morii explicitly authorized merging all completed refactor changes.

This integration starts from Runtime main `62ecc93` and preserves the merged
history planning/results/comparison/brief consumers, native Provider settings,
Usage runner and atomic child jobs. It merges Core-8 `f3706c4` without touching
Claude exploration trees or the original checkout. Memory is pinned only after
its Core-1..7 integration with main is verified and published.

The workspace v1 catalog is retained at 58 commands. The automatic Memory
capability remains opt-in, main-window-only, isolated and synthetic; existing
Context/Sessions/Provider/Quick Search routes retain their v1 roots and meaning.
No private library is opened, initialized, reset, migrated or replaced. No real
Provider/embedding, deployment, source capture or production activation occurs.

## Verification

Memory pin: `bf6bfd10bf3c870ae2ce7ceb5c6bd635b08bf327`, merged in
[Memory #55](https://github.com/Morii9961/enouia-memory/pull/55) as
`c9bf1be7819dba19915adf6031b1900c032b73d1`. Its tested tree equals the merge
tree. Surface aggregate:
`01cfc998a6707897b1956ef31248dbd44102578440ff558095ab5566917f5b82`.
The earlier Core-8 report remains evidence for its original pin; it does not
substitute for these integrated results.

- Pinned/offline/locked Rust: 79 unit/adapter tests and 8 Core consumer tests
  passed; one existing manual Usage-runner test remains explicitly ignored
  because its independently built runner is outside this Memory slice.
  Fmt and clippy all-targets with warnings denied passed.
- Initial consumer run: the old fake OpenAI response lacked the response ID and
  object required by the preserved upstream Provider hardening, so one history
  test failed. Added the same synthetic identity/error shape used by Core's
  existing fixture; focused regression and full rerun passed. Product validation,
  original confirmation flow and one-send/credential assertions stay intact.
- Frontend: type check, 161 Node tests, 76 DOM journeys / 1030 assertions passed.
  Production frontend assets/debug native executable built after Cargo gates.
- Final real owned-process/window smoke: 18/18 passed, with real Tauri IPC and
  pinned Core transactions on fresh temporary synthetic roots. Reads, explicit
  sources, qualified recall, unchanged CURRENT, lock refusal, hidden-window
  background survival, worker joins and fresh-root restart are covered.
- Pin/manifest/lock/committed-surface self-test: 8 negative cases passed.
  Desktop metadata/domain boundaries: 9 Memory packages at the same exact SHA,
  7 negative cases passed. All 446 upstream registry package blocks remain
  identical; restored four resolver-only dependency-edge movements. Only the
  Memory Host package is added. No root domain dependency or path/patch added.
- Public content, owned-file allowlist, conflict markers and whitespace checked.
  No shared frontend App/router/token, AGENTS or manual status snapshot changes.

Native screenshots/process logs and full check logs remain ignored synthetic
validation evidence. No release/installer, physical tray/Narrator/sign-in, real
model quality, private-data acceptance, migration or deployment is implied.

## Activation boundary

Code integration completes the bounded engineering/synthetic route, not the
entire production memory goal. Keep existing v1 data and approval provenance.
A new-format personal library requires separately selected source scope,
identity/capture, model/budget policy, independent recovery and migration/fencing
validation. Do not run legacy init over an existing root or pretend old
candidates were owner approved. No initialization is performed by this merge.
