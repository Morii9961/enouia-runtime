# Bounded Session transcript display

Date: 2026-10-15 (Asia/Shanghai). Baseline `760ac5356855000d25b9fc74e556ece965058eda`; Memory pin unchanged at `8186aed861af08cf7a2c5d8c912a24eae51b4d66`.

The pinned Core's `session_detail` in `enouia-memory-workspace/src/lib.rs` returns the newest 200 events through `events.iter().rev().take(200).rev()`. Runtime previously rendered these without identifying that read boundary. A full returned page now has a note that it shows up to 200 recent saved events and that older events may be outside this view. The transcript references its note through `aria-describedby`. This does not infer a count of omitted/deleted events, add older-history paging or change Memory's retention.

The note describes the latest successful observation, so it remains accurate while the existing failed-refresh notice marks retained older data. A fresh short/empty read removes it and its accessible association. Event text/order and write behavior are unchanged.

Fresh verification passed: all 88 frontend tests; TypeScript and strict fixture checking; all 61 native host and five pinned-Core consumer tests; Rust formatting/Clippy; frontend/no-bundle desktop release build; Memory pin/dependency guards (8 + 7 negatives). The browser fixture passed 7/7 for full, failed replacement, short and empty observations plus ordering/association/read-only behavior. Six affected Session/suggestion fixtures passed 82 further checks (89 total); selected actual DOM results are in [browser summary](Memory-session-history-boundary-browser.json).

The boundary is verified from the exact pinned Core source; this slice does not create a 200-event real Vault or claim physical Windows/Narrator, real Provider or Morii acceptance. Browser records/replies are synthetic. No personal Vault, credentials, Activity activation, installer, Memory-domain/pin change or manual status snapshot was touched. Owner changes remain excluded.
