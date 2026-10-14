# Fixed-Core extraction, saved progress and review fields

Date: 2026-10-12 (Asia/Shanghai). Baseline `69f7758`; Memory pin unchanged at `8186aed861af08cf7a2c5d8c912a24eae51b4d66`.

The browser fixtures intentionally supply synthetic IPC responses. Runtime's embedded-Core consumer checks now additionally verify the actual fields used by suggestion preparation, previews, saved candidate metadata and session recovery. `provider_suggestion_fields_follow_saved_cursor_and_current_review` uses the existing temporary-Vault Page harness, a fixed in-memory secret and a fake chunked Anthropic response. It never uses HTTPS or Windows credentials.

The test configures two synthetic destinations, confirms an inspected extraction grant for Anthropic, creates a synthetic source, prepares its exact range and sends once. Preview returns two proposals and their quote/complete source text. After one application, a new read observes cursor 1 and one pending candidate; remaining application completes the job. Memory list remains empty until explicit ordinary review. Edit-and-accept updates the current candidate's status/revision and writes one approved memory with edited content. The original proposal and candidate content remain the original text, distinct from the approved memory. The preview now tells the owner to read approved memories in Memory Vault for their current content.

The saved extraction Session exposes `extractionJobs`, with real `run_id`, `input_event_id`, state, cursor and candidate fields. These provide a Core-owned recovery route without a private page job cache. Preparation sends nothing; all preview/application/review/session reads leave the transport call count at one.

Validation:

- Full native tests passed: 61 host + 4 pinned-Core consumer tests. The new test was rerun after adding the original-proposal/approved-memory distinction and saved-job field assertions.
- Native formatting and strict all-target Clippy passed. Integration pin/boundary checks passed (8 + 7 negative checks).
- Frontend tests 69/69, TypeScript, frontend and ordinary release desktop builds passed with the additional owner text. Other browser evidence retains its original revision.

This is an embedded-Core synthetic workflow and DTO compatibility check, not configured built-app Provider acceptance, real accounts, personal data, network behavior, power-loss recovery or human acceptance. Production/native adapter behavior and the Memory domain are unchanged.
