# Memory inspector reobservation and identity

Date: 2026-10-13 (Asia/Shanghai). Baseline `7d7b31c`; exact Memory pin unchanged.

Controlled wrong-record replies failed `wrong_memory_record_is_not_shown_or_writable` against the prior inspector. It used opaque detail data directly, and nonretryable read failure lacked an explicit local reread.

Memory inspection now uses latest-read ownership independently of mutations, matches both record and summary IDs, and offers Read memory again. A new/failed read withholds the unobserved detail and correction/deletion controls while preserving unsent correction text. Reads never replay those actions. Shared pure identity checks also bind approved-memory source excerpts to the exact source ID/revision and are reused by candidate source/conflict readers. Existing fixture replies now include the actual Core's identity fields.

Validation: inspector fixture 9/9 ([record](Memory-inspector-observation-browser.json)): wrong record/summary, explicit recovery, failed replacement, preserved correction, wrong source ID/revision, normal source workflow and no mutations. Affected candidate source 14/14, candidate conflict 10/10, source suggestions 12/12 and ordinary review journey 15/15 passed.

Frontend tests 69/69, TypeScript/strict affected-fixture checks, all 5 fixed-Core consumers, formatting/strict Clippy, frontend/ordinary no-bundle desktop build and pin/dependency checks (8 + 7 negatives) passed. The Core consumer additionally checks actual detail summary/record IDs against the requested memory. Unchanged host tests reuse the earlier 61/61 successful run.

Errors and wrong replies are synthetic; Core tests use owned temporary Vaults. No production Core defect, real storage-fault recovery, personal Vault, Provider/credentials, human/physical/Narrator acceptance, installer, Activity activation or Memory domain/protocol/pin change is claimed.
