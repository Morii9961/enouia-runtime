# Activity actual concurrent paused-run admission

Date: 2026-10-09. Scope: native host admission of simultaneous run-now/retry-pending requests on a paused synthetic installed producer. B4/J1 remain partial; B5 inactive.

The harness requires an actual pause acknowledgement and verifies paused overview before sending any run pair. Ten pairs invoke both real native commands concurrently, alternating their submission order. Each pair accepts exactly one unique run and refuses the other with retryable busy. Its accepted record reaches a blocked paused no-work outcome with the same run ID and operation. Completion permits the next pair to enter; all ten correlated records remain readable.

After every pair, the complete paused store is byte-identical. Actual resume succeeds at the end; archive, sequence and pending hashes remain exact, and pause/resume alone add two generations. The owned saved-choice file is actually cleared. [Raw native report](Activity-unified/run-admission-native.json): **37/37**. [Hashed proof](Activity-unified/run-admission-proof.json) links all assertions to C17. This mode creates no Vault, changes no ACL, registers no task and executes no collector or delivery while paused. It is a bounded ten-pair host-admission rehearsal, not sustained stress, active-run eviction or unpaused collection/delivery overlap.

Fresh checks: native 37/37, harness syntax, Memory/domain guards, whitespace and **48 reports / 716 selectors / 50 negative evidence checks**. Product code/binaries/lockfiles/pin are unchanged. Prior 57 frontend tests, strict build, 34+3 host/Core tests, fmt/clippy, 25/25 selection recovery, 35/35 actual-operation isolation and 26 installer checks are reused. The installer is built, not installed, signed or published.

Memory remains pinned to ff692ccb6fbc1c387254d5ffbef41b105eeb2a84. Logon/power, remaining storage faults, sustained stress and real-account/production gates remain open. No personal Vault/archive, existing/production task, credential, public upload, server or Moriium source changes.
