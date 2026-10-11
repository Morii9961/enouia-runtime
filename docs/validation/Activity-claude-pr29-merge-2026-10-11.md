# PR #29 brought up to the MV-7 main (2026-10-11)

Claude took over [PR #29](https://github.com/Morii9961/enouia-runtime/pull/29) at the owner's request after Codex's [session handback](Activity-session-handoff-2026-10-10.md). The branch had been cut before [PR #30](https://github.com/Morii9961/enouia-runtime/pull/30) moved the Memory pin from `ff692cc` to `8186aed861af08cf7a2c5d8c912a24eae51b4d66`. Merge commit `0853fc97aea2a56f897d613522777f674d4de5a0` joins Codex's head `64659d93e70eb8b6e1b7ff7ad8c7c833d53779b2` with main `36c65421e46a5bdf76b63b2635585a277e3e3f45`. Git reported no conflicts, and no file was edited during the merge. Both sides changed `apps/desktop/src-tauri`: PR #29 changed `activity.rs` and added the `Win32_System_Pipes` feature, while PR #30 changed the pin, `provider.rs` and the Memory surfaces. The merged product was therefore rebuilt and checked again, and the evidence from either side alone was not reused.

## Checks on the merged tree

| Check | Result |
|---|---|
| src-tauri `cargo fmt -- --check`, `cargo test --locked`, `cargo clippy --locked --all-targets -- -D warnings` | Passed: 58 host tests (PR #29's 54 plus PR #30's 4 provider tests) and 3 pinned-Core tests. |
| Root workspace `cargo test --locked --workspace`, `cargo fmt --all -- --check` | Passed: 230 tests. Producer, store and runner sources are identical on both sides. |
| `npm ci`, `npm test`, `npm run build` (strict TypeScript) | Passed 67/67 (63 Activity-side plus 4 from MV-7). |
| `npm run desktop:bundle` | Built the release executable and the unsigned NSIS installer. |
| `template-check.ps1` on the rendered installer | 26/26 ownership checks. |
| `check-domain-boundaries.mjs --self-test`, `check-memory-integration.mjs --self-test`, `check-activity-evidence.mjs --self-test`, `git diff --check` | Passed: 7, 8 and 79 negative checks respectively. The evidence index is unchanged at 72 reports. |

## Native runs on the merged build

The release executable from the merged tree has SHA-256 `bf09c7368e63771460b35d4da03803b94ec03eadf853336a409109745c6a206a`, the installer `9a1a6035ba78a5f1af9a40c75382e20eb24d381ab0948ef5a866b74ff8318674` and the release runner `ea15ad952b076042f4ab9c798fdea85cf6163093252af77b9493fd691894dce1`. Each Activity run used a fresh package from `prepare-activity-surface-sandbox.mjs`. Those packages hold synthetic three-source history and the loopback receiver/publisher copied from the public Moriium files at `fd48f88c8b480480fd48a8efe36ef400b3be99b8`, and those files were clean before and after the runs. Each Memory run used a fresh Vault created by `enouia-memory init` at the pinned revision, plus a synthetic Markdown file.

| Report | Result |
|---|---|
| [Activity default smoke](Activity-claude-pr29-merge/activity-default.json) | 29/29 |
| [Activity actions with pinned-Core index isolation](Activity-claude-pr29-merge/activity-index-isolation.json) (`--index-isolation`, the 35-check scope of earlier reports) | 35/35 |
| [Memory `--sessions-only`](Activity-claude-pr29-merge/memory-sessions-only.json) | 19/19 |
| [Memory `--source-paging-only`](Activity-claude-pr29-merge/memory-source-paging-only.json) | 16/16 |
| [Memory `--session-writes-only`](Activity-claude-pr29-merge/memory-session-writes-only.json) | 21/21 |

The first Memory attempt scored 1/2 in all three modes. The [retained report](Activity-claude-pr29-merge/memory-sessions-only-harness-failure.json) shows the cause: the Vault root folder did not exist, so `enouia-memory init` answered `root_rejected` and the app could not open a Vault. The product was not at fault. Creating the folder before `init` fixed the problem and changed no code.

The default Memory smoke was not run because it sends OS hotkeys, which need the spawned window in the foreground, and the owner was using the desktop. The MV-7 record documents the same limitation. Those steps cover only the global hotkey and quick search, which neither side changed.

Raw reports are stored with LF line endings. The table below lists SHA-256 hashes of the committed bytes.

| File | SHA-256 |
|---|---|
| `activity-default.json` | `b26bf346592eea3f1548d1aa3ded0fd8f123fe4bf366a108981a5628cda13c50` |
| `activity-index-isolation.json` | `91c9289add8dd397385b87fdb3e790cd959a142528173e24b34081a78ed5b321` |
| `memory-sessions-only.json` | `4eed2264c9a35c86413faceadcd70ce19d56c018f2b9583acb321eed5dd0d22a` |
| `memory-source-paging-only.json` | `b8404f6df538f4c2e66484db5a1b1167417831604724fdf0b029b89cf6e73edf` |
| `memory-session-writes-only.json` | `e1b5075f4d93b87b3590601f27f6ac2e8c4d21ac133d9b4926db1f396a05baaf` |
| `memory-sessions-only-harness-failure.json` | `70fbe8057b85d29d88de8d47fd931e63e680c2a6e894b63c8a373b34c9a3c16f` |

## Scope

These are regression runs on the merged build, so no B4 selector was added and the index stays at 72 reports, 1,267 selectors and 79 negative checks. All 18 matrix rows remain partial, J1/B4 are not signed off and B5 is inactive. No personal data, account, credential, Provider call, scheduled task, live delivery, installation, signing or deployment was involved. The Memory repository checkout was not touched. The pinned CLI was built from Cargo's Git cache into a temporary target.
