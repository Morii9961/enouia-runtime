# Real verify and backup lifecycle — 2026-10-07

Runtime now keeps a waiting view and actual operation progress while a Vault lock is joining a non-cancellable worker. The native baseline exposed a misleading transition: Core had detached its Vault slot and reported `locked`, so the next frontend status refresh hid a running backup and offered Unlock before Runtime had finished releasing the Vault.

Baseline: main `d9c93f6ed9cb6c687aed126a05fb8c043eeb3d3e`, executable SHA-256 `1cb273b9844336328ff72a3cb41cb262b85d5bb6ca367938c803c62f0da842ce`. Memory remains pinned to `ff692ccb6fbc1c387254d5ffbef41b105eeb2a84`, surface aggregate `c49bbaa9f82c21a812a34a247e4a5595cd51707ab406bb8205444f8259a17212`. No Memory domain implementation, dependency, pin or canonical status envelope changed.

## Runtime change

The main-window-only `shell_status` now exposes `vaultChanging` from Runtime's existing counted lifecycle admission guard, covering page and tray transitions, including queued transitions. The shared frontend status read observes Core first and Runtime admission second. The two values remain separate: the UI does not rewrite the Core's detached slot to impersonate an open Vault.

While admission is still changing, the header, Home and Settings say that Runtime is finishing the Vault change. Vault connection controls give way to waiting feedback and real `operation_list`/`operation_get` progress. Unlock and root selection return only after admission is released. Settings also withholds Quick Search during page-triggered transitions. Exit retains priority over the pending-change label. Polls are serial, clean up on unmount and ignore late receipts through the existing latest-read guard.

## Real synthetic workload

The dedicated temporary Vault was initialized and populated through the CLI built from the same pinned Memory revision. Its input is exactly **536,870,912 bytes (512 MiB)**: the UTF-8 prefix `Synthetic Enouia Runtime long-operation acceptance fixture.` followed by zero bytes. The importer archives this unsupported binary verbatim, with `partial`/`unsupported_format`, one raw object and no parsed conversations or approved memories. This intentionally exercises stored-byte hashing and backup I/O; it is not a successfully parsed personal export.

Raw object SHA-256: `ab64be8fbf445d30fd54336901aca01d849e76468a31e87b130bc9809f18f1e6`. Canonical commit: `cmt_0d453864-62f2-4859-a1a5-9e80565c84d2`, sequence 2. Each completed export contains 9 files and that same commit.

`memory-smoke.mjs --long-lifecycle-only` refuses a fixture outside its dedicated temporary path, linked fixture roots, unexpected input bytes/size or an unexpected raw-object layout. It launches only its own release processes with isolated WebView2 profiles. Native folder selection targets only the owned process; CDP checks listener ancestry before connecting.

For each real `vault_verify` and `backup_export` worker it checks:

- Actual running state and the absence of a Cancel control.
- Titlebar Close hides the app while the worker and open Vault continue; completed verification is clean and the backup reports the original commit.
- Lock keeps Core observations available, refuses Quick Search with `runtime_busy` and reports live Runtime admission. The harness observes an actual periodic provider status receipt during the worker, then checks waiting feedback, retained/re-read progress and the absence of premature Unlock controls.
- The worker finishes intact, admission clears and unlocking succeeds.
- Settings Exit starts with an actual running worker, displays waiting feedback, reports `companion.exiting`, refuses a new write with `runtime_closing`, and the owned process exits 0. Reopening the same Vault preserves the canonical commit and sequence.
- A prepared Restart Manager session registers only the owned Runtime PID and creation time before starting work. After Core reports a running worker, the helper requests cooperative shutdown with flags 0, without a forced-kill fallback. Runtime exits 0, the Vault reopens at the same commit, and a fresh verification is clean. The backup from this path is independently valid.
- The pinned release CLI independently runs `verify-export` over all four completed backup folders (hidden work, lock, Settings exit and Restart Manager), verifying every file and the exported history, with `valid:true` and the same canonical commit.

