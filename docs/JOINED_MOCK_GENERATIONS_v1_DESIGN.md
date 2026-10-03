# Selected model / Mock / receipt generation joins v1

Date: 2026-10-03. Backend design evidence only. This combines the [model storage history](MODEL_STORAGE_BYTES_v1_DESIGN.md), [pure Mock bytes](PURE_MOCK_CONTINUITY_v1_DESIGN.md), [invocation ledger](INVOCATION_LEDGER_v1.md) and [command receipts](CORE_COMMANDS_v2_DESIGN.md) into one selected inert generation corpus. Existing ADR activation gates remain unchanged.

The [fixture](../tests/fixtures/backend/joined-mock-v1.json) extends the final synthetic model-history binding with four complete byte inventories. Files remain JSON strings in test data; no Vault directory, selector, adapter or dispatcher is created. Earlier model-history actions have no v2 receipts. Their presence is synthetic input lineage, not permission to migrate an existing Vault or enable v2.

| Boundary | Generation suffix | New effect | Receipt / ledger |
|---|---|---|---|
| Accepted input | 2013 | One fourth user turn and matching source | Accepted receipt; no invocation |
| Prepared | 2014 | Exact capsule, request and invocation record | Running receipt; prepared ledger |
| Dispatch intent | 2015 | Ledger records dispatch timestamp | Unchanged running receipt; dispatching ledger |
| Completed | 2016 | Exact response, assistant turn/source, completed ledger/receipt together | Completed receipt and ledger |

The semantic command digest uses the existing `command_digest_v2` recipe and the original binding `gen_...2012`. The client token is separately hashed. Neither digest is an authorization capability. Invocation input binds `gen_...2013` and its exact manifest hash, before preparation metadata exists. Every later generation retains that input binding. Metadata contains no self-manifest hash cycle.

An unchanged receipt copied into the dispatch generation still names its last changed generation, `gen_...2014`, and retains its preparation update time. Completion changes its result references and names `gen_...2016`. These are distinct from the selected current generation and the immutable input generation.

The complete inventories include retained Identity, sources, Memory, candidates and Session, plus generation-contained operation/invocation/capsule/request/response files when applicable. Each manifest binds sorted path/length/hash entries. Mutations bind the exact parent and actual changed content paths, excluding mutation itself. Selectors hash exact compact manifest bytes plus LF. The capsule remains the deliberate no-LF exception; request and response retain LF.

The [checker](../scripts/check-joined-mock-design.py) first replays the preceding pure Rust model history, compares model-storage serialization, then executes the existing pure Context/Mock continuity probe. It compares all four inventories against those frozen verified pure-model outputs, independently recomputes byte hashes and checks closed ledger/receipt/storage shapes plus selected semantic joins. Completion contains eight canonical Memories, eleven sources and eight Session events. It adds no checkpoint or automatic Memory.

Checkpoint creation remains a separate explicit action in the pure model corpus. This joined submission ends at completion and does not assert a v2 checkpoint command materialization rule for the separately authored checkpoint content. A future checkpoint receipt corpus must specify that mapping before claiming command/model parity.

Eleven negative cases rehash the changed file, manifest, selector and downstream parent/mutation chain before checking semantic contradictions: original binding, command digest, assistant reference, receipt last-change generation, invocation input generation, capsule LF hash, response byte count, assistant text, source linkage, changed-path omission and premature dispatch timestamp. They are selected corpus predicates, not a generic transition validator or production schema engine.

The metadata was authored as synthetic data; it was not emitted by real canonical handlers. Running the pure Mock before inspecting these inert records cannot establish prepare-before-dispatch execution. Store publication, CAS/locks/entropy, same-Session exclusion, actual receipt lookup, cancellation, lost acknowledgements, restart, OS storage and typed Rust metadata parity remain unverified. P01–P10 and O01–O14 remain unimplemented/unaccepted. Frontend, Activity, live accounts, personal data and production activation are outside this slice.

Evidence: [validation record](validation/Core-joined-mock-generations-design.md).
