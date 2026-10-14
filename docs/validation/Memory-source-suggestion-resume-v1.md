# Resume paused suggestions from the source view

Date: 2026-10-13 (Asia/Shanghai). Baseline `f7b4036`; Memory pin unchanged.

The source suggestion panel offered local application for an observed paused job, although Core refuses that application. The new fixture failed `paused_source_job_offers_resume_without_apply` before the change.

The source view now withholds application while paused and offers explicit Resume local queue. It reuses the saved-Session helper and exact Session/run IDs, rereads the saved preview, and requires another gesture to apply. Ambiguous resume receipts require observation rather than blind replay; an unmounted source starts no subsequent result read. Choice and Close remain held while work is admitted.

Validation: new browser fixture 9/9 ([record](Memory-source-suggestion-resume-browser.json)); affected queue recovery 14/14, batch lifetime 7/7 and saved resume 9/9. Frontend tests 69/69, TypeScript and strict fixture check passed. Native tests 61 host + 4 fixed-Core, formatting/Clippy, frontend and ordinary no-bundle desktop builds passed. Pin and dependency boundary checks passed (8 + 7 negatives).

All browser data and receipt timing are synthetic. Existing fixed-Core pause/resume coverage uses fake transport and an owned temporary Vault. No real Provider, personal Vault, credentials, Activity activation, installer, protocol/domain/pin change or human acceptance is claimed.
