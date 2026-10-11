# Unique Activity evidence selectors

Date: 2026-10-10. Baseline: `21c0e5fb2eca9bfbb92f822f585d940bae4041e7`. This changes only the offline evidence checker. Product source, executables, existing reports and the matrix index remain unchanged. J1/B4 remain partial; B5 is inactive.

The previous checker admitted repeated selectors and counted repeated links again. On isolated copies of the complete 65-report index, a duplicated link raised 1,079 to 1,080 and a duplicated reference raised it to 1,081. Rehashed owned copies of one proof and its raw native report also admitted duplicate, numeric or blank selector IDs. The genuine committed records contained none of these problems.

The checker now requires nonblank string selectors and unique IDs within each report. A row may reference a report more than once when the selectors are disjoint, but each `(report, selector)` pair is counted only once within that row. A selector can still support different matrix rows. Self-test negative counts now come from successfully exercised rejection cases, rather than a manually maintained number.

The [old-checker probe](Activity-evidence-selectors/before.json) records all five malformed cases as admitted. The [new-checker probe](Activity-evidence-selectors/after.json) records all five as rejected, with disjoint references accepted and the real count still 1,079. Both probes use copied checker functions whose only path adjustment points the owned snapshot back to this workspace, and mutations of index/proof/raw-report copies under ignored `target/evidence-uniqueness`. Existing committed files are never altered. These are tooling probes, not additional C17 acceptance selectors or additional indexed product reports.

`node scripts/check-activity-evidence.mjs --self-test` passes **65 reports / 1,079 selectors / 72 negative checks**. Five new rejections cover duplicate links, duplicate references, duplicate report selectors, nonstring IDs and blank IDs; a positive split-reference check preserves the count. `git diff --check` also passes. No product build or native rerun is needed because no affected product source changed.

All 18 rows retain their gaps, zero rows are signed off, and B4/B5 remain false. The checker performs no collector, scheduler, network transport or reference-checkout operation. This does not establish production acceptance or broaden the existing proofs.
