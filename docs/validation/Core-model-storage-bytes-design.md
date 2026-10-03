# Memory/Session exact storage vectors — 2026-10-03

Executed `python scripts/check-model-storage-design.py --cargo C:/Users/Morii/.cargo/bin/cargo.exe` under the recorded installed Rust 1.98.1 toolchain. The checker runs the existing isolated pure-history probe before comparison. **18** synthetic generation maps, **89** exact objects, **210** model file-byte comparisons and **17** corrupted-corpus refusals passed. The constituent pure-history check still passes 17 transitions/roundtrips, 10 refused actions and 2 valid-graph history rewrite refusals.

Frozen model bytes are compared with newly serialized typed Rust source/Memory/candidate/Session records. Python-authored metadata hashes/counts/parent/selector/change inventories are independently checked as selected design fixtures. No Runtime store is built or called. Deduplicated Base64 object aliases are fixture representation only, not physical canonical file sharing.

The known corpus contains all five Memory kinds and manual/remember/conversation provenance, edited/approved/rejected candidate history, restored/archived supersession and explicit/checkpoint-review Session events. It omits raw imports and invocation/receipt/Provider integration. Passing a selected oracle does not establish a generic Vault validator, arbitrary numeric serialization parity, Windows safety, actual selection, restart or storage durability. All P01-P10/O01-O14 remain unimplemented/unaccepted; production crates/Cargo/Activity/v1 IPC/frontend sources remain unchanged.

The modified isolated Rust probe passes formatting and offline Clippy with warnings denied; affected Python/JSON/Markdown integrity and readiness hashes are checked separately. See [the design](../MODEL_STORAGE_BYTES_v1_DESIGN.md).
