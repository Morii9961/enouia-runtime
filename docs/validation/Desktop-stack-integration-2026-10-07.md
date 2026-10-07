# Desktop stack integration — 2026-10-07

Follow-up: [real long-operation lifecycle evidence](Long-operation-lifecycle-v1.md) covers actual verify/backup workers during close, lock and exit on the subsequent release. This report retains the stack-integration baseline and its original limits.

This combines the frontend stack ending at `4f597b1ba9c31f847eb680b6b1b549ce72f14484` with main at `debd5e22747808a4d2ae4a8d4b56892d4146c11b`. Existing PR #24 is the aggregate entry to main. The captured heads of PRs #1–24 are ancestors of the stack tip; preserving merge history allows their inclusion to be checked before closing superseded PRs.

Main's Memory pin remains `ff692ccb6fbc1c387254d5ffbef41b105eeb2a84`, with surface aggregate `c49bbaa9f82c21a812a34a247e4a5595cd51707ab406bb8205444f8259a17212`. Its startup implementation, installer template, hooks and installer drill scripts are unchanged. The frontend stack retains strict checking across seven surfaces, truthful read/write/operation feedback, retained drafts, exact receipt retries, source paging, keyboard interaction, native window state and integrity/backup result presentation.

One Runtime shell installs the tray, owns the hotkey thread and runs asynchronous shutdown. Main's compatibility window/startup commands use that shell; they do not install a second tray or shortcut. The active overlay capability permits only search and restricted window/event commands, never picker, startup or exit. `--autostart` starts hidden with no Vault even if a Vault argument is supplied. Core companion status retains `exiting` across late hotkey updates and clears it after a failed shutdown worker. A synthetic adapter test checks that the pinned Core's Vault lock and Runtime's directory reservation refuse a second embedded client in both directions and release ownership after shutdown.

The first combined native run passed **93/95**. Escape dispatched after the input lost focus did not reach the overlay's element handler. Escape is now handled at that overlay page's window, with effect cleanup. The other failure was the harness awaiting an IPC reply after intentionally exiting its window; the affected exit checks now request shutdown and observe the owned child's actual exit code. No non-exit error is suppressed. The corrected full run passes **101/101**, exit 0, on a fresh synthetic Vault.

## Fresh checks

| Check | Result |
|---|---|
| Frontend `npm test` | 23/23 |
| Frontend type check and production build | Pass; also run by `desktop:bundle` |
| Desktop Rust format, tests and Clippy with warnings denied | Pass; 24 host tests and 3 pinned-Core tests |
| Memory pin checker, including pinned surface comparison | Pass; 8 negative checks, using the Memory checkout's committed pinned revision |
| Desktop dependency boundary | Pass; 7 pinned Memory packages, 7 negative checks |
| Independent Runtime domain dependency boundary | Pass; 0 Memory packages, 10 negative checks |
| Activity evidence index | Pass; 8 negative checks; B4 not signed off and B5 inactive |
| Native default smoke | 101/101, exit 0 |
| Native picker/verification/backup/restore-preview mode | 16/16, exit 0 |
| Native stale-plan recovery mode | 14/14, exit 0 |
| Native confirmation waiting/retry/receipt-replay mode | 17/17, exit 0 |
| Dedicated native damaged-object integrity probe | 7/7, exit 0 |
| Current-user NSIS bundle generation | Pass; unsigned x64 installer, approximately 7.19 MiB |
| Installer ownership checks, including rendered template | 26/26 |
| Harness syntax and diff checks | Pass |

The full run includes native pickers, 29 approved records with paging, a real writer-lock busy/retry, a 3,000-conversation synthetic import cancelled and resumed, a local Mock answer and its verified actual request, scoped overlay refusals, guarded OS Ctrl+Alt+Q, repeated search opening/clearing, manual shortcut-conflict fallback, an occupied-root refusal, read-only startup status, hidden autostart, compatibility commands, close-to-tray, explicit exit, an empty autofill table and actual restart reads. A cancelled Windows session end leaves the process alive; Restart Manager then ends the owned process with exit 0 through Core shutdown. It registers only that child's PID and creation time, using [Microsoft's process identity API](https://learn.microsoft.com/en-us/windows/win32/api/restartmanager/ns-restartmanager-rm_unique_process), not an executable path that could select unrelated running instances.

The focused checks perform a real clean verification, real backup and restore preview; stale confirmation refusal and fresh-plan recovery; and confirmation retry with the same payload/key, actual receipt replay and exactly one approved record. Controlled delivery failures are synthetic timing probes. The damage probe changes only its own imported object after checking the dedicated temporary path, single hash-named object and exact original bytes. Core reports `clean:false` with one corrupt object; the UI shows integrity problems. Exact-byte restoration in `finally` produces a clean subsequent verification without changing the canonical commit ID or sequence. This is detection and known-byte replacement in a controlled fixture, not a general repair feature.

The final Settings, Quick Search, backup/preview and damaged/clean verification screenshots were inspected. Reports and screenshots remain outside Git under `%TEMP%`:

- `enouia-runtime-stack-integration-full-v2-20261007-01a10b3a/smoke`
- `enouia-runtime-stack-picks-20261007-01a10b3a/smoke`
- `enouia-runtime-stack-stale-plan-20261007-01a10b3a/smoke`
- `enouia-runtime-stack-confirm-20261007-01a10b3a/smoke`
- `enouia-runtime-damaged-verify-stack-20261007-01a10b3a/smoke`

Final executable SHA-256: `1cb273b9844336328ff72a3cb41cb262b85d5bb6ca367938c803c62f0da842ce`. Installer SHA-256: `55be193351eb6711838cc56a61c3c9d0ca5fdc5ef6716fd6425d6ff9021ae275`. Fixtures were initialized by the CLI built from the same pinned Memory revision. Initial fixture setup refused a missing directory before any app run; creating the empty dedicated directory satisfied the Core's root requirement.

## Limits

This run generates the installer but does not install, upgrade or uninstall an owner's application, change the real login-startup value or perform an actual sign-in. The isolated Rust registry test uses a separate non-startup test key and removes it. Main's [installer drill report](Desktop-installer-v1.md) remains historical evidence for its recorded binaries; it is not a new installed-artifact drill on this combined release. Root domain code and its lockfile are unchanged, so existing domain tests remain applicable; the dependency/evidence guards were repeated here.

No personal Vault, real export, migration, actual restore, live Provider, cloud stage or production Activity was used. Narrator, a real Windows contrast theme, physical tray-menu interaction, shutdown during long verification/backup, signing, power-loss durability and broader real storage-error recovery remain unverified. Existing focused reports retain their original pins and executable hashes; this fresh report does not claim that every historical focused mode was rerun.
