# Read saved source suggestions from Sessions

Date: 2026-10-12 (Asia/Shanghai). Baseline `b0dea64`; Memory pin unchanged.

Session detail already exposes Core-owned `extractionJobs`, but Runtime did not render them. After leaving a source panel, the owner had no entry point to its saved suggestion response. The new mounted Sessions fixture first failed `saved_jobs_survive_session_read`.

The Session inspector now lists saved suggestion runs and their observed state/progress, explicitly at session scope including other branches. Read saved suggestions uses only that session ID and the saved run ID. Provider configuration is not needed, no request is reconstructed, and no page recovery cache is persisted. The shared SuggestionPreview retains original proposals, quoted/complete source text and current candidate metadata consistently in the source and Session views. This Session recovery view offers no application or approval.

Only the latest job read publishes a preview; an unread or failed job cannot claim an empty result. An explicit read recovers failures. A different session/branch creates fresh reader state and invalidates delayed results. Closing the preview retains the saved job list. An absent `extractionJobs` field remains unknown rather than implying no jobs.

Validation:

- `e2e/saved-suggestions.html`: 10/10; [record](Memory-saved-suggestions-browser.json). Two saved jobs, held earlier read, newer selection, setup off, explicit failure recovery, exact Session/run IDs with read-only keys, cross-session late-result isolation, retained list on close and no sends/application/grants.
- Source ownership 12/12, extraction recovery 14/14, model choice 11/11 and Session ownership 18/18 passed after extracting the shared display.
- Fixed-Core consumer test extended: after actual synthetic extraction and review, remove native Provider setup and reread the same suggestions/candidate records successfully. Fake transport count remains one. Focused native test, formatting and strict Clippy passed; the preceding full 61 host + 4 Core tests remain valid for unchanged paths.
- Frontend tests 69/69, TypeScript, strict affected-fixture checks and frontend/ordinary release desktop builds passed. Pin/dependency boundary evidence is reused from the preceding unchanged pin.

This is synthetic mounted UI plus embedded-Core evidence. A real process restart, configured built-app Provider use, personal data, physical accessibility and human acceptance remain unverified. No Memory domain, protocol, pin or Activity change was made.
