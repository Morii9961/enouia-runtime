# Complete Activity recorded-days access

Date: 2026-10-08. Scope: Runtime presentation and isolated native verification. B4/J1 remain partial; B5 stays inactive.

The accessible recorded-days tables previously exposed only fourteen dates, leaving older chart values unavailable through keyboard page controls. The actual prior desktop reproduces this gap: [baseline](Activity-unified/full-days-before.json) passes 10/16, with exactly two expected failures for each source (missing complete-history control and inaccessible complete date/value series).

Each table now keeps the fourteen most recent dates by default and provides Show all recorded days / Show recent days when the source contains more. The button declares its expanded state and controlled table body. Full and recent views retain descending dates, exact values, explicit zeros, source-specific units and semantic row headers. Short histories add no extra control. No history is edited.

The [current native history run](Activity-unified/full-days-after.json) passes **16/16**. Actual owned-WebView Ctrl+5, Tab and Enter actions expose every date/value in the real preview: **400 GitHub, 220 Codex and 250 Claude synthetic days**, then restore each exact fourteen-row recent view. Complete Activity bytes are unchanged. The [separate fresh keyboard action flow](Activity-unified/full-days-keyboard.json) passes **11/11**, including durable pause/resume, retained pending run/retry, refresh and forgetting the selected package. The native folder dialog uses PID-bound UI Automation assistance; this is page keyboard verification, not full Windows dialog or Narrator acceptance. The visible focused-button/full-table screenshot was inspected.

Verification: **39 frontend tests**, strict TypeScript/frontend build, **31 desktop host + 3 pinned-Core tests**, desktop fmt/clippy (all targets, warnings denied), Memory integration self-test (8 negative cases), domain checker (7 negative cases), unsigned NSIS build, and **26/26 source/rendered installer ownership checks** pass. The installer is built and statically checked, not installed, signed or published. Root producer source and binary are unchanged; their existing verification is reused.

The [hashed proof](Activity-unified/full-days-proof.json) links both native runs and the exact baseline; the offline evidence checker binds all 27 current selectors to C18, preserving its remaining accessibility gaps.

- Desktop SHA-256: 83a3a1c224289ac770b73c5c70667f91afb0b6ef5e238c42b81593fe5e22925e.
- Unsigned installer SHA-256: 9df56391214ab49da484c09c122c6e3c92a8dd05ba4f3a71bf1999e442300195.
- Runner SHA-256: cb665419f42ff088425012f9e43cebf22a21d2647f0a1a19b97df7ca236c8b7a.
- Memory pin: ff692ccb6fbc1c387254d5ffbef41b105eeb2a84.

No personal archive/Vault, production task, public upload, credentials, server or Moriium source was changed.
