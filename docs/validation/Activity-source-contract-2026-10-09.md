# Activity frontend source semantics

Date: 2026-10-09. Scope: Runtime frontend read validation; producer/Core/public contract unchanged. B4/J1 remain partial and B5 inactive.

The client previously checked source metadata against global enums and accepted any string as a recorded date. A direct synthetic transport reproduction accepted GitHub tokens, a Codex Shanghai boundary, an impossible February date and a swapped preview unit. The existing IPC and ActivityData schemas instead bind exact per-source constants and require real, unique, normalized dates and safe sums.

The client now accepts exactly github/codex/claude, with GitHub contributions/GitHub, Codex tokens/Codex, and Claude tokens/Asia/Shanghai. Overview ranges require real ordered dates when records exist, and null endpoints for no recorded days. Preview and day replies require real strictly ascending unique dates, nonnegative safe values and safe per-source sums. Empty histories, explicit zeros and leap dates remain supported. No total is combined across sources, and no store or canonical data is modified.

Three new frontend regression tests fail before the fix (39/42) and all **42/42** pass afterward. The [actual prior-window baseline](Activity-unified/source-contract-before.json) passes **14/23**, with exactly nine expected refusals missing. The [current native flow](Activity-unified/source-contract-after.json) passes **23/23**: wrong units/zones, an extra source, an impossible overview date, and impossible/duplicate/unsorted/unsafe preview days are refused. Each invalid reply is modeled only in owned WebView callbacks; every recovery goes through the real installed runner. Contract failures clear unverified source cards, actual valid reads restore three sources, complete Activity bytes remain unchanged, paths stay private, and the selected package choice is forgotten. No Vault is opened. The error-state screenshot was inspected; the folder picker is assisted.

Fresh checks: strict TypeScript/frontend build, 42 frontend tests, **32 host + 3 pinned-Core tests**, fmt/clippy (all targets, warnings denied), locked metadata/domain self-test (7 negative checks), Memory pin self-test (8 negative checks), unsigned NSIS build and **26/26 source/rendered installer checks**. The first TypeScript build exposed callback narrowing of a mutable object property; retaining the validated source object in a local constant resolved it, and the strict build then passed. The installer is built and checked, not installed, signed or published.

The [hashed proof](Activity-unified/source-contract-proof.json) binds both native runs, helper/binary identities and the frontend regression counts. Current evidence integrity binds 28 reports / 306 selectors / 27 negative checks, all 18 rows partial.

- Desktop SHA-256: ad307d480bd1bcb85ff7e04586e42afe6a29cdc6973e87548881c706a9b484e4.
- Unsigned installer SHA-256: a0bee2f656c75bf8308c4ec556053591df2d23da52586097dc22a57c4300cd8c.
- Unchanged runner: cb665419f42ff088425012f9e43cebf22a21d2647f0a1a19b97df7ca236c8b7a.
- Unchanged Memory pin: ff692ccb6fbc1c387254d5ffbef41b105eeb2a84.

Full Windows accessibility, authenticated sources and production acceptance remain unverified. No personal archive/Vault, existing or production task, credentials, public upload, server or Moriium source was changed.
