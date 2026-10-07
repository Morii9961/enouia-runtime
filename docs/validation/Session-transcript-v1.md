# Saved session response reading — local evidence

Date: 2026-10-07. Baseline: `fb6d488`. Scope: presentation of saved transcript events, a Runtime field guard and focused acceptance. Core, adapter, commands and pin are unchanged.

Completed local Mock events previously displayed their serialized JSON as the main conversation body. A recognized response now shows its saved status qualification, literal statements and source IDs/revisions. A native `details` disclosure keeps the original saved text, including hashes and references, without recomputing it. The raw text is keyboard-focusable. Malformed/unknown formats and user-authored JSON remain literal; no HTML or Markdown is rendered.

Recognition follows `MockAnswer` at the exact pinned revision, including its known statuses, statement array, revision references, dispatch ID and request hash. The Runtime's pinned-Core test verifies the saved event fields equal the actual answer receipt and requires a completed assistant event, so a pin that changes this representation cannot silently skip the guard.

The native baseline passed **6/13**, reproducing seven presentation failures. The final spacing-adjusted release passes **14/14**: real empty/supported local Mock turns, no invented statement, inert markup, saved source reference, initially collapsed records, Enter/Tab access to raw text, exact text equality, clean exit and persisted readable transcripts after restart. Screenshots were inspected. This is local synthetic Vault/Core/Mock evidence; no live Provider or personal data was used.

An intermediate run passed 12/14 because the harness sent Enter without character text, so the browser did not generate the summary's activation. The harness now supplies that text as described by the [CDP input definition](https://github.com/ChromeDevTools/devtools-protocol/blob/master/pdl/domains/Input.pdl). Its trace observes `keydown`, `keypress`, `keyup` on Summary followed by Tab focus on Pre. No workaround was added to the native disclosure.

Type checking, **19 frontend tests**, **19 host plus 3 pinned-Core field tests**, Rust formatting and Clippy with warnings denied pass. Pin/domain guards pass with 8/7 negative cases; harness syntax and diff checks pass. The GNU release embeds the assets and produces no installer.

Executable SHA-256: `6a8269e18b6f4504905ae10f0920b129536a4b17a16fe555343565f70af7c542`. Final artifacts remain in temporary `enouia-runtime-transcript-spacing-20261007-01a10b3a`, with the original baseline in `enouia-runtime-transcript-before-20261007-01a10b3a`. This slice does not rerun the default 62-check smoke, prove storage/power-loss durability, Narrator or installed-artifact acceptance, or change canonical saved text. W01–W05 remain partial; no migration, actual restore or production Activity was used.
