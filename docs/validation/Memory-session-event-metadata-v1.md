# Readable saved Session event metadata

Date: 2026-10-15 (Asia/Shanghai). Baseline `fdfd29a14b6e7133e285eb9012d9200903cf9b1c`; Memory pin remains `8186aed861af08cf7a2c5d8c912a24eae51b4d66`.

Sessions now presents the nine pinned event kinds and five delivery states with readable labels, followed by the saved `occurredAt` time. Display uses the existing local-time formatter; the semantic time element and title retain the exact original ISO timestamp and offset. Unknown event/delivery values use fixed fallback labels. Missing or malformed timestamps show “time unavailable” instead of inventing a time or exposing arbitrary metadata. Message text, event order and local Mock output presentation are unchanged.

Failed refresh retains the last successfully observed metadata and each branch's unsent draft; a successful reread updates the observed timestamp without rewriting message text. This presentation adds no IPC or write operation and does not infer a Provider identity from an event kind.

Fresh verification passed: 90 frontend tests; TypeScript and strict new-fixture checking; five pinned-Core consumer tests, now also requiring the rendered transcript `occurredAt` field; Rust formatting/Clippy; frontend and no-bundle desktop build; Memory pin/dependency guards (8 + 7 negatives). The unchanged native adapter/host sources retain the 61 host tests freshly run on this date in the history-boundary slice.

The new Chrome fixture passed 9/9, including all canonical labels, exact ISO offsets, literal message bytes, fixed fallback labels, retained stale observations/drafts and fresh readback. Eleven related fixtures passed 152 further checks (161 total). [Browser summary](Memory-session-event-metadata-browser.json) records selected actual DOM results. These are synthetic browser/Core consumer checks, not physical Windows keyboard, Narrator, real Provider or Morii acceptance.

No personal Vault, Provider HTTP, credentials, Activity activation, installer or Memory-domain/pin change was introduced. Owner changes and manual status snapshots remain untouched.
