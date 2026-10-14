# Context capsule and request reobservation

Date: 2026-10-13 (Asia/Shanghai). Baseline `eb80874`; exact Memory pin unchanged.

Context previously published opaque capsule/request replies directly and relied on retryable errors for recovery. A controlled wrong-capsule reply failed `another_capsule_is_not_the_selected_observation` against that baseline.

Saved capsule reads now match both capsule/inspection IDs and offer an explicit local reread. Dispatch reads match dispatch/capsule IDs, require a boolean verification flag, and compare a claimed verified hash with the observed dispatch hash. A legitimate `verified: false` result still shows its hash-mismatch status. Manual request rereading is available after nonretryable failure. Capsule refresh discards old requests/dispatch selection while preserving the unsent query; existing latest-read ownership ignores earlier dispatch replies. Unknown delivery states use a fixed label, never inherited object entries.

Validation: synthetic browser 14/14 ([record](Memory-context-observation-browser.json)) covers wrong capsule/inspection, wrong dispatch/capsule/hash/verification type, legitimate hash mismatch, valid recovery, out-of-order reads, failed capsule replacement, retained draft, fresh request selection, unknown delivery label and an entirely read-only trace. Fixed-Core consumer assertions independently verify the actual capsule/inspection, dispatch/capsule IDs and stored request hash used by these guards.

Frontend 69 tests, TypeScript/strict fixture checks, all 5 fixed-Core consumers, formatting/strict Clippy, frontend/ordinary no-bundle desktop build and pin/dependency checks (8 + 7 negatives) passed. Unchanged 61 host checks reuse earlier verified evidence. No Memory production source, command or protocol changed.

Wrong replies and delivery timing are controlled. This is not real Provider, personal Vault, storage-fault/crash recovery, native physical input/Narrator, installed-artifact or human acceptance. No new preview, send, credentials, installer or Activity activation is performed by the recovery actions.
