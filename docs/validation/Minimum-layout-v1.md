# Minimum layout — local evidence

Date: 2026-10-07. Baseline: `1be6d7e`. Scope: visually hidden label positioning and focused viewport acceptance. Core, adapter, pin and Rust sources are unchanged.

Expanding a long Memory source put the correction label's absolute static position below the viewport. The label was visually clipped but still extended the document: at 1100×700 the usable area became 1090×690 with a 1100×870 document; at 1600×700 its document height was also 870. The inspector itself already scrolled correctly. Anchoring `.mem-sr` at top/left zero prevents that hidden label from extending the page without suppressing document overflow or changing its input association.

The corrected baseline probe passed **30/33**, with the source-expanded document failing at both widths and one horizontal pane check failing at the smaller width. An earlier probe compared against `innerWidth` only and missed the page scrollbar; that result is not acceptance evidence. The retained probe compares both document dimensions against the actual client area.

The final GNU release passes **37/37** in a fresh synthetic Vault at emulated 1100×700 and 1600×700. It covers all seven surfaces, actual approved Memory content/source, saved local Mock session and request inspection, long Vault folder names, pane/document bounds, correction label association, correction reachability inside its scrolling inspector, cleared emulation and clean host exit. Four additional checks verify the correction label and scroll reachability. Memory, Context and Settings screenshots were inspected at the minimum width, and Memory at the wider width. Activity and Runtime remain fictional.

Type checking, **19 frontend tests**, embedded-assets desktop build, pin/domain guards with 8/7 negative cases, harness syntax and diff checks pass. Rust was not changed; the preceding transcript slice's 19 host and 3 pinned-Core tests, formatting and Clippy evidence remain applicable. The default 62-check smoke was not repeated on this executable.

Executable SHA-256: `9d04752215552f40fcd3ec933cce02e88f0be2e06b5bc9737cb7019134a18698`. Final report/screenshots remain in temporary `enouia-runtime-layout-fixed-20261007-01a10b3a/smoke`; the failing label probe is in `enouia-runtime-layout-label-20261007-01a10b3a/smoke`. Viewport emulation proves CSS layout in the owned WebView2 page, not physical window resizing, monitor/DPI behavior or Narrator acceptance. No personal Vault, migration, restore, live Provider or production Activity was used.
