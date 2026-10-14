# Explicitly resume a saved local suggestion queue

Date: 2026-10-12 (Asia/Shanghai). Baseline `d21c9a7`; Memory pin unchanged.

The saved suggestion view withheld application for a paused job but had no way to resume it. The new fixture first failed `observed_paused_job_has_explicit_resume`.

A successfully observed paused job now offers Resume local queue. It calls the existing `extraction_pause` command with the exact saved Session/run IDs and `paused: false`, then rereads the saved preview. Resuming neither sends to a model nor applies candidates; a separate gesture decides whether to add remaining suggestions. Session/job ownership and dismissal remain held during the change. An ambiguous resume receipt or result read offers reobservation instead of replaying the change, and page lifetime prevents later reads/publication after unmount.

Validation:

- `e2e/suggestion-resume.html`: 9/9; [record](Memory-suggestion-resume-browser.json). Explicit paused action, held selection/close, lost retryable resume receipt, no blind Retry, saved read observing ready state without another mutation, no candidate application, successful parent refresh, exact IDs and local-only commands, settled close.
- Saved application 13/13 and batch lifetime 7/7 passed after sharing the resume ownership path.
- Fixed-Core synthetic consumer test with native Provider setup removed pauses at cursor 1, reads that cursor, confirms application is refused as cancelled, resumes to `ready` without changing cursor or the one fake transport call, then explicitly completes local application. Full native tests 61 host + 4 Core, formatting and strict Clippy passed.
- Frontend tests 69/69, TypeScript, strict affected-fixture checks and frontend/ordinary release desktop builds passed. Integration pin/dependency checks passed (8 + 7 negatives).

All data and receipt behavior are synthetic. The fixture checks actual candidate rows rather than counting explanatory text as records. No real Provider, personal Vault, credentials, HTTP, installer, Activity, domain/pin change or human acceptance is claimed.
