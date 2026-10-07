# Forced-colors selection — local evidence

Date: 2026-10-06. Baseline: `dc18428`. Scope: the shared frontend stylesheet and a focused WebView2 harness mode. Memory pin, contract, host code and ordinary theme are unchanged.

In WebView2 forced-colors media emulation, the navigation and Memory collection's background-only selected appearance disappeared. The baseline focused run passed 6/9 checks: both selected outlines were absent and the existing keyboard outline was thin. Screenshots confirmed the missing cues.

The forced-colors rule adds an inset `Highlight` outline to current-page and pressed buttons, and an outward `CanvasText` outline to keyboard focus. A focused selected button uses the focus outline. System color adjustment remains enabled. This is a small contrast-theme adjustment following [MDN's forced-colors guidance](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/forced-colors); it does not disable the user's palette or change the layout.

| Verification | Result |
|---|---|
| Type checking and frontend suite | Pass; 15 tests |
| Embedded-assets Windows GNU release | Pass; no installer |
| Focused native WebView2 run | 9/9 pass on a fresh synthetic Vault |
| Fixed-pin and domain guards | Pass; 8 and 7 negative checks |
| Harness syntax and diff checks | Pass |
| Unchanged Core/host flows | Prior host and native regression evidence remains scoped to the earlier slices; this run is not a new full smoke pass |

The harness proves the media query is active, checks both selected outlines, dispatches Tab inside its owned CDP page, checks the distinct focus cue, restores the media state and checks ordinary selection. The before/after screenshots were inspected. It rejects foreign debug listeners and exits its own host cleanly. No Windows setting is changed and no OS keyboard input is sent. See [CDP media emulation](https://chromedevtools.github.io/devtools-protocol/tot/Emulation/#method-setEmulatedMedia).

One sandboxed frontend test attempt failed while evaluating SSR (`module is not defined`). The same suite passed outside that process sandbox; no source change was made for the environment failure.

Release executable SHA-256: `c86271e853ac5c61602dc4cda096d899b39468be8e0445e29f88822baeb20cc4`.

Reports/screenshots are retained under the temporary `enouia-runtime-contrast-before-20261006-01a10b3a` and `enouia-runtime-contrast-final-20261006-01a10b3a` fixture folders. This is browser media emulation on the native WebView, not real Windows contrast-theme or Narrator acceptance. Different system palettes, selected memory/session rows, physical assistive technology and the installed artifact remain unverified. W05 remains partial.
