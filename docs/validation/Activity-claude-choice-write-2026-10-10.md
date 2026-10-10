# Actual saved-choice write sharing and recovery

Date: 2026-10-10. Integration HEAD before this slice: `bf6581ecacd76bc254dfdaf4994fa5cad742f19a`. B4/J1 remain partial; B5 inactive.

Existing coverage includes save failure (an owned directory at the settings path), deletion refusal and read sharing. None of it shows that an **existing** saved-choice file survives when the real picker saves while another process refuses write sharing. That was the next candidate in the 2026-10-10 handoffs.

The new `--saved-choice-write-lock` mode lives in [`activity-choice-write-lock.mjs`](../../apps/desktop/e2e/activity-choice-write-lock.mjs), loaded by `activity-smoke.mjs`. The [actual native result](Activity-claude-choice-write/native.json) passes **16/16** on the integrated desktop and runner.

The drill runs in this order:

1. It writes an owned earlier choice in plain absolute form. The picker would store the verbatim canonical form instead, so preserved bytes and replaced bytes are distinguishable.
2. Startup connects that choice.
3. A finite owned helper opens only this synthetic settings file with read sharing and no write or delete sharing. An independent write open genuinely refuses, and reads stay available.
4. **Under the hold:**
   - The actual native picker selection replies with `saved: false`.
   - The file keeps its exact prior bytes; it was not truncated.
   - The three histories stay exact, status stays configured, and the complete Activity store is unchanged.
5. **After release:**
   - The prior bytes are still exact.
   - A second actual picker selection saves and verifies the canonical choice, which replaces the prior bytes.
   - A restart reconnects it, and explicit clear removes only the owned file.

While held, status still verifies the choice. That is correct: the prior file names the same package, and verification compares meaning, not bytes.

No product defect was found, and no product source changed. The [hashed proof](Activity-claude-choice-write/proof.json) binds the raw report, harness, drill module, fixture preparer, and the desktop, runner and installer identities from the [late-switch integration](Activity-late-switch-integration-2026-10-10.md). Its 16 selectors are linked to C17. The checker requires that link, re-hashes the report, requires the integrated binaries, and adds one negative check. Evidence integrity is now **60 reports / 968 selectors / 62 negative checks**.

Fresh checks: harness syntax, the evidence checker, and `git diff --check`. The late-switch integration's checks are reused, because product source and binaries are unchanged:

- Root 230 tests, desktop 35+3 tests and frontend 58 tests.
- Installer 26/26 and the Memory/domain guards.
- Actual actions 35/35.

The settings writer still truncates in place. Truncation caused by process death or disk-full during that write is not exercised. Neither are other packages, every filesystem race, or production. No personal settings, Vault/archive, account, credentials, task, server, Memory pin or Moriium source was touched.
