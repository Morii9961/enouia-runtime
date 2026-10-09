# Activity polling lifecycle follow-up

Date: 2026-10-09. The existing run-query recovery implementation passes a further **11/11 native checks** without a product change. [Raw report](Activity-unified/poll-lifecycle-native.json); [hashed proof](Activity-unified/poll-lifecycle-proof.json).

Six modeled busy replies produce observed query intervals of 1.010, 2.014, 4.001, 8.008, 16.001 and 30.012 seconds before a matching terminal reply. Every query keeps the same run ID, exactly one start request occurs, and terminal status restores operation controls. A separately delayed reply arriving after unmount does not populate the remounted page; further status queries stop. The complete Activity tree remains unchanged and the package choice is forgotten.

All starts/statuses are intercepted before native IPC; reads use the real installed runner and fictional fixture. No actual collection, upload, Vault or task operation occurs. This verifies the first thirty-second ceiling, not indefinite outage or production timing. The unchanged product retains the prior slice's 48 frontend tests, strict build, 35/35 actual-action run and 26 installer checks. Fresh checks cover harness syntax, Memory integration, evidence integrity and whitespace; no rebuild is needed. C17 remains partial, B4/B5 false.
