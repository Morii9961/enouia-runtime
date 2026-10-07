# Source paging — local evidence

Date: 2026-10-07. Baseline: `c1cfb4c`. Scope: focused acceptance harness and documentation only. The executable, frontend, adapter, Core and pin are unchanged.

The new `--source-paging-only` mode passes **16/16** against the existing release in a fresh synthetic Vault. It approves two real Memory fixtures, reads a long Chinese/emoji source through bounded Core excerpts, verifies byte continuity and exact text reconstruction, and checks that the final page has no next-part button. Markup stays literal.

Controlled delivery checks hold actual excerpt results, then verify visible waiting feedback, cleared preceding content, a retryable read error and retry of the same source/revision/page. Restarting the source read suppresses a delayed older-page error. Selecting the second memory suppresses the delayed first source's success. These are controlled IPC receipt timings, not induced storage faults; the reads leave exactly two approved memories and the host exits cleanly.

The final screenshot of the last excerpt is scrolled into view; a second screenshot records the new selection after the older reply arrives. Artifacts remain in temporary `enouia-runtime-source-pages-final-20261007-01a10b3a/smoke`. Executable SHA-256: `9d04752215552f40fcd3ec933cce02e88f0be2e06b5bc9737cb7019134a18698`.

Harness syntax, diff and pin/domain guards with 8/7 negative cases pass. Application sources are unchanged, so the preceding layout slice's build, type check and 19 frontend tests and the transcript slice's 19 host/3 pinned-Core tests, formatting and Clippy evidence remain applicable. No full-smoke rerun, real storage-error recovery, personal Vault, migration, actual restore, live Provider or production Activity is claimed. W02 remains partial.
