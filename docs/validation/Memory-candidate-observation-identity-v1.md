# Candidate reads reject another record's observation

Date: 2026-10-13 (Asia/Shanghai). Baseline `e0a1fef`; Memory pin unchanged.

Candidate source/conflict readers previously published an opaque result without matching its returned record identity. Controlled wrong-ID replies failed `different_source_id_is_not_a_citation_observation` and `another_memory_is_not_a_conflict_observation` against that baseline.

Source reads now require the exact cited source ID/revision; conflict reads require the cited memory ID while allowing its current revision to differ from the recorded conflict version. A mismatch is a failed read, never shown as the cited observation; explicit rereading remains available. The existing latest-read, hide and revised-row guards remain in force. No new Memory command, rule or protocol was introduced.

Validation: source fixture 14/14 and conflict fixture 10/10 ([record](Memory-candidate-observation-identity-browser.json)); ordinary mounted-App review 14/14. The controlled checks were adjusted to wait for the new read instead of racing a previous error's removal. Frontend tests 69/69, TypeScript/strict fixture checks, frontend/ordinary no-bundle desktop builds and pin/dependency checks (8 + 7 negatives) passed. This turn's unchanged 61 host and 5 fixed-Core checks, formatting/Clippy, including actual citation/conflict identity fields and Core recreation, are reused.

Wrong replies are synthetic and do not demonstrate a production Core defect. No real model/credentials, personal Vault, native physical input/Narrator, installer, Activity activation, Memory-domain/pin change or human acceptance is claimed.
