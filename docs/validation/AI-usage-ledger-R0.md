# AI Usage Ledger R0 — verification record

Date: 2026-10-21 (Asia/Shanghai). Scope: documentation and read-only source research. R0 stops at the missing UsageSnapshot contract gate. No parser, database, CLI, export, desktop, dependency, scheduler, producer or Memory implementation changes.

## Repository and protocol observations

| Check | Actual observation |
| --- | --- |
| Initial `git status --short --branch` | Clean detached HEAD |
| `git remote -v`; `git rev-parse HEAD`; `git worktree list` | Runtime origin verified; baseline `5deb9546eead991b0ea7382aa7574a6b4e6cd712`; existing worktrees retained |
| GitHub connector: Runtime `commits/main` | Same SHA as checkout; PR #92 open and unrelated; no merge performed |
| GitHub connector: Dashboard `commits/main` | `d0fb1c9708f52570f5a898ff65437c39669a6795` |
| GitHub connector: Dashboard `git/trees/main?recursive=1` | 450 entries, `truncated: false`, no usage/ledger paths; existing project-status schemas only |
| Dashboard proposed `packages/protocol/usage/usage-snapshot.v1.schema.json` | 404 at inspected main; absence also checked against full tree, not inferred solely from this path |
| Dashboard adopted protocol ADR | Formal schema location is `docs/protocol/schema/`; [ADR-0002 at inspected SHA](https://github.com/Morii9961/Moriium-Dashboard/blob/d0fb1c9708f52570f5a898ff65437c39669a6795/docs/adr/0002-protocol-package.md) concerns project status |
| Dashboard PR searches | Open #41/#42 unrelated; usage search returned none; unpublished work is unknown |
| Fixed ccusage source | `v20.0.20` resolves to `bd7f89b469aee5635fb2e6722dd6d70f2d113ac1`; daily loader, entry loader and core count types inspected |
| Personal-data coverage | None: no source roots selected, logs read, accounts queried or private acceptance attempted |
| UsageSnapshot conformance | **Not run / unavailable**: no frozen schema/version/hash, shared fixture or conformance command supplied |

The ccusage source observations and proposed field mappings are detailed in the [study](../AI_USAGE_LEDGER_R0.md). Codex historical JSONL-version compatibility is not independently established by this R0; it remains an R1 source-verification gate. No external price or exchange-rate facts were used.

## Local validation

Documentation checks and exact results are recorded in [the command output](AI-usage-ledger-R0-checks.txt). Validation checks relative file links, local document formatting, fictional arithmetic, and protected-path Git trees. These checks do not execute the scenario matrix or establish parser, file security, durability, performance, Windows-native or personal-data acceptance.

Rust/desktop builds and runtime regression suites are not run: no executable source, manifest, dependency, contract, fixture or UI changes. Protected paths are compared to the verified Runtime baseline instead. The existing historical ccusage 16-check report is a source reference, not a freshly rerun test result.

Network/Git constraints: initial sandbox `git ls-remote`/`gh pr list` could not connect; current remote evidence was retrieved through the read-only GitHub connector. Branch creation initially failed because worktree Git refs live outside its writable root; the authorized elevated retry succeeded. Neither failure was a product bug. Commit/push results are reported after execution, not inferred from local files.

## Review and continuation

Review [ADR-035](../adr/035-ai-usage-ledger.md), especially the independent state layout, conservative ambiguous-event rules and the narrow future Claude parser exception. The scenario matrix contains fictional definitions only; none is a frozen wire format.

To resume, provide the immutable Dashboard UsageSnapshot schema/hash, semantic and replacement rules, budgets/enums, shared accepted/adversarial fixtures, and conformance command. Recheck both mains/PRs and adopt the ADR before R1. Morii separately chooses any real-data sample roots/ranges. There is no new executable command to run against personal data in this delivery.

Production source collection, scheduling, live monitoring, automatic reporting, VPS upload, pricing and Memory changes remain unauthorized by this scope. No project-status percentage or human acceptance is claimed.
