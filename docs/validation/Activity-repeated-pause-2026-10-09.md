# Activity repeated mutation and Core rebuild isolation

Date: 2026-10-09. Scope: ten bounded synthetic cycles, not sustained stress or full B4/J1 acceptance. B5 remains inactive.

Each cycle starts a separate actual pinned-Core index rebuild, submits actual producer pause and canonical Memory-list reads together, verifies the durable paused state and approved-memory count, then actually resumes. The rebuild must reach succeeded and search must recover the approved synthetic memory. After every cycle, archive, sequence, pending and canonical Vault hashes stay exact. Ten rebuild operation IDs are distinct; twenty intentional pause/resume writes create exactly twenty additional generations without consuming a publication sequence.

The fixture contains one approved synthetic memory. Requests are issued together; the check does not assert that the rebuild worker remains running throughout each request or that collection/delivery overlaps it. Actual running-worker overlap remains covered only by its earlier explicitly bracketed reports. This is a bounded repeatability check rather than sustained-load, multi-account or production evidence.

The normal subsequent actual operation/Core-isolation and pending/restart flow also passes. [Raw native acceptance](Activity-unified/repeat-pause-native.json): **77/77**. [Hashed proof](Activity-unified/repeat-pause-proof.json): forty-two additional cycle/preservation assertions linked to C17.

Fresh checks: actual 77/77, harness syntax, Memory integration guard, whitespace and evidence integrity **42 reports / 598 selectors / 44 negative checks**. Product source/binaries/lockfile/pin are unchanged. The last implementation's 55 frontend tests, strict build, 32+3 host/Core tests and fmt/clippy, 16/16 save/clear checks, 35/35 actual actions and 26 installer checks are reused rather than rerun.

Desktop remains 328a6e08dda940a5e00b638ff76c77a06c8e5332b83db4263935a8ff2675f3ec; runner cb665419f42ff088425012f9e43cebf22a21d2647f0a1a19b97df7ca236c8b7a; Memory pin ff692ccb6fbc1c387254d5ffbef41b105eeb2a84. The unsigned installer is built, not installed, signed or published. Sustained rebuild stress, concurrent collection/delivery, disk-full/power loss, real accounts and production timing remain open. No personal Vault/archive, existing/production task, credentials, public upload, server or Moriium source is changed.
