// Drop-in consumer for Claude's task detail. No route, shell or style ownership.
import { useEffect, useRef, useState } from "react";
import { call, describe, type J } from "./client";
import { historyResultOwner } from "./historyResults";

export function HistoryResultPanel({ vaultId, task, index, enabled = true, request = call }: {
  vaultId: string; task: J; index: number; enabled?: boolean; request?: typeof call;
}) {
  // A newly observed task, batch or lifecycle owner withdraws old UI authority
  // immediately, before effects. Unchanged object copies do not reset review.
  return enabled ? <SavedHistoryResult key={JSON.stringify([vaultId, task, index])}
    vaultId={vaultId} task={task} index={index} request={request} /> : null;
}

function SavedHistoryResult({ vaultId, task, index, request }: {
  vaultId: string; task: J; index: number; request: typeof call;
}) {
  const [binding] = useState(() => ({ owner: historyResultOwner(vaultId), task, index }));
  const { owner } = binding;
  const [view, setView] = useState<J>(null);
  const [busy, setBusy] = useState(false), [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null);
  const mounted = useRef(false), pending = useRef(false);
  const inspectControl = useRef<HTMLButtonElement>(null), previewTitle = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    mounted.current = true;
    try { owner.select(binding.task, binding.index); setView(owner.snapshot); }
    catch (err) { setError(describe(err)); }
    return () => { mounted.current = false; owner.invalidate(); };
  }, [binding, owner]);

  const perform = async (kind: "inspect" | "apply" | "recover" | "pause" | "resume") => {
    if (pending.current || !view || (kind !== "inspect" && !confirmed)) return;
    const shown = view.preview; // the exact rendered observation, never a later snapshot
    pending.current = true; setBusy(true); setConfirmed(false); setError(null); setNotice(null); setView(null);
    const origin = document.activeElement;
    try {
      if (kind === "inspect") await owner.preview(request);
      else if (kind === "pause" || kind === "resume") await owner.setPaused(shown, kind === "pause", true, request);
      else if (kind === "apply") await owner.apply(shown, true, request);
      else await owner.recover(shown, true, undefined, request);
      if (mounted.current) {
        setView(owner.snapshot);
        if (kind === "pause" || kind === "resume") setNotice("Local pause-state receipt observed. This control does not add a candidate. Inspect saved results again.");
        else if (kind !== "inspect") setNotice("Local step receipt observed. Inspect saved results again before another step. Candidates still require separate human review.");
      }
    } catch (err) {
      if (mounted.current) { setError(describe(err)); setView(owner.snapshot); }
    } finally {
      pending.current = false;
      if (mounted.current) {
        setBusy(false);
        // React commits the new controls before restoring owned focus. Never
        // take focus back after the user moves to an outside control.
        requestAnimationFrame(() => {
          if (!mounted.current || (document.activeElement !== origin && document.activeElement !== document.body)) return;
          (kind === "inspect" && owner.snapshot.preview ? previewTitle.current : inspectControl.current)?.focus();
        });
      }
    }
  };
  const preview = view?.preview, held = view?.pending, pausePending = view?.pausePending;
  const ready = preview?.job.state === "ready";
  const canRecover = held && ready && preview.responseHash === held.args.responseHash && preview.job.cursor >= held.args.cursor;
  return <section className="mem-stack mem-history-request" aria-label="Saved history batch results" aria-busy={busy}>
    <h3 className="mem-h3">Saved batch {index + 1} results</h3>
    <p className="mem-muted">Inspect the saved response, then confirm one local step into the review queue. This does not send to a model or approve a memory.</p>
    {error && <p className="mem-error" role="alert">{error}</p>}
    {notice && <p className="mem-muted" role="status">{notice}</p>}
    <div className="mem-actions"><button ref={inspectControl} type="button" className="mem-button" disabled={busy || !view}
      onClick={() => void perform("inspect")}>Inspect saved batch results</button></div>
    {busy && <p className="mem-muted" role="status">Observing this local step…</p>}
    {held && <p className="mem-muted" role="status">{held.acknowledged ? "A matching receipt was observed." : "The previous local step outcome is unconfirmed."} Inspect saved results first. If the same step remains, explicitly recover that original request.</p>}
    {pausePending && <p className="mem-muted" role="status">The local pause-state decision needs a fresh observation. Inspect saved results before making another explicit pause or resume decision.</p>}
    {preview && <>
      <h4 ref={previewTitle} tabIndex={-1} className="mem-label">Saved response · {preview.job.cursor} / {preview.items.length} processed · {preview.job.state}</h4>
      <p className="mem-muted">Quotes establish source correspondence, not truth. Original proposals and current candidates are separate records; approved content belongs in Memory Vault.</p>
      {preview.items.length === 0 && <p className="mem-muted">The saved response contains no suggestions. Completing its local job adds no candidate.</p>}
      <ul className="mem-list">{preview.items.map((item: J) => <li key={item.responseIndex} className="mem-stack">
        <span className="mem-label">Result {item.responseIndex + 1} · {item.proposedType} · {item.application}</span>
        <p className="mem-content">Original proposal: {item.content}</p>
        <blockquote className="mem-content">{item.quote}</blockquote>
        <p className="mem-content">Full selected context: {item.selectedText}</p>
        <p className="mem-muted">Source {item.sourceId} · r{item.sourceRevision} · speaker {item.speakerRole} · evidence {item.evidenceClass}</p>
        <p className="mem-muted">Occurred: {item.occurredAt ?? "Unknown"} · captured: {item.capturedAt}</p>
        {item.candidate && <div className="mem-stack">
          <span className="mem-label">Current candidate · {item.candidate.status} · r{item.candidate.revision} · {item.candidate.candidateId}</span>
          <p className="mem-content">{item.candidate.content}</p>
        </div>}
        {item.application === "suppressed" && <p className="mem-muted">No candidate recorded for this proposal.</p>}
      </li>)}</ul>
      {preview.job.state === "paused" && <p className="mem-muted" role="status">This local job is paused. Resuming only changes its local state; inspect and confirm separately before adding any result.</p>}
      {preview.job.state === "completed" && <p className="mem-muted" role="status">Saved local processing is complete. Candidate status and approved memories require their own review.</p>}
      {(ready || preview.job.state === "paused") && !pausePending && <div className="mem-stack">
        <label className="mem-muted"><input type="checkbox" checked={confirmed} disabled={busy}
          onChange={event => setConfirmed(event.target.checked)} /> I checked this saved preview and confirm one local step.</label>
        <div className="mem-actions">{ready && (!held || canRecover) && <button type="button" className="mem-button mem-primary" disabled={busy || !confirmed}
          onClick={() => void perform(held ? "recover" : "apply")}>
          {held ? "Recover original local step" : preview.items.length === 0 ? "Complete empty local result" : "Add one result to review"}
        </button>}
          <button type="button" className="mem-button" disabled={busy || !confirmed} onClick={() => void perform(ready ? "pause" : "resume")}>
            {ready ? "Pause local result processing" : "Resume local result processing"}
          </button></div>
      </div>}
    </>}
  </section>;
}