No callback receipt is delayed, no worker sleeps are injected and no operation state is invented. An observation wrapper records actual status callbacks and forwards each immediately. Start timing is aligned with a real periodic read because verification on this host is shorter than three seconds; merely waiting for three seconds would not establish that a refresh occurred while work was running. The baseline backup trace reproduced the premature Unlock/progress disappearance after a real refresh. The final traces cover a locked Core slot and a still-running worker for both operation kinds.

## Verification

| Check | Result |
|---|---|
| Final native long-work mode, including cooperative Restart Manager | 45/45, exit 0 |
| Four independent full export validations | All valid; 9 files each; same canonical commit |
| Full native regression on a fresh synthetic Vault | 101/101, exit 0 |
| Frontend strict type check, production build and tests | Pass; 24/24 tests |
| Rust formatting, locked tests and Clippy with warnings denied | Pass; 24 host tests and 3 pinned-Core integration tests |
| Memory pin/self-test and pinned surface comparison | Pass; 8 negative checks; same pinned revision |
| Locked desktop domain boundary | Pass; 7 pinned Memory packages and 7 negative checks |
| Unsigned x64 NSIS bundle generation | Pass; approximately 7.19 MiB |
| Installer ownership checks, including rendered template | 26/26 |
| Harness syntax and diff checks | Pass |

Final executable SHA-256: `2aa9d860f3c87eadc5312824f486f9f7178611e63d111bc7d6f18e9f1d534223`. Installer SHA-256: `f77d2d7136ecce3b87c4427306bec76f2685b71749f1a0b3987566e37a2dda9f`. The final native backup-waiting screenshot was inspected: the header and waiting card agree, real backup progress is visible, and no Unlock control is present.

Reports, traces, screenshots and backups are outside Git under `%TEMP%`:

- `enouia-runtime-long-lifecycle-20261007-01a10b3a/smoke-baseline-v3` (baseline backup UI failure; the verify observation gate was subsequently aligned to a periodic read).
- `enouia-runtime-long-lifecycle-20261007-01a10b3a/smoke-final-v2` (final release, 37/37).
- `enouia-runtime-long-lifecycle-20261007-01a10b3a/smoke-os-final` (final release and complete mode, 45/45, including cooperative Restart Manager).
- `enouia-runtime-long-lifecycle-regression-20261007-01a10b3a/smoke` (fresh full regression).

The mode expects the pinned release CLI at `apps/desktop/src-tauri/target/pinned-cli/release/enouia-memory.exe`. Build it using `cargo build --release --locked --manifest-path <pinned-memory-checkout>/Cargo.toml -p enouia-memory-cli --target-dir <runtime-checkout>/apps/desktop/src-tauri/target/pinned-cli`. Create an empty dedicated temporary `vault` directory before `init --confirm-new-vault`; import the synthetic binary with `--account synthetic-lifecycle --confirm-import`. Pass the release executable, Vault, `synthetic-archive.bin` and a fresh output directory directly beneath the fixture root, followed by `--long-lifecycle-only`. A slower or faster host must still satisfy the observed-running/actual-refresh checks; elapsed time alone is not acceptance evidence.

## Limits

This establishes actual long-work behavior on this development host through the titlebar, page Lock/Settings Exit and cooperative owned-process Restart Manager routes. The tray shares Runtime admission and Core shutdown, but physical tray-menu invocation is not exercised here. It is not power-loss durability, an actual Windows sign-out/shutdown drill, broader storage-error recovery or performance benchmarking. No whole-system session end is requested. The default regression separately retains its cancelled session-end path on an ordinary fixture.

No personal Vault, migration, actual restore, live Provider, cloud stage, production Activity, real login-startup change, installed-app replacement or owner's uninstall was performed. Narrator, a real Windows contrast theme, actual sign-in startup, signing and physical tray interaction remain acceptance gates. Historical reports retain their original binaries and scopes.
