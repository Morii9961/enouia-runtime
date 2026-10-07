# Context read feedback — local evidence

Date: 2026-10-06. Baseline: `c154f5f`. Scope: Runtime's connected Context surface and focused native harness. Core, pin, contract and host are unchanged.

The original surface displayed "No capsule selected" while reading an already selected capsule or after its read failed. A preview submission had no waiting explanation, and a dispatched capsule claimed its actual request was below before that request was read. Native reproduction confirmed these four behaviors. An early fixture also expected an approved memory in a request before rebuilding its index; the final fixture performs a real rebuild and uses a literal matching query.

The surface now names preview preparation, saved-capsule reading and actual-request reading separately. Its sidebar distinguishes no selection, reading and unavailable states. Dispatch delivery reports inspection availability, without claiming unread request contents. A new preview clears the old selected ID as well as its view/request, so its failure cannot imply that a capsule read is still running. The added replacement-preview check caught that intermediate mistake before this slice was committed.

| Verification | Result |
|---|---|
| Type checking and frontend suite | Pass; 17 tests, including selected-but-unobserved capsule rendering |
| Embedded-assets Windows GNU release | Pass; no installer |
| Final focused native Context acceptance | 16/16 pass on a fresh synthetic Vault |
| Pin/domain guards | Pass; 8 and 7 negative checks |
| Harness syntax and diff checks | Pass |

The native run reads a real unsent preview, recovers from controlled capsule/dispatch read errors, approves one synthetic memory, rebuilds its real index, and dispatches a local Mock question. The actual request's capsule ID, verified hash and included fixture text are checked against the selected capsule. A later preview clears that request, retains its query after a controlled delivery error, replays the same saved capsule on Retry and remains unsent. The final screenshot was inspected. Controlled delivery/error timing is frontend evidence, not storage-failure or live-provider proof.

The final report/screenshots are retained in temporary `enouia-runtime-context-complete-20261006-01a10b3a`; earlier baseline/intermediate reports remain in the corresponding `context-before`, `context-final` and `context-replacement-before` fixture folders. Only the final 16/16 run counts as complete focused acceptance.

Executable SHA-256: `aa6bc3327f07928e1111f2270a4388b01cfc6e270fd22502e0b8cd6516c41ac2`.

Unchanged Core/host and unrelated native flows reuse prior scoped evidence. This is not a new full native regression pass. Real storage faults, broader query/concurrent-read timing, Narrator and installed artifacts remain unverified. No personal Vault, migration, restore, cloud Provider or production Activity was used.
