# ADR-032 — Native setup for Memory's text Provider path

Status: Adopted implementation; real-account use and acceptance remain pending.
Date: 2026-10-11

Enouia Memory ADR-MEM-48 lets a workspace host opt in to native OpenAI/Anthropic text dispatch by injecting a transport, a secret store and owner-verified destinations. All egress rules stay in the Memory Core: standing grants confirmed by hash, exact-body review before sending, single-use approval, one attempt, ledger and local interruption. This ADR decides how Runtime supplies the native half. It amends the ADR-025 boundary "Runtime implements no Provider call": Runtime still implements no Provider protocol, but it hosts Memory's.

## Decision

1. **Off by default.** At startup Runtime reads `memory-providers.json` from its configuration folder (`%APPDATA%\com.enouia.runtime`). If the file is absent, Runtime never calls `set_native_provider`, the Core stays `local_mock_only`, and every external command answers `provider.not_configured`.
2. **Explicit owner settings.** The file names each API (`openai`, `anthropic`), its exact model, context window, output ceiling, streaming support and the time the owner verified them, plus per-Session attempt and token ceilings. Unknown fields, including any key field, refuse the whole file, and the page sees only a stable `provider_setup.*` rule. Nothing is inferred from a subscription or a model name, and prices are not configured, so no monetary ceiling is claimed.
3. **Keys only in Credential Manager, entered natively.** `memory_provider_key {api, action: "set"}` opens the Windows credential prompt (`CredUIPromptForWindowsCredentialsW`) over the main window. The key goes from the prompt's password field through Memory's local shape check into `CredentialStore::write`, and never reaches the page, the settings file or a log. `cmdkey` cannot be used, because it stores UTF-16 bytes that the shape check refuses. `remove` takes the setup out of the Core first, which refuses with `provider_busy` while a send is running; it then deletes the entry and reapplies the settings file. Local removal does not revoke the key at the provider.
4. **The page sees state only.** `memory_provider_setup` returns `absent`, `invalid` (with its rule) or `ready`, plus the file name. `memory_provider_reload` explicitly reloads that same host-owned file without a path, file text or key argument. All three commands exist only for the main window; the overlay cannot call them. Reload and key changes are serialized; a running Core send refuses replacement and preserves the loaded setup and its reported state. A missing or invalid file turns sending off only after the Core accepts removal. Reload does not send a request or create a grant.
5. **Native HTTPS.** Runtime injects Memory's `HttpsTransport`: fixed official origins, no proxy inference, redirects or retries. The Core runs it on its own operation threads, outside Tauri's async runtime.

## Consequences

Runtime's build gains rustls/ring and the platform verifier, through Memory's pinned Provider crate. The real credential prompt, Credential Manager writes and HTTPS have not been exercised. Tests cover settings parsing, application to the pinned Core, refusal rules and the fixed credential names on synthetic data. Using a real key and calling a real provider is an owner action, and MV-7's real two-provider smoke remains Memory's stage gate.
