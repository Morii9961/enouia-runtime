# ADR-025 — Enouia Memory owns the Memory domain; Runtime hosts its local client

Date: 2026-10-04. Status: adopted; Memory adapter implemented and active in the desktop shell. Authority: the owner's 2026-10-04 request to formally connect Enouia Memory's local part to Runtime; Architecture v0.3 §3 (domain ownership); Implementation plan v0.3 ("Any proposed change to settled domain ownership ... requires a new ADR"). Counterpart: Enouia Memory [ADR-MEM-45](https://github.com/Morii9961/enouia-memory/blob/main/docs/adr/README.md) and its [integration handoff](https://github.com/Morii9961/enouia-memory/blob/main/docs/integration/RUNTIME.md).

## Context

Architecture v0.3 placed Identity, Memory, Context, Sessions and the Provider abstraction in a Runtime Core. Enouia Memory then moved to its own repository (ADR-MEM-19). There it implemented MV-1 to MV-6 on synthetic data:

- a recoverable Vault
- import
- review and governance
- a disposable index
- context compilation
- durable sessions
- the offline Mock
- an embedded workspace Core with a typed IPC (workspace IPC v1)

Runtime meanwhile kept designing a parallel Core: the `enouia-memory`, `enouia-session`, `enouia-context`, `enouia-provider` and `enouia-core-contract` crates, ADR-020 to 024, and the hash-frozen design corpus. Its desktop surfaces for Memory, Context and Sessions showed fictional demo data. Two Vault formats and two rule sets would drift. Runtime is the Windows client, and the owner wants Memory's local frontend formally hosted there.

## Decision

1. **Memory domain authority.** The Enouia Memory repository (`Morii9961/enouia-memory`) owns these, and Runtime implements none of them:
   - Identity, canonical Memory, candidates and review, Sessions and checkpoints
   - Vault storage and recovery, the index and retrieval
   - Context capsules, inspection and dispatch
   - the Provider path (MV-7), the Memory Host and MCP (MV-8), the gateway (MV-9), replicas (MV-10) and backup
2. **Pinned dependency, one seam.**
   - `apps/desktop/src-tauri` depends on `enouia-memory-workspace` at an exact Git revision: a full SHA, never a branch, path or `[patch]`.
   - The revision is recorded in [docs/integration/memory-pin.json](../integration/memory-pin.json) and matches `Cargo.lock`.
   - Runtime calls only `Workspace` (`new`, `call`, `register_pick`, `open_root`, `shutdown`) with workspace IPC v1 envelopes, never the domain crates directly.
   - The root domain workspace does not depend on Memory.
3. **Runtime-owned adapter.** `apps/desktop/src-tauri/src/memory.rs` provides the two commands described in [Memory integration v1](../MEMORY_INTEGRATION_v1.md):
   - `memory_call` forwards one envelope.
   - `memory_pick` opens a native dialog and returns a token, never a path.

   The adapter also:
   - maps native windows onto Memory's `HostSurface`; only `main` reaches the Core
   - runs blocking work off the UI thread
   - runs Vault lifecycle commands exclusively of commands that start operations, leaving status and progress reads ungated
   - keeps the window open on close until the Core has shut down, then exits

   It holds no domain rules, writes no logs and persists nothing.
4. **Product client.**
   - Inside the native shell, the Memory, Context and Sessions surfaces, plus Home and Settings status, use the pinned Core.
   - Browser previews keep the explicitly labelled fictional demo.
   - Memory's own `apps/workspace` remains Memory's reference shell and acceptance harness. New product UI for Memory's local part lands here.
5. **Supersession.** Runtime's local Memory/Core crates, contracts and fixtures stay in the repository and keep building and testing. They receive no new domain work, and their removal is a separate change. Runtime ADR-020 to 024 and their frozen design corpus are historical for the Memory domain. Their bytes stay unchanged, so the readiness manifest still verifies them. Their equivalents live in the Memory register (ADR-MEM-NN numbers are unrelated to Runtime's 020–024). The register entries of ADR-001 to 024 state which parts are amended or superseded.
6. **Change routing.** A Memory change lands in the Memory repository under its stage gate. Memory logs every change to the integration surface in its compatibility log. Runtime adopts a revision only by bumping the pin with the runbook in [Memory integration v1](../MEMORY_INTEGRATION_v1.md), then re-validates.
7. **Activity unchanged.**
   - Activity & Usage stays Runtime's independent domain: its data root, runner, scheduler and delivery.
   - Activity data never passes through `memory_call`.
   - Memory status reports `activity` as not managed. Runtime shows its own Activity state instead.
   - Memory sync never uses Activity's SSH delivery.

## Consequences

- One Vault format and one rule set. Runtime-hosted reviews are stamped `trusted_windows_app`, which holds only while the desktop shell keeps Memory's renderer guarantees:
  - a strict CSP, `form-action 'none'`, a frozen prototype and WebView2 autofill disabled
  - no `fs`, `shell`, `http` or dialog plugins
  - plain-text rendering
  - no paths from the page
  - no logging of request or response bodies
- The desktop build needs a MinGW C compiler, for Memory's bundled SQLite, and one online fetch per pin before offline builds.
- There is no default or remembered Vault root. The owner opens or creates one in the native dialog, or names it with `--memory-vault`.
- Only one embedded Core may have a Vault open at a time. Memory enforces this since ADR-MEM-46: a second Core gets `workspace.vault_in_use`.
- Tray, global hotkey and quick search, and login startup were ported in [ADR-026](026-companion-shell.md). The installer remains a separate slice. The parity list is in [Memory integration v1](../MEMORY_INTEGRATION_v1.md).
- When Memory MV-8 replaces the embedded Core with the single Memory Host, Runtime's adapter becomes a Host client behind the same envelope. That is a breaking surface change, coordinated through both logs.

## Activation gates

Met in this change, see [validation](../validation/Memory-integration-v1.md):

1. The pin record, `Cargo.toml` and `Cargo.lock` agree, and `node scripts/check-memory-integration.mjs` verifies them.
2. The domain-boundary checker classifies Memory packages and keeps Activity and shared crates from reaching them.
3. Offline `--locked` desktop build, tests and clippy pass from the cached Git source.
4. The page client keys exactly the pinned contract's write commands.
5. The pinned Core passes Runtime's rendered-field tests.
6. The real desktop app reaches a synthetic Vault through `memory_call` and `memory_pick` with the denied-capability checks.

Still pending:

- Part of Memory's W05 acceptance on Runtime's host. Since ADR-026 (2026-10-05) the smoke covers W01–W04, including the folder picker, cancel and resume, Retry with the same key, paging and one Core per Vault (see the [validation](../validation/Memory-integration-v1.md)). Still open:
  - Narrator and a real contrast theme
  - an installed artifact and an actual Windows sign-in start
  - the tray icon and its menu, which no automated run has clicked
- The installer (the companion features shipped in ADR-026).
- Any real Vault use, which needs the owner's own backup and recovery preparation under Memory's privacy gates.
