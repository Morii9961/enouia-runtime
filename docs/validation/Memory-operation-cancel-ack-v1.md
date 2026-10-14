# Operation cancellation acknowledgements and delayed reads

Date: 2026-10-12 (Asia/Shanghai). Baseline `6183e17`; Memory pin unchanged.

The shared watcher discarded `operation_cancel` results, leaving Stop locally enabled until the next successful status poll. A query already in flight could also publish an older running snapshot after a newer cancellation or terminal reply. The new held-read fixture first failed `acknowledgement_is_immediately_visible` before the fix.

The watcher now consumes the Core cancellation status immediately and requires the requested operation ID, its kind and the documented status fields. A cancellation acknowledgement disables another stop request without inventing a terminal state. Queries started before that acknowledgement cannot overwrite it or its terminal result. The watcher observes terminal completion once, including when cancellation races with a completed call. Failed reads retain the preceding status alongside explicit recovery. A successful nonterminal stop acknowledgement restarts observation, including after a failed or held read; it never replays the stop request.

Validation:

- `e2e/operation-cancel.html`: 13/13; [record](Memory-operation-cancel-ack-browser.json). Held older reads, immediate acknowledgement, separate eventual cancellation, an already completed cancellation reply, one terminal callback, foreign operation rejection, a fresh local recovery action and observation resumed after read failure. Commands are only `operation_get` and `operation_cancel`.
- Existing Provider/extraction flow 12/12, workspace-call recovery 13/13 and session ownership/recovery 18/18 passed with the shared watcher. The Provider fixture now returns the complete cancellation DTO.
- Native synthetic held-transport test asserts that the pinned Core's cancellation reply contains the requested ID, external-send kind, cancellation flag and progress object. Full native tests: 61 host + 3 pinned-Core tests; formatting and strict Clippy passed. No transport HTTP or credential store access.
- Frontend tests 69/69; TypeScript, strict changed-fixture checks, frontend build and the ordinary release desktop build passed. Integration pin/boundary checks passed (8 + 7 negative checks).

All calls and data are owned synthetic fixtures. This does not establish remote cancellation, real Provider behavior, personal Vault recovery, installer acceptance or physical accessibility acceptance.
