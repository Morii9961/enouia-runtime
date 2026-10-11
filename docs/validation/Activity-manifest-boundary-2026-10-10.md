# Same-handle Activity install-manifest bounds

Date: 2026-10-10. Baseline: `74c7e8fb5dcc2b9ca0d00e79c8e54fafc7688af6`. This changes the desktop host's installation-manifest reader; Activity producer/store, IPC and Memory pin stay unchanged. J1/B4 remain partial, B5 inactive.

The previous `load_install` queried `install.json` size, closed that observation and then read the entire file through another open. A file growing between those steps could exceed the intended 64 KiB budget. Settings already counted bytes from one open handle.

Both settings and installation manifests now use the same bounded JSON reader: open once, consume at most **65,537 bytes**, reject more than **65,536**, then parse. There is no earlier metadata size on which the read depends. Existing `not_a_package`, absolute saved-root, manifest field/path and binary-hash validation remain in place. A package test helper now creates unique directories instead of deleting a prior fixed-name fixture.

## Evidence

The [hashed proof](Activity-manifest-boundary/proof.json) records a frozen executable from the current unsigned NSIS build and four serial native runs, each on a new contained synthetic fixture. Each package manifest's original SHA-256 is checked after its run; the drill restores exact bytes even when native cleanup fails.

| Actual native scope | Result |
| --- | --- |
| [Install-manifest startup, real picker and recovery](Activity-manifest-boundary/manifest.json) | 21/21 |
| [Saved-root bounded/absolute startup and picker regression](Activity-manifest-boundary/settings.json) | 20/20 |
| [Staged settings replacement/refusal regression](Activity-manifest-boundary/atomic.json) | 18/18 |
| [Actual actions and pinned-Core isolation](Activity-manifest-boundary/actions.json) | 35/35 |

The manifest drill tests valid JSON plus one byte over the limit, a 256 KiB padded manifest, and malformed JSON. Each startup stays unconfigured, the actual native picker returns `not_a_package`, and manifest/settings/store bytes remain exact. A valid manifest padded to exactly 64 KiB connects on startup and via the picker. Restoring the original manifest and restarting recovers the verified saved choice and unchanged three-source data.

The [43 host + 3 pinned-Core test run](Activity-manifest-boundary/tests.json) includes three new behavioral tests:

- A counting reader proves that an oversized stream consumes exactly the limit plus one probe byte. Exact-limit valid JSON parses; malformed JSON refuses.
- An actual file is opened and its initial size observed, then whitespace is appended deterministically. The old size-query/unbounded-read control consumes and parses the oversized JSON. The new helper refuses through that already-open reader. This exercises the read boundary, not a concurrent desktop mutation race.
- A complete synthetic installed package accepts an exact-limit padded manifest, rejects one extra byte, and retains the refused bytes.

Fresh checks: desktop fmt/clippy, strict TypeScript and frontend build, 58 frontend tests, unsigned native/NSIS build, 26/26 rendered/source installer ownership checks, Memory guard with 8 negatives and resolved domain guard with 7 negatives. The runner is the unchanged independently rebuilt producer from the prior slice; only this desktop is rebuilt.

C17 gains 24 selectors (21 manifest-native checks plus 3 behavioral Rust tests). Evidence integrity is **62 reports / 1,014 selectors / 64 negative checks**. Counts overlap, all 18 rows retain their gaps, and no milestone or production gate is signed off.

No personal settings/Vault, account, credentials, task, live delivery or server was touched. The installer was built, not installed or signed. This does not establish sustained third-party mutation during desktop loading, real disk-full/power loss or production acceptance.
