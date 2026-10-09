# Actual elapsed-hourly Activity repetition

Date: 2026-10-09. Scope: one independently owned, delivery-disabled synthetic Windows task. B4/J1 remain partial; B5 inactive.

The unchanged timer harness completes its -WaitForHourlyRepeat mode with **27 assertions**, **zero demand starts** and ownership-checked removal. The [raw report](Activity-unified/timed-trigger-hourly.json) records all checks, actual task times/results, sequence, pending hash and exact runner/helper identities. observedAt is the harness start time; the last recorded task phase completes at 02:22:01Z and the report file is finalized at 02:22:14Z.

The first paused TimeTrigger runs at 01:21:21Z (09:21:21 Asia/Shanghai), returns 3 and preserves the complete store. After a durable resume, the unmodified PT1H repetition is expected at 02:21:21Z and actually runs at **02:21:23Z**, exactly **3602 seconds** after the first. It returns 4, commits only sequence 51, keeps delivery disabled and retains all three sources' history/success timestamps on unconfigured-source failure. No demand invocation or rearming occurs between this pair.

The third boundary is separately rearmed for 02:22:01Z, runs at that exact time and returns 4. It verifies exact pending sequence/hash and complete store preservation without another collection. This third run is a short-boundary retry check, not another elapsed hour. The first-pair result includes two seconds of observed Windows timing jitter and establishes one elapsed-hourly cycle only.

The helper preserves the owned task's action/principal/logon/repetition policies and only changes its own initial/final short boundaries. It checks that the desktop is closed at the initial and final observations. Other independently owned UI tests ran during the waiting interval; continuous desktop absence over the whole hour is not claimed. No user application is closed. A fresh read of the exact GUID marker confirms the task is absent; the marked ignored fixture and all package/data files remain available for inspection.

Fresh verification: the completed worker exits 0, task absence, unchanged helper/runner SHA-256, report/index integrity **34 reports / 422 selectors / 34 negative checks**, and whitespace. No product source or binary changes occur, so existing product/build checks are reused. The helper is 42b2a6c46eb991f061b86424983922780be993ffa620ee6d4815aff5d1edd879; runner is cb665419f42ff088425012f9e43cebf22a21d2647f0a1a19b97df7ca236c8b7a.

Actual logon, battery/sleep/resume, prolonged repetition, authenticated collectors, public publication and production timing remain unverified. No personal Vault/archive, existing/production task, credential, server or Moriium source is changed.
