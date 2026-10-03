# Read-only Vault operator inspection/export v1 — backend design

Date: 2026-10-03. Authority: [ADR-024](adr/024-read-only-operator-inspection-export.md), [Vault storage](VAULT_STORAGE_v1.md), [Windows ports](WINDOWS_VAULT_PORTS_v1.md) and recovery V02/V15/V19/V20. Status: future report/plan/request design; no inspector/exporter, selector repair or personal export executes.

## Authority and inspection

The initial operator surface has only inspection and explicit reviewed **export**. It has no canonical write capability, initialization, branch selection, selector replacement, orphan deletion, index repair, import or Provider dispatch. `canonical_writes_allowed=false` describes this operator surface, not normal Core health. Existing v1 IPC/twelve-kind v2 mutation envelope/job kinds remain unchanged; no operator endpoint/capability is registered.

The backend owns checked root/destination ports, process-local inspections/plans and opaque IDs. A caller can name an inspected binding and configured `dst_` destination, never arbitrary paths, source lists, SQL, new hashes or claimed validated plans. Lookup IDs and review hashes do not grant authorization. A real local human action and accepted adapter are still required. Current user authorization covers design, not actual private copying/migration.

[The closed schema](../contracts/operator/inspection-export-v1.schema.json) reports process/inspection/root observation, UTC time, root/scan premises, selector observation, nullable canonical binding, named candidate validation, observed counts and structured issues. It excludes absolute paths, content/raw bytes, credentials and native exceptions. Native ancestry/reparse/alias/parent-race safety remains an accepted file-port requirement.

Selector observations distinguish valid/absent/invalid/unreadable. Valid records count/hash the exact CURRENT bytes separately from its manifest hash. Absent/unreadable records have no invented bytes/hash/binding; invalid bytes have no canonical binding. A shape-valid selector with an invalid selected bundle is not canonical readiness. Candidates require complete model/provenance and retained same-Vault hash-linked ancestry. Directory names/timestamps never select authority. Counts are *observed*; incomplete scans cannot support export or manufacture zero unseen artifacts.

## Planning and review

`selected_history` requires a valid complete current binding and exports its whole retained ancestry. `named_history` requires an explicitly named, inspected, fully validated candidate/ancestry; with absent CURRENT it remains a named **non-authoritative artifact**. This cannot choose/restore a pointer or assert which branch committed.

An unreadable selector cannot establish an exact unchanged observation and refuses export planning. Invalid CURRENT permits named planning only when its bounded exact byte length/hash were observed; a null/unknown byte observation is insufficient. These refusal rules do not suppress structured read-only inspection reports.

Plans bind exact inspection/process/root observation, configured destination, creation time, purpose, target and original selector observation. Lineage is target-to-bootstrap with exact parent hashes; files sort by `(generation_id,path)`. Include every ancestor's manifest/mutation/Identity/model bytes and the union of referenced raw objects. Never truncate ancestors to fit limits. CURRENT/index/staging/unrelated orphans/unreferenced raw bytes are excluded; forensic export needs a separate later contract.

Initial limits are 256 generations, 100,000 payload entries, 1,024 referenced raw objects and 512 MiB copied canonical/raw payload, with existing per-file/manifest/raw limits. Exact plan is at most 4 MiB; report 1 MiB; added export metadata 8 MiB, separately accounted. Four live plans/process expire after ten monotonic minutes from issuance; reads/reviews do not renew them. These are future limits, not executed scan/cache evidence.

Hash exact compact UTF-8 plan bytes plus terminal LF outside the plan body; no embedded self-hash. The reviewed request identifies that plan/hash, process/inspection/destination and an untrusted action token. Resolve backend-owned state, require live authorization, then recheck expiry, source root/selector and destination identity/topology. Stale/changed/unknown observations refuse without canonical mutation or overwriting another export. A consistent hash alone proves neither review nor safe handles.

## Future export port

An export is a new private artifact, not a Runtime root. Proposed layout is bounded `export-manifest.json`, `lineage/<validated-gen-id>/<validated-relative-path>` and `raw/<sha>.bin`, without active root-level CURRENT. Discovery cannot import/activate it. Metadata records purpose, retained bindings and exact payload; its own hash is reported externally to avoid recursion.

Destination must be disjoint from managed Core/Activity/source/install/sync roots and their ancestors/descendants, using an explicitly supported local private destination. Derive paths only from validated backend metadata and revalidate checked root/parents/files/ownership. Plan IDs and lexical prefixes are insufficient. The initial export requires unchanged selector observation through final verification; concurrent advance needs explicit fresh planning.

Copy via checked ports into exclusively created private staging, independently verify every byte/count/hash/full graph and metadata, then publish without replacing existing artifacts. Copy/space/hash/flush/sharing/ownership failures retain diagnosable partial destination evidence and preserve all source bytes. Report successful export only after verifying published completeness. Destination publication uncertainty cannot become success, source repair or automatic overwrite/retry. No export port/result/receipt/progress adapter is implemented; initial Core jobs cannot be silently repurposed for it. Synthetic copying/process death cannot establish device power-loss durability.

## Selected evidence

[Two examples](../tests/fixtures/backend/operator-export-v1.json) freeze selected-history and explicitly named-history review with absent CURRENT. Both use the previously checked synthetic eighteen-generation storage corpus: 282 complete copy entries and 153,605 payload bytes. No native root is inspected. [The checker](../scripts/check-operator-design.py) checks selected report/plan/request identities, known complete ancestry/inventory, calendar dates, totals and review hash. Twenty-three altered examples refuse incomplete/unverified observations, invalid candidates, replaced process/root/destination/selector/review, lost/duplicated/reordered/rewritten entries, raw fabrication, caller path, repair action, unreadable/unknown selector bytes and invalid dates.

[Validation](validation/Core-operator-inspection-export-design.md) does not accept P04. Native inspection, human review, expiry/topology/copy/publication races, source/Activity sentinel preservation and private export remain future work. Selector reconciliation/restore/import stay unsupported; valid orphan bytes remain retained/reported under ADR-020.
