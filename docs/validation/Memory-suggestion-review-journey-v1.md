# Saved suggestion to ordinary review journey

Date: 2026-10-13 (Asia/Shanghai). Baseline `81be992`; exact Memory pin unchanged.

Successfully observed saved suggestions with pending candidates offer Open candidate inbox. The native App opens Memory's inbox and focuses its title. It does not select a review decision or write anything. The inbox shows candidate ID/revision to match the original suggestion; it still contains other runs' pending candidates. Busy/unobserved job or Session state withholds this route. Returning to Sessions starts a fresh saved observation, without a private job/request cache.

Validation: mounted-App synthetic journey 14/14 ([record](Memory-suggestion-review-journey-browser.json)): saved read, explicit navigation, candidate identity and title focus, cited source reading, edited plan and separate confirmation, held dismissal, receipt loss with identical confirmation payload/key retry, approved content read separate from original proposal, return/reset, accepted-state reread and no send/re-extraction/application. Related saved application fixture 17/17 covers route guards during application, after ambiguity and after parent Session read failure; saved reads 10/10 pass.

Frontend tests 69/69, TypeScript/strict fixture checks, native tests 61 host + 5 fixed-Core, formatting/Clippy, pin/dependency guards (8 + 7 negatives), frontend and ordinary no-bundle desktop builds passed. Existing fixed-Core consumer coverage separately verifies actual pending-source reading, edited approval and fresh suggestion candidate state. No backend source or pin changed.

Browser replies and receipt loss are synthetic. This is frontend journey evidence, not native physical input/Narrator, real Core receipt-loss/restart, model fidelity, personal workflow or human acceptance. No real Provider, credentials, personal Vault, Activity activation or installer was used.
