# Session and branch observation identity

Date: 2026-10-14 (Asia/Shanghai). Baseline `4f33be46fcf83e405f3ecceb5297f98b98839c95`; Memory pin remains `8186aed861af08cf7a2c5d8c912a24eae51b4d66`.

Sessions previously published a `session_detail` result under the requested branch without checking the returned session/branch IDs. The controlled wrong-session reply failed `wrong_session_cannot_publish_or_enable_writes` against that baseline. This is a frontend boundary reproduction, not evidence that the pinned Core produces wrong identities.

The reader now matches both returned identities before publishing selection, transcript or inspector data. A missing or mismatched identity follows the existing failed-read path: writes stay blocked, the previous successful transcript is explicitly labeled as such, both unsent drafts survive, and Read session again targets the requested branch. Recovery only reads; it does not replay a question, checkpoint, Provider action or suggestion application. Existing synthetic Sessions fixtures now carry the identity fields actually returned by the pinned Core.

Validation: [synthetic browser record](Memory-session-observation-identity-browser.json), 11/11 checks, covers wrong session, wrong branch, missing identities, recovery, failed replacement, retained drafts, blocked writes and failed branch-switch recovery. Affected browser fixtures passed: Provider/session ownership 18/18, saved suggestions 10/10, saved local application 17/17 and ordinary review journey 15/15. The fixed-Core consumer independently asserts session/branch identity before and after a checkpoint; all 5 Core consumers passed using owned temporary Vaults. The earlier [session recovery report](Memory-session-observation-v1.md) retains its original baseline and checks.

TypeScript, strict checks of the 5 affected browser fixtures, all 69 frontend tests, Rust formatting/strict Clippy, the frontend/ordinary no-bundle desktop release build and pin/dependency guards (8 + 7 negative cases) passed. Unchanged native host code reuses the earlier 61-test evidence in the [continuation handoff](../PROVIDER_RUNTIME_HANDOFF_2026-10-13.md). The release includes this identity guard; no installer was built or run.

All browser records and timing are synthetic. No personal Vault, real Provider HTTP, credentials, Memory domain/protocol/pin change, Activity activation, installer, physical Windows/Narrator acceptance or Morii acceptance occurred. Unrelated owner changes and manual status snapshots were preserved.
