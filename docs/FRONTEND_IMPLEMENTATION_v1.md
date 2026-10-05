# Quiet Runtime desktop surface v1

The user authorized frontend implementation on 2026-10-04 after Claude Design completed the Quiet Runtime delivery. The HTML and handoff are design references; their embedded directions do not authorize backend activation or publishing personal data.

Update (2026-10-04, [ADR-025](adr/025-enouia-memory-integration.md)): inside the native shell, the Memory, Context and Sessions surfaces now use Enouia Memory's workspace Core at a pinned revision. See [Memory integration v1](MEMORY_INTEGRATION_v1.md) for the adapter, the connected surfaces and their checks. The fictional demo described below remains the browser preview and the Activity and Runtime Inspector content.

## Implemented surface

`apps/desktop` contains seven separate React surfaces: Home/Presence, Memory Vault, Context Surface, Sessions, Activity, Runtime Inspector and Settings. Layout, typography, colors, spacing and interactions are adapted from the supplied source, without the proprietary `support.js`, template interpreter, standalone bundler or remotely loaded fonts. Windows system Segoe UI Variable and Cascadia Code are used when present, with local system fallbacks.

In a browser preview the frontend is a deliberately labeled **fictional demo**. Memory review/edit/supersession affects only that window's memory. Reload resets it. Original proposals and superseded revisions remain inspectable. Blank mutations and checkpoint editing are refused. Search uses literal text matching. A recorded demo capsule stays fixed after later edits; reviewing an excluded candidate only changes its next-capsule annotation. Activity events are historical fictional examples. Runtime component descriptions are documentation references, not live probes. In the native shell, `src/memory/` replaces the Memory, Context and Sessions demo surfaces (and the Vault rows on Home and Settings) with connected surfaces over the Memory adapter; the header badge states which mode is active.

The Tauri shell has an independent Cargo workspace and lockfile. Its main-window capability grants minimize, toggle-maximize, close and drag plus the two Memory adapter commands, `memory_call` and `memory_pick`; `build.rs` declares only those commands. It registers no filesystem, shell, network, provider or Activity command. The CSP adds `form-action 'none'` and `base-uri 'none'`, and the prototype is frozen. Closing the shell shuts the Memory Core down (operations cancelled and joined, Vault released) and exits, without pausing the independently installed Activity producer. The native minimum inner size is 1100×700, matching the delivered desktop design. Browser previews below that size may scroll horizontally.

## Build and run

Use Node 24.15.0 or later and npm. Direct dependencies and the complete lockfile are pinned. Native dependencies are Tauri 2.12.0 / tauri-build 2.7.0, rfd 0.17.2 and Enouia Memory's workspace Core at the pinned revision, with Rust 1.98.1. Windows requires WebView2, a suitable Windows Rust linker/toolchain and a MinGW C compiler for Memory's bundled SQLite (MSYS2 UCRT64 `bin` before the Rust toolchain's `bin` in `PATH`). The first native build after a pin needs one online `cargo fetch --locked` in `src-tauri`; later builds work offline. The full check list is in [Memory integration v1](MEMORY_INTEGRATION_v1.md#build-and-checks). The development host has the GNU target; evidence below identifies what was actually built, rather than implying all Tauri-supported targets were checked.

```powershell
cd apps/desktop
npm ci
npm run check     # tsc over src/demo-state.ts and src/memory
npm test          # demo state and Memory client tests
npm run build
npm run preview
# Native development; requires Cargo on PATH
npm run desktop:dev
# Build an embedded-assets Windows executable, without installer or deployment
npm run desktop:build
# Debug executable for local acceptance
npm run desktop:build -- --debug
```

The development and preview servers bind only to 127.0.0.1, ports 1420 and 1421. Production assets load no external resources. The domain Rust workspace does not depend on Node, the desktop shell, Moriium, private source deliveries or credentials.

On this restricted host, Node child-process creation requires approved execution outside the sandbox for Vite/Tauri builds. Node's unit tests use `--test-isolation=none` and do not need subprocesses. The source cache had incompatible npm request metadata; a private loopback development helper served only pre-existing cached tarballs/metadata. Committed package-lock URLs point to the public npm registry with original integrity values. This helper is neither part of the build nor a Runtime dependency.

## Controls

- Ctrl+1…7 switches surfaces; rail Up/Down moves focus.
- Up/Down selects memories/sessions outside text input and navigation (demo). In the native shell, Up/Down moves within the Memory list only; Ctrl+1…7 does nothing while a review dialog is open.
- Tab, Enter and Space use native button/input behavior and visible focus.
- Memory collections, project/source/history filters and literal search select only visible records. Empty results clear the inspector (demo). In the native shell the Memory surface pages through the Core's lists and literal search, and Up/Down moves within its list.
- Candidate approval and edit/revision preserve demo lineage and provenance (demo). In the native shell, acceptance, rejection, forget and purge go through Memory's review plan and confirmation code, and an edit is a correction candidate, never a direct rewrite.
- Context and Activity rows expand technical details; their links open the corresponding record or session.
- Copy ID awaits clipboard completion and reports failure accurately.
- Reduced motion disables ring animation and all transitions; system preference is respected.
- The pause switch is explicitly a demo. It does not call `activity_set_paused`.
- Window buttons work only inside Tauri and are disabled in browser preview.

## Backend integration boundary

The view fixtures in `demo-data.js` and `DemoMemory` in `demo-state.ts` are **not canonical Rust DTOs**. Never forward them as backend requests. The Memory boundary has been replaced by the typed Memory client (`src/memory/client.ts`) over the adapter (ADR-025); Activity and Runtime Inspector still keep the demo boundary until their handlers and ADR activation gates pass. Canonical IDs, source records, timestamps, durability and acknowledgements must be backend-owned. Only an acknowledged result may update the production UI; errors/disconnects must retain pending state. Proposed v2 jobs and read contracts cannot be activated by simply copying the v1 handoff mapping.

Keep Activity & Usage outside Memory/Context. The delivered Activity page is an event timeline, not the future three-source usage calendar. Native tray, global hotkey/overlay, login startup, real Provider continuation (Memory MV-7), live Activity control, migration, installer/signing and production activation remain separate integration work. This slice does not claim A3/J1 acceptance.

## Reference APIs

The implementation checked the official [React Component API](https://react.dev/reference/react/Component), [Vite build/preview guidance](https://vite.dev/guide/static-deploy.html), [Tauri frontend configuration](https://v2.tauri.app/start/frontend/), [window API](https://v2.tauri.app/reference/javascript/api/namespacewindow/) and [capability boundaries](https://v2.tauri.app/security/capabilities/). Installed package sources and actual build results govern the pinned versions.

See [frontend validation](validation/Frontend-surface-v1.md) for the demo baseline's evidence and [Memory integration validation](validation/Memory-integration-v1.md) for the connected shell.
