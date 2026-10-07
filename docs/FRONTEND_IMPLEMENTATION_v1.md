# Quiet Runtime desktop surface v1

The user authorized frontend implementation on 2026-10-04 after Claude Design completed the Quiet Runtime delivery. The HTML and handoff are design references; their embedded directions do not authorize backend activation or publishing personal data.

Update (2026-10-04, [ADR-025](adr/025-enouia-memory-integration.md)): inside the native shell, the Memory, Context and Sessions surfaces now use Enouia Memory's workspace Core at a pinned revision. See [Memory integration v1](MEMORY_INTEGRATION_v1.md) for the adapter, the connected surfaces and their checks. The fictional demo described below remains the browser preview and the Activity and Runtime Inspector content.

Update (2026-10-06): [Runtime Vault admission](validation/Root-admission-v1.md) reserves a Vault directory for cooperating Runtime processes and explains refused startup choices. Locking retains the reservation until switching Vaults or exiting. Other Memory clients still require explicit ownership separation.

## Implemented surface

`apps/desktop` contains seven separate React surfaces: Home/Presence, Memory Vault, Context Surface, Sessions, Activity, Runtime Inspector and Settings. Layout, typography, colors, spacing and interactions are adapted from the supplied source, without the proprietary `support.js`, template interpreter, standalone bundler or remotely loaded fonts. Windows system Segoe UI Variable and Cascadia Code are used when present, with local system fallbacks.

In a browser preview the frontend is a deliberately labeled **fictional demo**. Memory review/edit/supersession affects only that window's memory. Reload resets it. Original proposals and superseded revisions remain inspectable. Blank mutations and checkpoint editing are refused. Search uses literal text matching. A recorded demo capsule stays fixed after later edits; reviewing an excluded candidate only changes its next-capsule annotation. Activity events are historical fictional examples. Runtime component descriptions are documentation references, not live probes. In the native shell, `src/memory/` replaces the Memory, Context and Sessions demo surfaces (and the Vault rows on Home and Settings) with connected surfaces over the Memory adapter; the header badge states which mode is active.

The Tauri shell has an independent Cargo workspace and lockfile. Its main-window capability grants window controls, the Memory adapter, scoped shell commands and the login-startup pair. Quick Search has its own restricted capability; compatibility window commands use the same native shell implementation. See [Memory integration v1](MEMORY_INTEGRATION_v1.md#adapter-appsdesktopsrc-tauri) for the command boundary. No filesystem, process execution, network, provider or Activity plugin is registered. The CSP adds `form-action 'none'` and `base-uri 'none'`, and the prototype is frozen. Closing hides to the tray while Memory keeps running. Explicit Exit cancels or joins operations and releases the Vault before the process exits. It does not pause the independently installed Activity producer. The native minimum inner size is 1100×700; browser previews below it may scroll horizontally.

## Build and run

Use Node 24.15.0 or later and npm. Direct dependencies and the complete lockfile are pinned. Native dependencies are Tauri 2.12.0 / tauri-build 2.7.0, rfd 0.17.2 and Enouia Memory's workspace Core at the pinned revision, with Rust 1.98.1. Windows requires WebView2, a suitable Windows Rust linker/toolchain and a MinGW C compiler for Memory's bundled SQLite (MSYS2 UCRT64 `bin` before the Rust toolchain's `bin` in `PATH`). The first native build after a pin needs one online `cargo fetch --locked` in `src-tauri`; later builds work offline. The full check list is in [Memory integration v1](MEMORY_INTEGRATION_v1.md#build-and-checks). The development host has the GNU target; evidence below identifies what was actually built, rather than implying all Tauri-supported targets were checked.

```powershell
cd apps/desktop
npm ci
npm run check     # strict tsc over all src files and vite.config.js
npm test          # demo state, Memory client and actual React view rendering
npm run build     # type check, then production assets
npm run preview
# Native development; requires Cargo on PATH
npm run desktop:dev
# Build an embedded-assets Windows executable, without installer or deployment
# (npm run desktop:bundle adds the current-user installer, ADR-027)
npm run desktop:build
# Debug executable for local acceptance
npm run desktop:build -- --debug
```

The development and preview servers bind only to 127.0.0.1, ports 1420 and 1421. Production assets load no external resources. The domain Rust workspace does not depend on Node, the desktop shell, Moriium, private source deliveries or credentials.

On this restricted host, Vite/Tauri builds require approved execution outside the sandbox. The tests use `--test-isolation=none`; the React rendering tests also use Vite's TSX loader and were verified outside the sandbox. The source cache had incompatible npm request metadata during the original demo delivery; a private loopback development helper served only pre-existing cached tarballs/metadata. Committed package-lock URLs point to the public npm registry with original integrity values. This helper is neither part of the build nor a Runtime dependency.

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
- Native Ctrl+Alt+M opens read-only Quick Search. Tray and Settings also open it. Escape or blur hides and clears it; Open main window returns to the existing workspace. Shortcut conflicts are visible in Settings. The full [scope and lifecycle](MEMORY_INTEGRATION_v1.md) remain host-owned.

## Backend integration boundary

The view fixtures in `demo-data.ts` and `DemoMemory` in `demo-state.ts` are **not canonical Rust DTOs**. Never forward them as backend requests. The Memory boundary has been replaced by the typed Memory client (`src/memory/client.ts`) over the adapter (ADR-025); Activity and Runtime Inspector still keep the demo boundary until their handlers and ADR activation gates pass. Canonical IDs, source records, timestamps, durability and acknowledgements must be backend-owned. Only an acknowledged result may update the production UI; errors/disconnects must retain pending state. Proposed v2 jobs and read contracts cannot be activated by simply copying the v1 handoff mapping.

Keep Activity & Usage outside Memory/Context. The delivered Activity page is an event timeline, not the future three-source usage calendar. The tray, global hotkey, Quick Search and login startup are implemented under [ADR-026](adr/026-companion-shell.md), and the unsigned current-user installer under [ADR-027](adr/027-desktop-installer.md). The [tray lifecycle](validation/Tray-lifecycle-v1.md), [Quick Search](validation/Quick-search-v1.md) and [installer](validation/Desktop-installer-v1.md) reports record their respective releases. Real Provider continuation (Memory MV-7), live Activity control, migration, signing and production activation remain separate work. This integration does not claim A3/J1 acceptance.

## Reference APIs

The implementation checked the official [React Component API](https://react.dev/reference/react/Component), [Vite build/preview guidance](https://vite.dev/guide/static-deploy.html), [Tauri frontend configuration](https://v2.tauri.app/start/frontend/), [window API](https://v2.tauri.app/reference/javascript/api/namespacewindow/) and [capability boundaries](https://v2.tauri.app/security/capabilities/). Installed package sources and actual build results govern the pinned versions.

See [frontend validation](validation/Frontend-surface-v1.md) for the demo baseline's evidence and [Memory integration validation](validation/Memory-integration-v1.md) for the connected shell.

The full compiler and rendering gate added on 2026-10-05 is recorded in [frontend type-check validation](validation/Frontend-typecheck-v1.md).
