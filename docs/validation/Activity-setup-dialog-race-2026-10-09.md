# Activity selection confirmed after a run starts

Date: 2026-10-09. B4/J1 remain partial; B5 inactive.

The prior [setup guard report](Activity-setup-running-2026-10-09.md) did not exercise the post-dialog recheck. This [fresh actual native interleaving](Activity-unified/setup-dialog-race-native.json) passes **15/15** on the unchanged desktop.

The harness first observes the actual folder picker belonging to its own desktop PID, with the native selection promise unresolved. It then admits a real Activity run and observes owned eight-second stand-in readiness and the same run's running status. Confirming the same valid package in that existing picker returns `busy`; exact saved-choice bytes remain intact. Further select/clear attempts refuse, status reads remain available and that same run is still active. Terminal completion retains actual pending sequence 88 and permits ordinary picker cancellation and clear. No reply is modeled.

[Hashed proof](Activity-unified/setup-dialog-race-proof.json) binds the raw report, new harness, unchanged desktop/installer/runner and known helper identities. The fixture is newly marked and scoped, the origin is loopback-only and the existing SSH/descendant stand-ins expire normally. No real receiver/account or personal Vault is used. This verifies one bounded interleaving; it does not establish every admission race or sustained concurrency.

Fresh syntax, whitespace and evidence integrity pass **54 reports / 810 selectors / 56 negatives**. Unchanged frontend 58, host/Core 34+3, build/fmt/clippy, installer 26 and actual-action 35 checks from the prior slice are reused. Fifteen selectors overlap earlier checks and are not a full acceptance total. All 18 rows remain partial. No Memory pin/domain, scheduler, credentials, existing task, server or Moriium source change.
