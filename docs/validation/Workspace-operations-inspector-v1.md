# Read-only Memory operation observer

Date: 2026-10-18 (Asia/Shanghai). Baseline `811742b`, on top of the model-configuration draft slice. Memory remains fixed at `56bc5eb`, workspace IPC v1, 47 commands.

Native Runtime Inspector now lists the operations Core retains for the currently open Vault: imports, resume, index rebuild, verify, backup and native model sends. The list is explicitly process/Vault-local and is cleared by Core when the Vault closes. It is not persisted task history or proof of a saved domain result. No operation is started, cancelled, retried or approved here.

The observer reads existing `operation_list` and `operation_get` envelopes with null write keys. It uses the existing identity validators to reject malformed, duplicate, foreign-ID or changed-kind replies. It renders at most 20 rows initially, active first followed by stable ID ordering, with local Show more. There is no claim of chronological ordering. Details read only after selection, then poll serially while active and stop polling after a terminal observation. Errors clear the affected observation; list failure does not erase an independently observed selected operation. Raw result and error payloads are not rendered. Finished execution is explicitly separate from a clean verification, a saved backup, a completed answer or approved memory.

The section mounts only with an observed open Vault ID, is keyed to that ID and unmounts during Vault changes/Exit or unavailable shared status. Delayed list/detail replies cannot publish into another Vault or selection. The existing Inspector fixture deliberately lacks a Vault ID and therefore exercises the unknown-identity boundary without an operation call.

The actual-App synthetic journey passed 18 assertions: initial unknown state, bounded/active-first lists, local pagination, explicit and nonduplicated progress reads, raw-result exclusion, failed/foreign detail recovery, terminal semantics, duplicate-list refusal, independent read failures, selection changes/removal, fixed unknown-kind text, Vault identity/lifecycle changes and read-only commands. Strict fixture typing passed. Final combined regression/build results are recorded below; native source/dependencies are unchanged and retain their existing evidence.

All replies are synthetic. No personal Vault, native UI automation, Provider call, cancellation, new import, key access, Activity collection or production activation is established.

The combined frontend gate passed 108 Node tests and all 62 DOM fixtures (820 assertions). TypeScript/Vite, strict new-fixture typing, the Memory pin guard (8 negative checks), runner syntax and diff checks passed. The Windows GNU no-bundle build passed in the owned C: target directory (30.13-second native release build). It was not launched or installed. Native production source/dependencies did not change in this slice; prior native test, Clippy, formatting and resolved dependency-boundary results are reused.

Executable SHA-256: `d0acdee2bf7e329592d4f7e41eb32878f6500103b8ba3caaf9084ded7f64cd10`.
