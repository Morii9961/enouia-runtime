// Read-only H1 planning through the pinned Workspace. Batch references are
// observations, never extraction jobs, approvals or canonical memories.
import { useEffect, useId, useRef, useState } from "react";
import { call, type J } from "./client";
import { useLatestRead } from "./hooks";
import { historyObservation } from "./observationIdentity";
import { shortId, when } from "./ui";

const positive = (text: string, max: number) => /^\d+$/.test(text) && Number.isSafeInteger(Number(text)) && Number(text) > 0 && Number(text) <= max;

export function HistoryPlan({ vaultId, importId, importRevision, request = call }: {
  vaultId: string; importId: string; importRevision: number; request?: typeof call;
}) {
  const [messages, setMessages] = useState("15"), [references, setReferences] = useState("10000");
  const [plan, setPlan] = useState<J>(null), [observedAt, setObservedAt] = useState<string | null>(null);
  const [page, setPage] = useState<{ cursor: string | null; previous: (string | null)[] } | null>(null);
  const read = useLatestRead(), id = useId();
  const focusReturn = useRef<HTMLButtonElement | null>(null);
  const planControl = useRef<HTMLButtonElement | null>(null), pageSummary = useRef<HTMLParagraphElement | null>(null);
  const valid = positive(messages, 15) && positive(references, 100000);
  useEffect(() => {
    if (read.busy || !focusReturn.current) return;
    const trigger = focusReturn.current; focusReturn.current = null;
    if (document.activeElement === document.body || document.activeElement === trigger)
      (trigger.isConnected ? trigger : pageSummary.current ?? planControl.current)?.focus();
  }, [read.busy]);
  const refresh = (cursor: string | null, trigger: HTMLButtonElement, previous: (string | null)[] = []) => {
    if (read.pending.current || !valid) return;
    focusReturn.current = document.activeElement === trigger ? trigger : null;
    const selection = { vaultId, importId, importRevision, messagesPerBatch: Number(messages), maxPathReferences: Number(references), cursor, limit: 10 };
    setPlan(null); setPage(null); setObservedAt(null);
    void read.run(async () => historyObservation(await request("history_plan", {
      importId, importRevision, messagesPerBatch: selection.messagesPerBatch, maxPathReferences: selection.maxPathReferences, cursor, limit: selection.limit,
    }), selection), result => { setPlan(result); setPage({ cursor, previous }); setObservedAt(new Date().toISOString()); });
  };
  const edit = (text: string, field: "messages" | "references") => {
    if (read.pending.current) return;
    read.clear(); setPlan(null); setPage(null); setObservedAt(null);
    if (field === "messages") setMessages(text); else setReferences(text);
  };
  const summary = plan?.summary;
  return <section className="mem-stack" aria-labelledby={`${id}-title`} style={{ minWidth: 0, overflowWrap: "anywhere" }}>
    <h4 id={`${id}-title`} className="mem-h3">History planning</h4>
    <p className="mem-muted">Plan the received archive with the Memory Core. This reads coverage and batch references only; it does not extract, send, create a task or approve a memory.</p>
    <fieldset disabled={read.busy} className="mem-stack" style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <legend className="mem-label">Local planning bounds</legend>
      <label className="mem-label" htmlFor={`${id}-messages`}>Messages per batch (1–15)</label>
      <input id={`${id}-messages`} className="mem-input" inputMode="numeric" autoComplete="off" value={messages}
        aria-invalid={!positive(messages, 15)} onChange={event => edit(event.target.value, "messages")} />
      <label className="mem-label" htmlFor={`${id}-references`}>Path reference budget (1–100000)</label>
      <input id={`${id}-references`} className="mem-input" inputMode="numeric" autoComplete="off" value={references}
        aria-invalid={!positive(references, 100000)} onChange={event => edit(event.target.value, "references")} />
    </fieldset>
    <p className="mem-muted">Shared ancestors count again on each branch path. These are local planning bounds, not token or spending budgets. The Core limits received/decompressed input to 64 MiB and parsed messages/units to 100000.</p>
    <div className="mem-actions">
      <button ref={planControl} type="button" className="mem-button" disabled={read.busy || !valid}
        onClick={event => refresh(null, event.currentTarget)}>{plan || read.error ? "Read history plan again" : "Plan archived history"}</button>
      {plan && page && page.previous.length > 0 && <button type="button" className="mem-button" disabled={read.busy}
        onClick={event => refresh(page.previous.at(-1)!, event.currentTarget, page.previous.slice(0, -1))}>Previous history batches</button>}
      {plan?.nextCursor && page && <button type="button" className="mem-button" disabled={read.busy}
        onClick={event => refresh(plan.nextCursor, event.currentTarget, [...page.previous, page.cursor])}>Next history batches</button>}
    </div>
    {read.busy && <p role="status" className="mem-muted">Reading the archive's history plan…</p>}
    {read.error && <p role="alert" className="mem-error">{read.error.text} No plan is current. Read a fresh plan before using batch references.</p>}
    {plan && <>
      <p ref={pageSummary} tabIndex={-1} role="status" className="mem-muted">{plan.batches.length
        ? `Showing batches ${plan.batches[0].batchIndex + 1}–${plan.batches.at(-1).batchIndex + 1} of ${summary.batches}`
        : "No history batches on this page"}</p>
      <p className="mem-muted">Observed {when(observedAt)} · import revision {importRevision} · head <span className="mem-mono" title={plan.identity.commitId}>{shortId(plan.identity.commitId)}</span></p>
      <p className="mem-muted">This describes the received archive, not all platform history or extraction quality. Unknown dates stay unknown; export branch selection is not owner approval.</p>
      <dl className="mem-facts">
        <dt>Parsed messages</dt><dd>{summary.messages}</dd><dt>Dated</dt><dd>{summary.dated}</dd><dt>Unknown time</dt><dd>{summary.undated}</dd>
        <dt>Observed range</dt><dd>{when(summary.earliest)} — {when(summary.latest)}</dd>
        <dt>Incomplete messages</dt><dd>{summary.incompleteMessages}</dd><dt>Unparseable items</dt><dd>{summary.unparseable}</dd>
        <dt>Unavailable attachments</dt><dd>{summary.unavailableAttachments}</dd><dt>Total batches</dt><dd>{summary.batches}</dd>
        <dt>Graph/time issues</dt><dd>{summary.issues}</dd>
      </dl>
      <p className="mem-mono">Plan {plan.planHash}</p>
      {plan.issues.length > 0 && <ul className="mem-list">{plan.issues.map((issue: J, index: number) => <li key={index}>Unit {issue.unitIndex + 1} · {issue.kind}</li>)}</ul>}
      {plan.issuesOmitted > 0 && <p className="mem-muted">{plan.issuesOmitted} additional issue locations are omitted from this bounded preview; they remain included in the total above.</p>}
      {plan.batches.length === 0 ? <p className="mem-muted">No batch references on this page. Inspect coverage and graph issues; this is not a completed extraction.</p>
        : <div className="mem-stack">{plan.batches.map((batch: J) => <details key={batch.batchIndex} className="mem-card">
          <summary className="mem-label">Batch {batch.batchIndex + 1} · {batch.messages.length} messages · {batch.selectedInExport ? "selected in export" : "other or unknown export selection"}</summary>
          <p className="mem-muted">Observed path start: {when(batch.observedPathStart)}. References do not approve a branch or create a model task.</p>
          <p className="mem-mono">Leaf: {batch.leaf.sourceId} · revision {batch.leaf.sourceRevision}</p>
          {batch.preceding && <p className="mem-mono">Preceding reference: {batch.preceding.sourceId} · revision {batch.preceding.sourceRevision}</p>}
          <ul className="mem-list">{batch.messages.map((message: J, index: number) => <li key={index}>
            <span className="mem-mono">{message.sourceId}</span> · revision {message.sourceRevision} · {message.speakerRole} / {message.evidenceClass} · {when(message.occurredAt)} · {message.completeness}
          </li>)}</ul>
        </details>)}</div>}
    </>}
  </section>;
}
