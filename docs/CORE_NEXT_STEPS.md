# Core continuation baseline — updated 2026-10-02

The code baseline through `275924d` is committed/pushed. Architecture v0.3 and activated ADRs remain the authority. This note does not sign off full A1/A2, Activity B4/B5 or production activation.

## Verified implementation

- `enouia-memory`: five canonical kinds, source registry, explicit saves/candidate review, retained supersession/undo, semantic validation and closed schemas. Drafts are shared model inputs; UI and Provider do not own canonical identity/provenance/time.
- `enouia-session`: append-only turns/checkpoint references, complete-bundle source and ordered range validation, four-turn/two-checkpoint synthetic replay. JSON reconstruction is verified; disk restart is not.
- `enouia-core-contract`: eight typed local operations, closed drafts/requests, sanitized responses and model-only/canonical-files-committed distinction. There is no handler or rendered UI yet.
- `enouia-context`: exact canonical selection/provenance, derived open loops, deterministic whole-record admission from supplied ranks, conservative UTF-8 sizing and exact actual capsule bytes. Retrieval scoring/FTS and persisted invocation history remain pending.
- `enouia-provider`: offline deterministic Mock, immutable prepared request, exact consumed hash/bytes, included ProjectState output, cancellation/limit refusal and candidate-only reserved tool contracts. No real Provider, credentials or tool dispatcher.

Latest full workspace result: **212 passed**, fmt and clippy all targets pass; release Activity builds. Release SHA-256: `246ab1e35ba568e6a4fb0a55f658aa9e9bfb945fb67292a966f218edea5e17ee`. Shared SHA utility moved unchanged into common; Activity's public API/semantics remain covered. Historical B4 reports retain their original source/binary hashes.

Two subsequent targeted Context tests also pass (10 Context tests now): a real pending proposal cannot be selected; an oversized higher-ranked record is excluded while a later smaller record is admitted whole. Mandatory Identity is refused rather than truncated. No production code changed, so the full 212-test baseline remains applicable.

The dependency guard checks twelve workspace modules with six negative cases. The Activity evidence index checks seven historical reports and 59 linked selectors across C01–C18, with eight negative cases. Both unresolved GitHub comparison cases remain unaccepted. Neither checker is behavioral production evidence.

## Next implementation boundary

Current user scope is backend design only; frontend design/implementation waits until Claude Design is complete. The [Vault storage contract](VAULT_STORAGE_v1.md), [ADR-020](adr/020-core-vault-generations.md) and [22-row recovery matrix](VAULT_RECOVERY_MATRIX_v1.md) now specify complete immutable generations, a sole hash-bound pointer, retained historical bundles, exact canonical commit observation and disposable index binding. This is design progress, not persistence implementation or executed recovery evidence.

The [Vault layout draft](VAULT_LAYOUT_DRAFT_v1.md) is retained as the earlier alternatives record. The journal-versus-generation choice is resolved in ADR-020. Closed executable storage schemas/fixtures, transition validators and exact Windows handle/replace/flush adapter details still need implementation and acceptance; no personal Vault or live migration is established.

Within backend design, next specify the disposable SQLite/FTS metadata/query contract, deterministic retrieval ranking and cancellation/stale-generation rules against this pointer binding. Do not install a database, write a Vault or start UI work just to complete that design.

When persistence implementation is separately authorized, begin with storage schemas/byte fixtures and pure validators, followed by OS cryptographic entropy, validated in-root paths, canonical Memory/source/candidate/session files and Markdown Identity. Add the disposable SQLite/FTS index after the canonical transaction boundary is verified. Preserve source/meaning history and candidate decisions in files, rather than only the index. A partially prepared conversation source or checkpoint is not a complete validated bundle.

Before claiming durable behavior, prove interrupted writes leave complete recoverable data, failed index updates are repaired from canonical files, deleting/corrupting the index reproduces active records, path traversal/reparse escape is blocked, and disk-full keeps prior bytes. Recovery must report orphan/ambiguous cross-file states without silently dropping records. Memory repair must leave Activity state/high-water/pending exactly unchanged. Use temporary marked synthetic roots; no personal Vault or live account migration is established here.

Then attach FTS/metadata retrieval to the ranked Context port, persist the actual capsule before Mock invocation, orchestrate user/Mock turns and checkpoint generation, and prove the synthetic MoriMeta continuation after actual process restart/index rebuild. Add UI only after those backend contracts/operations are reviewable and verified and the user confirms Claude Design is complete.

Activity remains an independent track. Full matrix sign-off, real inventory/reconciliation/tool capabilities, actual scheduled triggers/battery/resume, power-loss/storage faults, the process spawn/job-assignment interval, real deployed publication and cutover/rollback still need evidence. Use [B4 coverage](validation/B4-coverage.md) and the operational O1–O6 definitions rather than treating offline checks as acceptance.

Keep each completed feature independently verified, committed and pushed with the required Codex trailer. The user's previous 65%-remaining stop line was explicitly revoked; later continuation may follow the current quota instruction without purchasing/resetting credits or changing production gates.
