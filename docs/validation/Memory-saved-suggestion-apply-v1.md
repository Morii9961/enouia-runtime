# Continue local queue application from a saved Session job

Date: 2026-10-12 (Asia/Shanghai). Baseline `9a761df`; Memory pin unchanged.

The saved Session suggestion view could read a response but could not continue its unfinished local queue application. The new mounted Sessions fixture first failed `observed_saved_job_can_apply_remaining`.

After a successful observation, the owner can explicitly add remaining suggestions to the ordinary review queue. The bounded application helper is shared with the source panel and uses only existing Core `extraction_apply`/`extraction_preview` commands. It captures the saved Session/run IDs, processes cursor steps and rereads the result. Provider setup, a key and a new model request are not needed. Nothing becomes an approved memory here.

An admitted application holds the selected job and Session: other job reads, dismissal, branch switches, new sessions, local Mock/checkpoint writes and external Provider controls wait. A failure after a committed step retains the preceding preview with an explicit previous-observation label; the application loop has no blind Retry and another batch requires a successful read. Success refreshes the original Session. A failed parent detail refresh still blocks subsequent writes until its existing read recovery succeeds. Completed or paused jobs do not offer another application action.

Validation:

- `e2e/saved-suggestion-apply.html`: 13/13; [record](Memory-saved-suggestion-apply-browser.json). Held write/owner guards, blocked programmatic submission, simulated committed step with lost retryable receipt, no optimistic second candidate, read-only completion recovery, two remaining synthetic steps, original-Session refresh failure/recovery, no sending/approval and settled dismissal.
- Saved read recovery 10/10, source application recovery 14/14 and Provider Session ownership 18/18 passed with the shared helper and additional Session ownership guard.
- Real pinned-Core consumer test disables native Provider setup after cursor 1 and then locally completes remaining application, reads current candidate metadata and performs explicit ordinary review. Fake transport count remains one. Full native tests 61 host + 4 Core, formatting and strict Clippy passed.
- Frontend 69 tests, TypeScript, strict affected-fixture checks and frontend/ordinary release desktop builds passed. Pin and dependency boundary checks passed (8 + 7 negatives).

All data, secrets and transport responses are owned synthetic fixtures. Receipt loss is simulated, not storage corruption/power-loss proof. No real Provider, personal Vault, credentials, installer, installed Activity, deployment or human acceptance is claimed. The earlier saved-read report retains its original read-only baseline.
