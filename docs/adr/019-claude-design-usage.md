# ADR-019 — Add official Claude Design tokens to the existing Claude series

Status: **direction approved; implementation deferred**. Recorded 2026-09-26.

## Context

Architecture v0.3 and ADR-013 fix ActivityData v1 to three sources. The `claude` source currently means local Claude Code plus Cowork tokens by Shanghai calendar date. A separate handoff identifies a conditional Enterprise Analytics API filter for `claude_design`; its one-day buckets are UTC and its availability depends on the account plan and permissions. The user wants that official product usage included in the existing Claude series, without a fourth public source or calendar.

## Decision

Retain the three-source wire shape. When the activation gates in [the integration note](../CLAUDE_DESIGN_USAGE.md) pass, `sources.claude` may become a derived daily sum of privately tracked Code/Cowork and official `claude_design` components. Design is grouped into Shanghai days from smaller UTC buckets. The consumer's label and explanation must change with the producer's semantic change. Local component history and coverage remain distinct so retries and official revisions cannot add a component twice.

This decision supersedes the **future meaning** of `claude` in Architecture v0.3 and ADR-013 only on an accepted cutover. It does not change the current ActivityData/batch v1 validators, source list, metrics, timezone literal, or current Moriium display. If the source cannot be measured reliably or overlaps Code/Cowork in an unexplained way, keep the present meaning and mark the extension unavailable.

## Consequences

The public daily sum will no longer mean Code/Cowork alone after activation; a label that says only “Claude Code” would be inaccurate. The current v1 JSON has no field for component coverage, so that explanation belongs in coordinated presentation and local diagnostics. A failed Design component retains the previous combined snapshot. Revisions can lower a prior date. The existing archive and pending bytes need reconciliation before cutover. No credentials, private API responses, or user IDs are published.
