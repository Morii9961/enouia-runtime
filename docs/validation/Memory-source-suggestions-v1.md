# Source range ownership and current candidate observations

Date: 2026-10-12 (Asia/Shanghai). Baseline `6adb85e`; Memory pin unchanged.

Next part could remove the suggestion panel while its prepare/send/application action was pending. The mounted Source now receives the child's busy state and withholds excerpt paging until admitted work and its result observation settle. A settled review can be dismissed, then a fresh request uses the newly shown byte range and source revision. This guard is local to excerpt paging; it does not claim to prevent every app navigation or retain an extraction job across process restarts.

Suggestion preview now keeps the original proposal and its quoted source literal, and separately shows the candidate ID, revision and current Core status. If the current candidate content differs, it is shown with its own label. Accepted/rejected candidates are not described as still in a pending queue. A suppressed item with no current candidate reports that no candidate was recorded. These fields already exist in the exact pin's `workspace/src/native.rs::extraction_preview`; no contract or domain change was needed.

Validation:

- `e2e/source-suggestions.html`: 12/12; [record](Memory-source-suggestions-browser.json). The initial fixture failed `held_prepare_keeps_excerpt_selected`. The final fixture waits for state publication before testing held prepare, disabled paging/no extra excerpt read, dismissal, the next exact range, held send admission, running-call ownership, literal original proposal, a separately edited accepted candidate, suppression, terminal release and no automatic application/resend.
- Extraction queue recovery rerun: 14/14. Its pending candidate fixture now includes the full candidate metadata and checks the neutral candidate label. The prior report retains its original revision.
- TypeScript, strict changed-fixture checks, all 69 frontend tests and frontend/ordinary release desktop builds passed. Native/backend and dependency-boundary evidence from [cancellation verification](Memory-operation-cancel-ack-v1.md) is reused because those sources and dependencies are unchanged.

All displayed data and transport responses are synthetic. No real source, personal Vault, Provider HTTP, credentials or human acceptance is claimed.
