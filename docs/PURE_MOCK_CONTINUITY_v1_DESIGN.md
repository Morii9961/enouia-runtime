# Selected pure Mock continuity corpus v1 — backend design

Date: 2026-10-03. Authority: existing [Context capsule](CONTEXT_CAPSULE_v1.md), [Mock Provider](PROVIDER_MOCK_v1.md), [Memory/Session history](CANONICAL_HISTORY_v1_DESIGN.md) and [invocation design](INVOCATION_LEDGER_v1.md). Status: isolated composition of existing pure Rust APIs; no Runtime orchestration, canonical receipts/ledger or durable continuity acceptance.

## Composition and observations

The [fixture](../tests/fixtures/backend/mock-continuity-v1.json) starts from the final verified canonical-history *model*, then supplies an explicit fourth user turn, Identity, selected rankings, response IDs/time and a separately authored checkpoint. Fixed IDs/action descriptions are synthetic inputs, not OS entropy or an actual human authorization route. The [wrapper](../scripts/check-mock-continuity-design.py) independently replays the preceding model history before running the isolated [probe](../scripts/design/mock-continuity-v1.rs).

| Boundary | Sources | Canonical Memories | Session events | Claim supported |
|---|---:|---:|---:|---|
| Additional user input/source | 10 | 8 | 7 | Complete pure model ends in exact new user turn |
| Prepared/answered Mock input | 10 | 8 | 7 | Compile/prepare/respond leave accepted pure model unchanged |
| Assistant/source composition | 11 | 8 | 8 | One assistant text/source appended; no new Memory/checkpoint |
| Explicit human-authored checkpoint | 12 | 9 | 9 | Additional canonical checkpoint/event references retained user/assistant range |

Old events remain exact prefixes through both new model compositions. Typed serialization/reload preserves the final complete graph; it is **not a process restart or durable reload**. A response alone cannot create a canonical checkpoint. The checkpoint content/last-state comes from separate synthetic action fields, not an automatic summary of Mock output.

The ranked choices include restored active ProjectState `mem_...0004`, latest checkpoint `mem_...0009`, archived successor `mem_...0006` and a duplicate checkpoint choice. Context excludes the inactive successor and duplicate. Mock consumes only the prepared request, receives no Vault/index/source-registry handle, and reports only the restored ProjectState. The edited/archived successor's content and rejected candidate are not supplied as canonical Context content.

Ranks are declared selected fixture inputs, converted into the existing internal `RankedMemory` structure. They are not a new serialized production ranking API or proof that SQLite retrieval/scoped ordering ran. Identity is fixed synthetic text consistent with the earlier storage corpus, not a real Identity file read or proof of a selected input-generation binding.

## Exact capsule and result bytes

The [byte fixture](../tests/fixtures/backend/mock-continuity-bytes-v1.json) freezes three exact UTF-8 frames:

| Frame | Bytes | SHA-256 |
|---|---:|---|
| Capsule, compact **without LF** | 2,757 | `30b3ae2a0142d48c3e09ccc5b514c29ddccc4e22e67c20c5b855e94bbe4290dc` |
| Request, compact plus LF | 2,841 | `38d7b537bfa274e906d753e47496a654d1a1da38dade13ce9d3d2887c6122c11` |
| Response, compact plus LF | 601 | `5a81b55812d3980435a034c7b73a4a5e006731398b9d88fa5c5cdc83e77235ae` |

Fresh typed Rust output must equal the frozen expected model/byte strings. Python independently decodes Base64, checks framing/length/SHA and request/capsule/response identity, and compares its capsule hash/length with actual Mock consumed-byte fields. The capsule budget is its exact serialized length plus 256 reserve under `utf8_bytes_v1`; it makes no claim about a real language model tokenizer.

The current corpus's expected output was initially emitted by the Rust probe and then frozen/reviewed. Byte hashes are independently recomputed in Python, while model/output expectations are selected regression requirements, not independent proof of all possible orchestration behavior. `--emit-data` is an explicit authoring mode, writes only an inert map under ignored target and does not claim frozen equality; normal verification requires the recorded expected output and byte pack.

## Refusal evidence and activation boundaries

Six selected checks cover pre-response cancellation, forged consumed hash, forged ProjectState content, mismatched request identity, hidden changed ProjectState in a capsule and changed accepted user content in a capsule. One valid Mock response is produced; another cancelled invocation of its pure respond API produces no accepted result. This tests deterministic pure API refusal, not worker cancellation/completion races or exactly-once dispatch.

The [validation record](validation/Core-pure-mock-continuity-design.md) separates actual pure API checks from missing integration. Invocation/preparation/dispatch/completion/receipt files, selector generation binding, index queries, worker/OS ownership, canonical commit, lost acknowledgement and actual process restart remain absent. No live account, network provider, Activity state, personal import, backend IPC or frontend is used. P08/P10 and O03-O12 are not accepted by this probe; full P01-P10/O01-O14 remain unimplemented/unaccepted.
