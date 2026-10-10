# Activity diagnostic and payload field boundary

Date: 2026-10-09. Scope: Runtime client validation before export/rendering; producer/Core/wire definitions unchanged. B4/J1 partial; B5 inactive.

A synthetic reproduction added a fictional private extension to a valid overview and a raw title to a preview day. Both passed the existing client. Since diagnostic copy serializes the overview and payload preview serializes the data, the extra fields could cross the promised sanitized boundary. Three new regression tests fail on the prior client (42/45).

Read DTOs now enforce the existing closed protocol field sets at the overview, source summary, schedule/task, delivery, producer, pending, health, public preview/data/snapshot/day and day-reply boundaries. Structured errors accept only documented fields/component IDs. Date/time fields validate real calendar/time/offset bounds instead of accepting raw text or relying on Date.parse rollover. The producer's supported date-only, minute-only explicit-zone, explicit-offset and high-precision fractional ISO forms remain accepted. This changes no source meaning, storage, producer timestamp parsing or Memory behavior.

The [prior desktop baseline](Activity-unified/export-contract-before.json) passes **20/36**: fourteen malformed field/text replies and both modeled export-leak assertions fail. The [current native run](Activity-unified/export-contract-after.json) passes **36/36**. Every extra field/text reply is refused; a fictional marker cannot reach diagnostic copy or payload preview; every real read restores the page and safe copy. Actual store bytes remain unchanged, no Vault opens and the package choice is forgotten. Page clipboard writes are intercepted in memory, so no system clipboard is changed. Invalid replies are modeled in owned WebView callbacks; all restored reads use the real installed runner.

The first new-build native attempt passes 28/29 and stops when the test attempts to click a preview control that the product correctly removes after rejecting a reply. The [intermediate report](Activity-unified/export-contract-intermediate.json) is retained. Guarding the optional control corrects that harness assumption; the full rerun above passes without any further product change. Baseline and final helper identities are recorded separately in the [hashed proof](Activity-unified/export-contract-proof.json).

Fresh verification: **45/45 frontend tests**, strict TypeScript/frontend build, unsigned NSIS build, **26/26 source/rendered installer checks**, Memory integration self-test (8 negatives), domain check (7 negatives), harness syntax and whitespace. Unchanged host/Core source, pin and lockfile retain the source-contract slice's **32+3 tests** and fmt/clippy evidence; these were reused, not rerun. The installer is built and checked, not installed, signed or published.

- Desktop SHA-256: 8bf0075f72cc671409d166380f5fe32b7ae03ffd899ff34df60ecd9587cd6447.
- Unsigned installer SHA-256: b4bb9aff47d55a161b9d7da923a4ed8121535ceda1ac480bcf9f5b00f0a77079.
- Unchanged runner: cb665419f42ff088425012f9e43cebf22a21d2647f0a1a19b97df7ca236c8b7a.
- Unchanged Memory pin: ff692ccb6fbc1c387254d5ffbef41b105eeb2a84.

Evidence integrity binds 29 reports / 345 selectors / 29 negative checks. C10 privacy and C17 isolation link the exact checks but remain partial. No personal data, existing/production task, real clipboard, credential, public upload, server or Moriium source changed. This is not complete installed-account privacy, Windows accessibility or production acceptance.
