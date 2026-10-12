# Read saved extraction progress after ambiguous queue writes

Date: 2026-10-12 (Asia/Shanghai). Baseline `1af6d43`; Memory pin unchanged.

The suggestion panel could close during an admitted queue write. It also offered a retry of the entire multi-step application loop after a retryable failure, while its displayed candidate statuses remained from the preceding preview. The new held-write fixture first failed `pending_apply_keeps_close_disabled`.

The exact pinned `workspace/src/native.rs` applies at most one saved suggestion per `extraction_apply` call. Its route does not replay page-keyed receipts: `provider/src/extraction.rs::apply_next` advances the saved job cursor. Runtime therefore withholds replay of an ambiguous application loop, preserves the Core's error explanation and labels the previous suggestion observation. A new batch waits for a successful explicit read of saved suggestions. A failed read retains the previous rows and another read action. A fresh owner request can then apply remaining suggestions in the original job. Closing is disabled while an action or external operation is in flight. Nothing becomes an approved memory here.

Validation:

- `e2e/extraction-recovery.html`: 14/14; [record](Memory-extraction-recovery-browser.json). Held application, disabled dismissal, one simulated committed step with a lost retryable receipt, no whole-loop Retry, a read observing the first candidate, explicit continuation, two steps only, an ambiguous completed second batch, failed/read-only recovery and settled dismissal. Two owner-initiated model sends total; recovery never resends.
- Existing Provider/extraction operation fixture: 12/12. TypeScript, strict new-fixture checking, all 69 frontend tests and frontend/ordinary release desktop builds passed.
- Native test/format/Clippy and dependency-boundary evidence is reused from [cancellation acknowledgement verification](Memory-operation-cancel-ack-v1.md); native source, dependencies and the pin are unchanged.

All data and receipt-loss behavior are synthetic. The fixture models saved cursor progress rather than claiming a page-keyed Core replay contract. This is not real storage corruption, power-loss, personal Vault, real Provider or production proof.
