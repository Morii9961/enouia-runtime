# Canonical model-history design — 2026-10-03

Executed the isolated offline Rust probe through `python scripts/check-canonical-history-design.py --cargo C:/Users/Morii/.cargo/bin/cargo.exe`, with `RUSTUP_TOOLCHAIN=stable-x86_64-pc-windows-gnu`. Installed Cargo and rustc both report 1.98.1. **17** model transitions, **17** typed serialization roundtrips, **10** refused actions with original models unchanged, and **2** valid-current-graph but rewritten-history refusals passed.

The probe compiles existing `enouia-memory`/`enouia-session` plus an inert standalone design executable under ignored `target/design-probes/`. serde 1.0.229 and serde_json 1.0.151 match the root pins; an isolated offline lock resolves cached transitive dependencies. This is no change to the production Cargo graph or proof of its packaged build.

The selected final model contains 9 sources, 8 canonical Memory records, 3 retained candidates, 1 Session, 3 user turns and 3 checkpoint events. Source/title/content/proposal prefixes remain preserved in the selected history. Actual human authorization is a declared fixture action, not a tested shell interaction.

Rust formatting, affected syntax/link integrity, artifact hashes and design-only source scope are checked separately. No full Vault transition validator, exact storage serialization/manifest, invocation/receipt/Provider integration, IPC, Windows lock/entropy/durability, actual restart, Activity sentinel or private migration is tested. P01-P10 remain unimplemented; O01-O14 remain unaccepted. See [the corpus design](../CANONICAL_HISTORY_v1_DESIGN.md).

The formatted probe passed `rustfmt --check` and standalone offline Clippy with warnings denied. These checks cover the isolated probe and its selected existing pure-model dependencies, not the complete Runtime workspace or deployed binaries.
