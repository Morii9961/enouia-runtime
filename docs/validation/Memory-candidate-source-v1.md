# Read candidate evidence before approval

Date: 2026-10-13 (Asia/Shanghai). Baseline `34bcab2`; exact Memory pin unchanged.

Inbox previously displayed citation IDs without a source reader. The new fixture failed `candidate_offers_explicit_evidence_source_read` against that baseline.

Each candidate now shows its original evidence locator and offers explicit local source reading by exact source ID/revision, in bounded 4096-byte parts. Citation locators remain unchanged data, not guessed offsets into the Core's reconstructed excerpt text. Availability remains unknown until reading; missing/error observations have explicit rereading, and hiding or changing the candidate/source revision invalidates late replies. Source text is literal and labelled as data. This reader neither offers model extraction nor changes ordinary plan/confirmation review.

Validation:

- Evidence fixture 12/12; paging regression 13/13 ([record](Memory-candidate-source-browser.json)): exact revision/budget, original locator, initial unknown availability, nonretryable error recovery, literal HTML-looking text, bounded paging, stale reply rejection, hide/read recovery and local-only command traces.
- Paging regression exposed an intermittent focus race: a previous render's passive effect could clear a newly admitted read's focus target. Inbox now checks the live pending-read flag before consuming that target. Final paging checks pass both last-page title focus and respect for focus deliberately moved to an unsent draft. The original 12-check report remains historical.
- The fixed-Core consumer test additionally reads a pending candidate's actual cited source before approval, verifies ID/revision, locator/support fields and untrusted text, and confirms the candidate remains pending. All 5 consumer tests, formatting and strict Clippy passed; this turn's unchanged 61 host tests are reused.
- Frontend tests 69/69, TypeScript and strict affected-fixture checks, frontend and ordinary no-bundle desktop builds passed. Pin/dependency checks passed (8 + 7 negatives).

All data is synthetic and Core tests use owned temporary Vaults. No real storage-error recovery, personal Vault, credentials/Provider HTTP, human acceptance, installer, Activity activation, protocol/domain/pin change or locator-to-excerpt semantic conversion is claimed.
