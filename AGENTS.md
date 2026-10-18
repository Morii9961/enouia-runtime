# Enouia Runtime repository guidance

Architecture v0.3 and the ADR register define the current implementation boundaries. A later ADR changes behavior only after its stated activation gates pass. Keep Activity & Usage independent of Memory/Context, and keep the Runtime build independent of the Moriium checkout and private credentials.

Memory domain routing (ADR-025, 2026-10-04): the Enouia Memory repository (`Morii9961/enouia-memory`) owns Identity, Memory, review, Sessions, Vault, index, Context, the Provider path and every cloud stage. Runtime is the Windows client that hosts Memory's local frontend. `apps/desktop/src-tauri` embeds `enouia-memory-workspace` at the exact revision in `docs/integration/memory-pin.json` behind the adapter in `src/memory.rs`, and the desktop's Memory, Context and Sessions surfaces live under `apps/desktop/src/memory/`. Make Memory domain changes in the Memory repository under its own stage rules. Runtime only bumps the pin and changes its adapter and surfaces, following [Memory integration v1](docs/MEMORY_INTEGRATION_v1.md), and never commits a path dependency, branch, `[patch]` or local fork. The Runtime-local `enouia-memory`, `enouia-session`, `enouia-context`, `enouia-provider` and `enouia-core-contract` crates and the ADR-020–024 design corpus are frozen history: do not extend them. Activity & Usage stays Runtime's independent domain and never passes through the Memory adapter.

Current user scope (2026-10-04, latest update): implement the frontend from the completed Claude Design Quiet Runtime delivery. The user has explicitly authorized frontend work, superseding the earlier backend-only restriction. Implement the seven surfaces and Windows shell while preserving the existing backend boundaries. Display fictional demo data explicitly until real handlers are available; inside the native shell the Memory, Context and Sessions surfaces now use the pinned Memory Core and the Activity surface reads the separately installed producer through its runner (ADR-028), while browser previews and the Runtime Inspector stay explicitly fictional. Frontend state must not impersonate canonical backend commits or control the installed Activity scheduler. A frontend implementation request does not itself authorize opening a personal Vault, personal migration or production activation.

The user explicitly requested continuous work across backend design slices. Verify, commit and push each completed slice, then proceed to the next backend design boundary without stopping for a routine continuation prompt. This supersedes earlier per-milestone stopping preferences within the current design scope. Since ADR-025, Memory-domain backend design continues in the Memory repository, not here. Each Runtime integration slice (a Memory pin bump, or porting tray, hotkey and overlay, login startup or the installer) starts only when the owner asks for it.

When Codex materially contributes to a commit in this repository, include this exact trailer after a blank line in the commit message:

```text
Co-authored-by: Codex <267193182+codex@users.noreply.github.com>
```

This trailer identifies the public GitHub `codex` account. Do not add it when Codex did not contribute. Preserve other contributors' changes and use the checks appropriate to the changed files before reporting completion. Desktop changes run the checks listed in [Memory integration v1](docs/MEMORY_INTEGRATION_v1.md), including `node scripts/check-memory-integration.mjs`.

## Design redesign workflow (design-kit v2)

Visual redesign work follows the design kit in [`docs/design-kit/`](docs/design-kit/): `divergence.md`, `anti-slop.md`, `directions.md`, `critique.md` and, for this app, `existing-app.md` (contract versus skin, worktree variants, desktop viewports); `type-cjk.md` and `dashboard.md` when prototyping. Scratch output lives in the git-ignored `.design/`; screenshots come from `tools/shot.mjs` run in `.design/`. `DESIGN.md` stays a template until the owner picks a direction.

EXPLORE runs in four phases and stops after phase 3:

| Phase | Work | Output in `.design/` |
| --- | --- | --- |
| 0 Recon | Contract list versus skin list; baseline screenshots of the browser preview at 1100, 1440 and 1920 wide plus the minimum window | `00-recon.md`, `shots/baseline/` |
| 1 Diverge | 8 concepts, drop the first 3, keep 5, pass the distance rules | `01-directions.md`, one `DIRECTION.md` per direction |
| 2 Prototype | One worktree and branch per direction (`redesign/<n>-<name>`, own `npm ci`, own port, never 1420/1421); slices: Home, Memory Vault, the denser of Sessions/Context, quick search overlay, minimum window, one edge state; at least two critique rounds | `critique-log.md` per direction |
| 3 Present | Side-by-side `review/index.html` with each direction's bet, weakness and contract pressure; then stop for the owner's choice | `review/index.html` |

Authorized scope for this exploration (2026-10-18, owner request; it overrides the continuous commit-and-push convention above for this work only): presentation-layer changes under `apps/desktop/src` (styles, component structure, layout, fonts, icons, copy voice with unchanged meaning) and fictional demo data extensions, committed locally on `redesign/*` branches. Not authorized: `apps/desktop/src-tauri/`, the Memory pin, the Activity producer, any backend or contract, activation or release, pushing, PRs or merges. Screenshots come only from the browser preview's fictional demo, never from the native shell's real Vault or Activity data. Every direction keeps the contract in `docs/FRONTEND_IMPLEMENTATION_v1.md` (Controls, honest fictional-demo labels, confirmation flows, Activity independent of Memory/Context, no external resources) and passes `npm run check`, `npm test`, `npm run build` and `node scripts/check-memory-integration.mjs` as at baseline. New fonts need verified licenses, self-hosting, a third-party notice update and an installer size estimate (ADR-027). Contract problems go to `.design/spec-issues.md`, not into behavior changes. Design commits made by Claude do not carry the Codex trailer.
