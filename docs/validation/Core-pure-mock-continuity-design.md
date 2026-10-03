# Pure Context/Mock continuity — 2026-10-03

Executed `python scripts/check-mock-continuity-design.py --cargo C:/Users/Morii/.cargo/bin/cargo.exe` with the installed Rust 1.98.1 offline toolchain. The existing canonical-history probe passes first. Fresh Context/prepare/Mock/Session/checkpoint output equals the frozen selected corpus. **One** accepted Mock response, **two** Context exclusions, **six** refusal boundaries and final typed graph reload pass.

The accepted user model has 10 sources/8 Memories/7 events; assistant composition has 11/8/8; explicit checkpoint has 12/9/9. No Memory/checkpoint is added merely by answering. Original turn prefixes remain exact. Source time for the assistant equals the new assistant event time, not preparation time.

Three frozen byte frames pass independently recomputed Python SHA/length/framing and typed Rust equality. The capsule is 2,757 compact no-LF bytes; request and response are 2,841/601 bytes with LF. Actual Mock's consumed hash/length equal the Python capsule hash/count. See [the design](../PURE_MOCK_CONTINUITY_v1_DESIGN.md) for exact hashes.

Initial probe compilation exposed that internal `RankedMemory` intentionally lacks serde deserialization. A fixture-local typed rank decoder now converts into that existing structure; no production API or serde derive is changed. The compiler then passes, with formatting and offline Clippy checked separately. This correction is confined to the design harness.

This is selected composition of real existing *pure* APIs, not actual Runtime handler/ledger/receipt execution. Rankings and human actions are declared fixture inputs. No SQLite, input-generation binding, safe file port, canonical selection, worker race, actual process restart, live provider/account or Activity sentinel is tested. Production crates/Cargo/v1 IPC/frontend sources are unchanged; all P/O gates remain unimplemented/unaccepted.
