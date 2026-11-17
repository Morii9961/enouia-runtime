# ADR-038 — Explicit registered Owner read-only native entry

Date: 2026-11-17. Status: implemented for the R2 development slice, activated on merge after synthetic verification. Personal-data use, a production candidate and human acceptance remain separate gates.

Morii asked Runtime to continue the November 16 roadmap through the minimum read-only R2 entry. Memory's existing ADR110/145 already defines a trusted native CLI/launcher authentication boundary; this slice uses it without inventing a page Owner grant or changing Memory domain code.

## Decision

An explicitly authorized native invocation must supply all three launch options:
`--memory-owner-readonly`, `--memory-owner-home <absolute-home>` and
`--memory-owner-operation <original-bootstrap-operation>`. No home is remembered,
discovered or selected by default. Incomplete, duplicate, unknown or conflicting
Owner options fail without falling back to Workspace or a synthetic root.
`--autostart` ignores the complete selection and opens nothing.

The native launcher calls the pinned Memory Host's `registered_owner_root`, which
reauthenticates the original OS-account/home/operation/descriptor binding. It then
reserves Runtime's native directory identity and opens that exact Owner root using
Memory's recorded Host/System identities. A descriptor, path, CLI flags or the fact
that a process runs under the same OS account is not independently a human grant:
the actual invocation must be an authorized trusted native action under Memory's
ADR110 assumptions. The page receives no home/path/ActorRef or bootstrap tool.

Existing `memory_catalog` read-2/process APIs provide status, bounded literal
search, details and exact source quotes. Its additive Runtime status mode is
`registered_owner_readonly`; the fixed example retains `synthetic_segmented_only`.
Workspace v1 remains closed and is never reinterpreted as the Owner root. Native
root selection/authentication cannot be requested through this page channel.

In this mode, Runtime refuses Workspace writes, root creation/open/unlock, picks
and Provider configuration before they can change the native library's lifecycle.
There is no new Agent, OwnerReadGrant, capture, formation, recovery or cloud path.
Core still owns all source/subject/sensitivity/deletion/expiry checks; opening a
registered home does not renew expired policies or expand source access.

The host fixes a read-time `attention-rank-1` profile: revision 1, fade 30 days,
archive 180 days, protected episode/relationship-experience forms, no aliases or
protected IDs, 32 items and 65,536 bytes. These are display/selection parameters,
not durable maintenance or authority. No maintenance worker is started. The
native ceiling remains Private and the page cannot widen it.

Lock withdraws observations, drops the reader/Core and releases the directory
reservation; a page Unlock is refused. Reopening requires a new explicitly
authorized native invocation and fresh authentication, handles and selections.
Exit also releases the root. Normal window close still means close-to-tray under
ADR026; it must not be mistaken for locking or releasing the library.

## Verification and remaining gates

Before merging: native argument/authority refusal and existing consumers pass;
an explicitly allocated protected **synthetic** home is bootstrapped by the real
native API, seeded with fixed fictional records, opened/read/closed/reopened
without changing CURRENT or registration metadata; actual desktop tests cover
the same root across process restart and autostart refusal. See [evidence](../validation/Registered-owner-readonly-2026-11-17.md).

This amends the Runtime seam of ADR025/ADR037 (synthetic Memory) only for this
explicit read-only entry. It does not activate personal libraries or amend
Memory's authentication rules. A graphical home picker, unified shell status,
other Owner surfaces and any persistent opening preference are separate Runtime
work. Real-library readiness and independent backup proof belong to Memory;
personal GUI acceptance, installation and deployment need their own authorization.
