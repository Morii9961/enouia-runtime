# Session drafts and delayed detail — local evidence

Date: 2026-10-06. Baseline: `aec907e`. Scope: a focused native acceptance mode and documentation. Application, adapter, Core and pin are unchanged.

`--sessions-only` passed **19/19** against the embedded-assets GNU executable with a fresh synthetic Vault. Two sessions retain separate unsent question and checkpoint drafts. While A's actual detail response is held, the observed B selection/drafts remain visible; a newer B read completes first, and releasing A cannot replace them. Waiting detail reads are explained.

A real local Mock turn in B runs to completion while receipt delivery is deferred. Branch controls and composers stay disabled, a disabled A click does not switch selection, and drafts remain until acknowledgement. Afterwards only the submitted question clears. Core reads show the question in B's transcript and no transcript in A. Saving B's checkpoint leaves it `provisional`, with zero approved memories. Returning to A restores both its unsent fields and clears B's answer inspector. The owned host exits cleanly and the debug-listener ownership refusal passes. Screenshots were inspected.

Harness syntax, diff, pin and domain guards pass (8 and 7 negative cases). The unchanged executable retains the `aec907e` evidence: 17 frontend tests/type checking, 19 host plus 3 pinned-Core field tests, formatting, Clippy and release build. SHA-256: `ef55d0a4f0c22a7afede678ca85ba3965a72f29084589faadc5f04e144ec3209`.

Artifacts remain in temporary `enouia-runtime-session-drafts-20261006-01a10b3a`. This proves selected UI timing with real Core and controlled delivery, not a full native regression, real storage-error recovery, live Provider or durability. Drafts remain frontend state; this does not promise preservation after closing/reloading the surface. No personal Vault or production Activity was used.
