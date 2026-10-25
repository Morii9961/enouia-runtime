# Loaded model settings in native Settings

Date: 2026-10-18 (Asia/Shanghai). Starting baseline `f455993`, branch `codex/provider-settings-status`. Memory stays pinned at `56bc5eb` with 47 workspace commands. The Runtime native command catalog, capabilities, source and dependencies are unchanged by this slice.

## Behavior

Native Settings places **Loaded model settings** after the configuration draft. It observes `memory_provider_setup` on mount and explicit reread, including before a Vault is opened. It displays the running host's absent, invalid or ready state and the observation time. Reading does not inspect a newly saved file. Ready means settings are loaded, not that credentials, service access, grants or a model request have succeeded. Browser Settings retains its fictional mode.

**Reload model settings** explicitly calls the existing `memory_provider_reload` without arguments, then separately observes `memory_provider_setup`. The reload receipt is never used as a current-state observation. A failed or lost receipt still leads to that read, since the native change may already have completed. No automatic reload/retry, credential prompt, grant, request or file selection occurs. The native host keeps its existing admission rules for setup prompts, active sends and shutdown.

Reads and reloads clear old observations and cannot overlap or duplicate themselves. A failed or mismatched read keeps loaded state unknown and withholds reload; explicit reread recovers. Parent status rerenders do not restart reads. Observed Exit clears the old state and closes controls, late replies cannot republish it, and unmount isolates a new Settings instance. Completion restores only owned focus, following the existing UI pattern.

## Development evidence

The focused actual-component journey passed 18 assertions for initial unknown/absent/refused/ready states, exact file identity, read failure/recovery, overlap refusal, receipt-versus-observation ownership, lost acknowledgements, no automatic retry, failed observation after a successful reload, Exit, unmount and use of only the two existing argument-free native ports. Native replies are synthetic; no real settings, key, file, Provider, Vault or Activity is used. Both existing Settings/startup journeys now admit the additional read-only setup observation while preserving their original assertions.

Production TypeScript, strict new-fixture typing with Vite CSS declarations, runner syntax, diff checks and the pin guard (8 negative cases) passed. The full frontend gate passed 110 Node tests and all 64 DOM fixtures (852 assertions). The Windows GNU no-bundle build passed, with a 30.60-second native release build in the owned C: target directory. Executable SHA-256: `498c6eb77150b447006dbaf789c7b5c0888740e72afd24d9a7a4a2daad8612f4`. It was not launched or installed, and the running Runtime was untouched.

The unchanged native code/dependencies reuse the preceding slice's 68 unit tests, 6 pinned-Core integration tests, strict Clippy, Rust formatting and resolved dependency-boundary evidence in [native draft save](Provider-draft-save-v1.md). Native OS interaction, installation and Morii acceptance remain pending.
