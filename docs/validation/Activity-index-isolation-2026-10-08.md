# Pinned-Core rebuild and Activity isolation

Date: 2026-10-08. Base revision: `9e9622c`. Scope: the existing pinned Memory Core's real index-rebuild operation and Runtime's independent Activity runner, using a newly created synthetic Vault and prepared synthetic sandbox package. Product source, desktop/runner binaries and Memory pin are unchanged.

The native Activity harness's optional `--index-isolation` mode extends the ordinary workflow after its real Memory candidate/fault drill. It approves that synthetic candidate through the existing review plan/confirmation contract, starts `index_rebuild` through `memory_call`, reads Activity through its own IPC channel, and observes the Core operation's terminal result. It then continues the real Activity pause/resume, source-failure, pending retry and host restart checks. This is acceptance work only; it adds no Memory command, backend behavior, dependency or pin change.

The [full native report](Activity-unified/index-isolation-native.json) passes **35/35**, exit 0: the original 29 checks plus six isolation checks. The [hashed proof](Activity-unified/index-isolation-proof.json) binds the raw report, harness, desktop/runner hashes and exact Memory revision. The six checks establish:

- One synthetic candidate becomes one approved canonical Memory.
- Pinned Core accepts the real rebuild and returns an operation ID.
- Activity overview and public preview stay available between rebuild acceptance and observed completion, at the same high-water and public hash with no pending batch.
- Core reports `index_rebuild` as `succeeded` with one processed record. Its recorded progress is `done: 1, total: 4`; success is the canonical operation state, not an inferred percentage.
- A complete SHA-256 tree comparison finds Activity stored files byte-identical across the Memory approval/rebuild.
- The approved Memory remains readable after real unavailable Activity collectors commit a failed-source pending batch.

Activity does not receive the Vault path, and no Activity data enters the Memory call. The Vault is freshly created outside Git through the owned native picker. The Activity data root must be the prepared package's sibling synthetic `data` directory; links are refused during its tree read. No personal Vault or source store is opened.

The release desktop remains `9067ccb52f321b10ffe2acd1ed6f4f04b43dff2d3e79c124bd557781c3bfad6a`; runner remains `cb665419f42ff088425012f9e43cebf22a21d2647f0a1a19b97df7ca236c8b7a`; Memory remains `ff692ccb6fbc1c387254d5ffbef41b105eeb2a84`. Temporary artifacts and the synthetic Vault stay under `enouia-activity-index-isolation-20261008` in local temporary storage. Harness syntax, Git whitespace, Memory integration self-test (8 negatives) and updated Activity evidence self-test (15 reports, 156 selectors, 14 negatives) pass. Unchanged product checks from the confirmation slice are reused.

This is a successful real rebuild on a small healthy synthetic Vault. The running state is not sampled; it does not establish overlap with a long-running worker, corrupt-index repair, storage-fault recovery or personal-data acceptance. These distinctions remain in C17's open gates. All 18 B4 rows remain partial and B5 inactive. The test registers no task and performs no production upload.
