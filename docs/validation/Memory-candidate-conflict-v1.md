# Observe conflicting memories before review

Date: 2026-10-13 (Asia/Shanghai). Baseline `9e815b3`; Memory pin unchanged.

Candidate rows previously displayed only a conflict count. They now retain each Core conflict's memory ID and reported revision and explicitly read its current saved record with `memory_read`. Current revision/status/content are observations, not the historical conflict revision; a changed revision is labelled without claiming resolution. Failed reads, hiding and revised candidate rows invalidate old content and late replies. Reading never merges, approves or prepares a model request.

Validation: synthetic browser 9/9 ([record](Memory-candidate-conflict-browser.json)) covers unknown current state, nonretryable read recovery, recorded r1 versus current r2, literal content/status, pending clearing, hide and revised-row late replies, exact referenced ID and read-only trace. The complete mounted-App review journey also passes 14/14.

Fixed-Core consumer coverage creates an actual contradictory candidate for an existing approved claim, verifies the conflict's `memory_id`, `revision` and `conflict_group_id`, reads that saved memory and rejects the synthetic proposal through ordinary review. All 5 consumer tests, formatting and strict Clippy pass. The unchanged 61 host tests reuse this turn's successful full run. Frontend tests 69/69, TypeScript/strict fixture check, frontend/ordinary no-bundle desktop build and pin/dependency checks (8 + 7 negatives) pass.

Browser state/error timing is synthetic; Core checks use owned temporary Vaults. No real storage failure, personal data, credentials/Provider HTTP, automatic conflict resolution, human acceptance, installer, Activity activation or Memory domain/protocol/pin change is claimed.
