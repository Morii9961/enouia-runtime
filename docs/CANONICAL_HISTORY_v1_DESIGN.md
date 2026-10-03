# Memory/Session legal-history corpus v1 — backend design

Date: 2026-10-03. Authority: [Vault transition boundary](VAULT_STORAGE_v1.md), existing [Memory](MEMORY_MODELS_v1.md) and [Session](SESSION_MODELS_v1.md) pure models. Status: selected synthetic pure-model history verified by existing Rust operations; no Vault/IPC implementation, personal import or production acceptance.

## Selected model history

The [fixture](../tests/fixtures/backend/canonical-history-v1.json) starts with an empty Memory domain and no Sessions. It freezes complete expected models after each of seventeen actions. The empty model is not a populated imported snapshot masquerading as a Vault bootstrap; actual Identity/manifest/selector files belong to the separately gated storage corpus.

| Steps | Required retained meaning |
|---|---|
| Empty Session | Backend-shaped fixed synthetic identity, title and creation time; zero events |
| Four explicit saves | Fact, Preference, Episode and ProjectState; matching manual/remember sources |
| Two user turns | Exact original content, including Chinese text/newlines; paired conversation sources |
| Explicit checkpoint | Canonical fifth Memory kind and one additional Session event; turns remain present |
| Project candidate proposal | Pending original proposal references retained source/predecessor; no canonical insertion |
| Edited approval | Original proposal unchanged; edited canonical ProjectState inserted; predecessor becomes superseded |
| Undo | Predecessor restored; successor archived; both contents/source/link remain retained |
| Preference proposal/rejection | Rejected proposal remains exact; no canonical Memory or checkpoint event |
| Checkpoint proposal/approval | Pending proposal alone adds no checkpoint event; approval composes canonical Memory/review decision/event |
| Third user turn/final checkpoint | Append-only event history; final checkpoint covers that retained turn |

The final selected model has nine sources, eight canonical Memory records, three retained candidates and one Session with three user turns and three checkpoint events. One canonical ProjectState is archived after undo. All five Memory kinds, manual/remember/conversation provenance and pending/approved/rejected observations occur during the history. Imported raw data, assistant turns, invocation/receipt files and Provider dispatch are intentionally outside this selected model corpus, so it cannot be reported as end-to-end continuity.

## Rust replay and composition

The [probe source](../scripts/design/canonical-history-v1.rs) calls existing `MemoryLedger` and `SessionRecord` operations rather than reimplementing their model validators in Python. Before/after each selected action it executes complete current Memory/Session validation. Its selected retention predicates require unchanged sources, retained original Memory fields apart from legal status/update observations, unchanged candidate proposals/creation times/terminal reviews, and original Session header/event prefixes.

Checkpoint approval is explicitly composed on cloned in-memory models: approve the candidate, append the corresponding event, validate the complete next graph and selected retained history, then return a new model. A refused event append returns no candidate/session/source changes to the original input. This tests a proposed composition boundary, not a canonical selector transaction or Runtime handler. It does not create a production store/validator module.

Expected states were authored separately as JSON fixtures. Typed Rust equality verifies those selected model outcomes. Seventeen typed encode/decode/re-encode comparisons check Rust serialization roundtrips; they are not independent Rust-versus-Python byte parity or exact LF/manifest hashes. Full generic Vault operation validators, history admission, wire pairing and storage serialization remain P01/P07 work.

The ten negative actions cover wrong explicit-save origin, duplicate/missing Session, backwards/blank user turn, terminal re-review/re-reject, repeated undo, edited provenance change, and checkpoint approval referencing an absent turn. They check named error codes and unchanged original model input. Two additional rewrites change a retained source title or original user content: each still passes current-graph validation, but fails the selected retained-history predicate. A valid present-day graph alone cannot establish that the history was preserved.

## Reproduction and scope

Run [the wrapper](../scripts/check-canonical-history-design.py) with an installed Cargo binary. It generates a marked standalone probe under ignored `target/design-probes/`, builds offline against existing path crates and pinned serde versions, and reads only the synthetic fixture. It neither edits root Cargo metadata nor installs/downloads dependencies. The generated isolated lock/build tree is development evidence, not a packaged Runtime dependency decision.

Use the repository's installed toolchain selection from README when rustup cannot access its cache. [Recorded validation](validation/Core-canonical-history-design.md) identifies the actual compiler and selected checks. No Vault directory/selector, SQLite index, IPC handler, task, service, private root, real Provider or Activity data tree is opened. Existing production crates, dependencies and frontend files are unchanged. All P01-P10 and O01-O14 retain their unimplemented/unaccepted states.
