# Bounded absolute saved Activity choices

Date: 2026-10-10. B4/J1 remain partial; B5 inactive.

Saved package choices were read without a size limit and could be relative to the host process working directory. The [comparable actual baseline](Activity-unified/saved-choice-boundary-before.json) passes **14/20**, failing native status/read/connection-gate checks for relative and oversized configuration. Only this owned synthetic mode starts in its own temporary package parent, making `package` actually resolve to the known installed fixture. Ordinary launch behavior is unchanged.

The original [harness prerequisite result](Activity-unified/saved-choice-boundary-harness.json) passes **10/17**: it observes the same six product failures, then fails in the recovery comparison of a Windows extended path with `EISDIR`. The harness normalizes that comparison and a new fixture produces the comparable 14/20 baseline. This prerequisite failure is retained, not treated as a product regression or hidden.

Native settings reads now take at most **64 KiB+1 from the same open file handle**, reject overflow, parse the existing record and require an absolute root. The saved format and public IPC remain unchanged. Invalid input files are preserved; the loader does not automatically erase or rewrite them. A new file regression accepts the exact 64 KiB boundary, refuses the next byte, rejects relative/missing/malformed roots, preserves invalid bytes and accepts a valid absolute root again.

The [new native result](Activity-unified/saved-choice-boundary-native.json) passes **20/20**. Relative, oversized and malformed cases all remain unconfigured with no invented saved outcome, refuse overview and show the connection gate without history cards. Every original settings byte and complete Activity store remain exact. Real picker recovery stores a canonical absolute choice, reports verified saved, restores three histories and preserves Activity bytes; explicit clear then removes only the owned choice. No reply is modeled.

A [fresh actual-action/Core-isolation rerun](Activity-unified/saved-choice-boundary-actions.json) passes **35/35**. [Hashed proof](Activity-unified/saved-choice-boundary-proof.json) binds prerequisite/baseline/final/action reports, prior/new desktop, installer and runner identities. Twenty C17 selectors add this scope without signing off a row.

Fresh checks: frontend **58**, native host **35** plus pinned-Core **3**, fmt/clippy with warnings denied, strict TypeScript/frontend build, embedded desktop and unsigned NSIS build, **26 installer ownership checks**, Memory/domain guards (8/7 negatives), syntax/whitespace and **57 reports / 878 selectors / 59 negative evidence checks**. Native release compilation finished normally in 22.96s. Unchanged root producer 223-test/release evidence is reused. The installer is built, not installed, signed or published.

This bounded configuration admission does not establish every filesystem race, sustained stress or production acceptance. Memory remains pinned to ff692ccb6fbc1c387254d5ffbef41b105eeb2a84. No personal Vault/archive, account, credentials, scheduler, existing/production task, server or Moriium source changes.
