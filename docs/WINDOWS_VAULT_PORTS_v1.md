# Windows Vault file ports v1 — backend adapter design

Date: 2026-10-02. Status: capability/ordering design, no Windows adapter implementation. Authority: [Vault v1](VAULT_STORAGE_v1.md), [storage shape](../contracts/vault/storage-v1.schema.json), ADR-020/022/023. Initial acceptance target is named local NTFS on Windows, with marked synthetic roots.

## Capabilities and ownership

The existing common `AtomicFile`/`LockProvider` interfaces are generic ports; a string/path plus `replace_durable` name does not establish safe complete-bundle behavior. Keep pure Memory/Session/Context/Provider crates independent of OS/storage/SQLite. Propose separate Vault contract/store and disposable-index adapters behind orchestration; update the resolved dependency guard deliberately when adding actual modules. No Cargo module/dependency is added by this design.

The future adapter consumes backend-validated opaque IDs and closed managed path kinds. Its public interface cannot accept an arbitrary client filename/path. Only explicit Core-root configuration/initialization may resolve a human-selected absolute directory. The root capability records directory/volume identity, supported filesystem, ACL/local/sync-root policy and held handle ownership; no cloned capability may outlive its underlying handles.

| Port | Input/capability | Output or invariant |
|---|---|---|
| `verify_root` | Explicit configured root/policy | `VerifiedRoot` with checked identity/volume, or structured refusal |
| `acquire_writer` | Verified root | Process-scoped Core lock; bootstrap works before selector exists |
| `pin_parent` | Root plus allowlisted managed directory components | Held verified parent handles; no reparse/ancestor substitution window |
| `read_regular` | Pinned parent, validated single filename, byte cap | Checked opened regular-file handle, exact bytes/length/hash; no outside-root read |
| `create_new_regular` | Pinned parent plus allowlisted filename | Exclusive new file; no overwrite on entropy collision |
| `write_flush_seal` | New-file capability, bounded bytes | Check every write/flush; read-back and exact-byte validation; retained failure artifact |
| `publish_generation` | Checked staging/generation parents and complete sealed image | Same-volume immutable publication with no replacement of an existing generation |
| `switch_selector` | Checked root, flushed unique temporary pointer, expected binding, writer guard | One intended selection boundary; return observed old/new/conflict/unknown |
| `audit_recovery` | Writer guard and bounded inventories | Selected complete lineage plus retained staging/raw/orphan evidence; no guessed replay |

Capabilities need explicit lifetimes; losing a parent/lock/volume proof invalidates a mutation. The transaction layer consumes the guard rather than merely trusting a boolean saying it was acquired. Cancellation before selector publication preserves the selected parent; after an attempted switch requires observation before classification.

## Candidate Windows mechanisms and evidence limits

[CreateFileW](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew) documents exclusive creation, directory/reparse flags and sharing modes. Use `CREATE_NEW` for staged files and `OPEN_EXISTING` for reads, never truncating creation for a retained object. Directory handles require the documented directory flag; opened metadata must confirm expected directory/regular-file type and reject reparse points before consuming bytes.

[GetFileInformationByHandleEx](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-getfileinformationbyhandleex) supplies attribute/tag, identity and standard-file metadata. [FILE_STANDARD_INFO](https://learn.microsoft.com/en-us/windows/win32/api/winbase/ns-winbase-file_standard_info) includes link count and directory/delete-pending information. Require a single-link managed regular file, expected size and stable identity; reject a pending deletion or external link alias. Directory link-count semantics are not treated as regular-file semantics.

[GetFinalPathNameByHandleW](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-getfinalpathnamebyhandlew) can report the opened object's resolved path/volume form. Compare handle/volume identity plus validated managed components; a string prefix or final leaf reparse flag alone does not establish safe ancestry. Protect root and every ancestor across opening/creation/publication, not only at startup.

Freeze and verify the adapter's actual access/share masks, final-path normalization, handle inheritance, ACL checks and parent pinning before activation. Sharing flags alone do not establish that metadata/reparse mutation is impossible. If a path-based primitive cannot prove the required no-outside-root guarantee before access, implement and separately source-verify a handle-relative primitive or refuse that adapter path. Post-write detection alone is insufficient. This is an explicit implementation gate, not a claim that the existing Activity writer already protects Core ancestry.

Pointer/generation publication may reuse the same-volume move pattern only after proving its exact reader/ACL/error behavior against the required matrix. Never copy across volumes, delay moves to reboot, delete the old selector before renaming, inherit child handles or infer whole-bundle power-loss durability from a flush/move return value. [ADR-020's source limits](adr/020-core-vault-generations.md) remain applicable.

## Root policy, locks and failures

Reject source/build/install roots, known cloud sync roots, remote/unsupported filesystems and reparse/alias roots before managed access. A folder-name substring is not sufficient sync-root identification. Establish policy from explicit configuration and verified OS/local-root information; missing proof refuses activation rather than scanning personal folders or downloading placeholders. No real OneDrive/device access is exercised by this document.

Core writer and disposable index-owner locks are separate from Activity locks. Store lock ownership in OS handles; stale files/PIDs/time alone do not grant lock reclamation. Use no privileged machine-wide service or configuration changes for synthetic verification. A failed lock refuses the operation without allocating a new Session event/Provider dispatch.

Structured port errors include root unsupported, path refused, reparse/alias refused, lock busy, collision, sharing violation, storage full, write/flush failed, selector conflict and selector unknown. Canonical error DTOs contain categories/opaque IDs only. Private bounded recovery inventories may retain exact local evidence; raw native error output is not a public payload.

## Required adapter contract fixtures

Name exact filesystem/OS/API/build versions and masks. Exercise root/ancestor/leaf reparse cases, regular hard-link aliases, alternate streams/device/case/trailing paths, parent/leaf swap races, simultaneous processes, non-inherited handles, unavailable entropy, short writes/flush failures, sharing violations and same-volume selection. Check outside-root sentinels **before and after** each operation. Pair injected failures with actual process-death/restart cases; physical disk-full/power/storage claims need their own device evidence.

These ports and storage schemas are implementation inputs. They authorize no root creation, personal migration, scheduler, runtime writer or production repair.
