# Choose a configured model for source suggestions

Date: 2026-10-12 (Asia/Shanghai). Baseline `ba7ded5`; Memory pin unchanged.

The source suggestion panel always selected the first configured destination and offered no way to choose the second. A setup with an extraction grant only for its second provider therefore showed a no-grant notice with no usable choice. The new fixture first failed `configured_destinations_can_be_chosen`.

The panel now names all observed configured provider/model pairs in a labelled selector. Selection alone does not grant or send anything. The chosen pair must have an active extraction grant; a conversation-only grant is insufficient. Preparing uses that selected API, matching policy and the shown source revision/range. Selection stays fixed through preparation, exact-body review, send admission, the live operation and the saved suggestion job. Choosing another model starts a new flow after closing the settled one. Each mounted selector has its own React-generated label ID.

Validation:

- `e2e/extraction-provider-choice.html`: 11/11; [record](Memory-extraction-provider-choice-browser.json). Two synthetic destinations, a conversation-only first grant, explicit second-provider choice, no selection side effects, held prepare, exact destination/policy/range, held choice through body/operation/job, one send, no grant/key commands and settled dismissal.
- Existing source ownership 12/12, queue recovery 14/14 and Provider/extraction feedback 12/12 rerun successfully.
- TypeScript, strict affected-fixture checks, all 69 frontend tests and frontend/ordinary release desktop builds passed. Native/backend and dependency-boundary evidence from [cancellation verification](Memory-operation-cancel-ack-v1.md) is reused because those sources and dependencies are unchanged.

The providers, grants and response are synthetic. No real model capability, account entitlement, configured built-app sending, credential access or HTTP is established.
