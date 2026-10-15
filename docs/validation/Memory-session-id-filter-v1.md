# Locate saved Sessions and source runs by ID

Date: 2026-10-15 (Asia/Shanghai). Baseline `e0ca3b31a6c6e3677eefd68da52bb545991c41fe`; Memory pin remains `8186aed861af08cf7a2c5d8c912a24eae51b4d66`.

Source suggestion panels expose their saved Session/run IDs, but returning to Sessions required scanning shortened branch rows. Sessions now offers a labelled local filter over observed Session and branch IDs, including trimmed/case-insensitive full or partial IDs. A Session match retains all its branches; a branch match retains its original Session identity. Typing/clearing the filter issues no IPC and never opens a guessed ID. Explicit selection still reads the original observed branch through the existing identity guard.

Filtering leaves the selected detail, saved-run observation and per-branch unsent drafts intact. When that selection is outside the results, a note explains that it stays open. No-match results are distinguished from an empty/unobserved workspace. Failed list reads retain the filter and prior observed rows under the existing stale-read notice; successful list replacement reapplies it. Clear restores the full observed list and returns focus to the labelled input. Branch reads, Provider preparation/sending and saved queue writes disable the filter through the existing ownership state. A memoized derived list avoids refiltering on unrelated draft edits.

Fresh verification passed: all 88 frontend tests; TypeScript and strict new/affected fixture checking; frontend/no-bundle desktop build; Memory pin/dependency guards (8 + 7 negatives). Unchanged native/Core sources, dependencies and pin retain the 61 host + five consumer tests and formatting/Clippy freshly run in the preceding history-boundary slice on this date.

The new Chrome fixture passed 11/11, including ID-to-saved-run readback, no filter IPC, ambiguous/empty-list distinctions, draft/selection/focus retention, replacement reads and pending-read guards. Ten affected fixtures passed 141 further checks (152 total). Existing Provider and queue-owner assertions additionally verify that the new control is disabled while their writes own the session. [Browser summary](Memory-session-id-filter-browser.json) preserves selected actual DOM results. These are synthetic interaction/focus checks; changed focus order does not inherit earlier physical Windows keyboard/Narrator acceptance.

No personal Vault, Provider HTTP, credentials, Activity activation, installer, Memory-domain/pin change or private ID-recovery cache was introduced. Owner changes and manual status snapshots remain untouched.
