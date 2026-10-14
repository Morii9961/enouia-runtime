// Context surface backed by the pinned Enouia Memory Core (ADR-025). It shows
// a saved capsule: what was included or excluded and why, whether anything
// was sent, and the verified actual request of each dispatch. Ported from
// Memory's reference workspace. A new preview clears the old view and
// invalidates pending reads, and a dispatch view cannot outlive its capsule.
import { useCallback, useEffect, useState } from "react";
import { call, type J } from "./client";
import { useAction, useLatestRead } from "./hooks";
import { VaultGate } from "./status";
import { ErrorBox, Tag, shortId, when } from "./ui";
import { capsuleObservation, dispatchObservation } from "./observationIdentity";

/** The capsule budget in words when it has the usual fields; otherwise as recorded. */
function budget(b: J): string {
  if (b && typeof b.estimated_tokens === "number" && typeof b.max_tokens === "number") {
    const memory = typeof b.memory_budget_tokens === "number" ? ` · memory budget ${b.memory_budget_tokens}` : "";
    return `${b.estimated_tokens} of ${b.max_tokens} units (${b.counting_method ?? "unknown method"})${memory}`;
  }
  return JSON.stringify(b);
}

const DELIVERY: Record<string, string> = {
  preview_not_sent: "Preview only · nothing was sent anywhere",
  dispatched: "Dispatched · actual request inspection available",
};

export default function ContextSurface({ capsuleId }: { capsuleId: string | null }) {
  return (
    <VaultGate>
      <Context key={capsuleId ?? "none"} capsuleId={capsuleId} />
    </VaultGate>
  );
}

export function Context({ capsuleId, readPage = call }: { capsuleId: string | null; readPage?: typeof call }) {
  const [query, setQuery] = useState("");
  const [id, setId] = useState(capsuleId);
  const [view, setView] = useState<J>(null);
  const [request, setRequest] = useState<J>(null);
  const [dispatchId, setDispatchId] = useState<string | null>(null);
  const action = useAction();
  const reads = useLatestRead();
  const dispatchReads = useLatestRead();
  const pending = action.busy ? "Preparing preview…"
    : reads.busy || (id && !view && !reads.error) ? "Reading the saved capsule…"
    : dispatchReads.busy ? "Reading the actual request…" : null;
  const observeCapsule = useCallback((target: string) => {
    setView(null);
    setRequest(null);
    setDispatchId(null);
    dispatchReads.clear();
    void reads.run(async () => capsuleObservation(await readPage("context_inspect", { capsuleId: target }), target), setView);
  }, [readPage, reads.run, dispatchReads.clear]);
  useEffect(() => { if (id) observeCapsule(id); }, [id, observeCapsule]);
  const observeDispatch = (dispatch: J) => {
    if (!id || !view || action.busy || reads.pending.current) return;
    const capsule = id;
    setRequest(null); setDispatchId(dispatch.dispatchId);
    void dispatchReads.run(async () => dispatchObservation(await readPage("dispatch_inspect", { dispatchId: dispatch.dispatchId }), dispatch.dispatchId, capsule, dispatch.requestHash), setRequest);
  };
  const selectedDispatch = view?.dispatches.find((d: J) => d.dispatchId === dispatchId);
  const decisions: J[] = view?.inspection?.decisions ?? [];
  const included = decisions.filter((d) => d.decision === "included");
  const excluded = decisions.filter((d) => d.decision !== "included");
  const Rows = ({ rows }: { rows: J[] }) => (
    <table className="mem-table">
      <thead><tr><th>Record</th><th>Reason</th><th>Rank</th><th>Source reachable</th></tr></thead>
      <tbody>
        {rows.map((d, i) => (
          <tr key={i}>
            <td><code title={d.record_id}>{d.record_kind}:{shortId(d.record_id)}</code> r{d.revision}</td>
            <td>{d.reason}</td>
            <td>{d.rank ?? ""}</td>
            <td>{d.source_reachable ? "yes" : <Tag tone="warn">no</Tag>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  return (
    <section data-screen-label="Context Surface" className="mem-context" aria-busy={Boolean(pending)}>
      <div className="mem-context-main">
        <div className="qr20">
          <h1 id="mem-context-title" className="qr18" tabIndex={-1}>Context Surface</h1>
          <div className="qr19">What a request carries, and why. Saved capsules are read back, never recomputed.</div>
        </div>
        <form className="mem-actions" onSubmit={(e) => {
          e.preventDefault();
          if (!query.trim() || action.busy) return;
          reads.clear(); dispatchReads.clear(); setId(null); setView(null); setRequest(null); setDispatchId(null);
          void action.run(async (key) => setId((await readPage("context_preview", { query, sessionId: null, branchId: null }, key)).capsuleId));
        }}>
          <label htmlFor="mem-cq" className="mem-sr">Compile preview</label>
          <input id="mem-cq" className="mem-input mem-grow" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask a question to see which memories it would carry" autoComplete="off" />
          <button type="submit" className="mem-button mem-primary" disabled={!query.trim() || action.busy}>Preview</button>
        </form>
        <ErrorBox error={action.error} />
        <ErrorBox error={reads.error} />
        <ErrorBox error={dispatchReads.error} />
        {id && <button type="button" className="mem-button" disabled={action.busy || reads.busy}
          onClick={() => { if (!action.busy) observeCapsule(id); }}>Read saved capsule again</button>}
        {reads.error && <p className="mem-muted">This saved capsule could not be read. Read it again; this does not prepare a preview or send a request.</p>}
        {pending && <p role="status" className="mem-muted">{pending}</p>}
        {!id && !action.busy && <p className="mem-muted">Preview a question here, or open the context behind an answer from Sessions.</p>}
        {view && (
          <div className="mem-stack">
            <p className="mem-state-line">
              <strong>{Object.hasOwn(DELIVERY, view.delivery) ? DELIVERY[view.delivery] : "Unknown saved delivery state"}</strong>
              <span className="mem-muted"> · capsule <code title={id ?? ""}>{shortId(id)}</code> · destination {view.capsule.destination.kind} · {budget(view.capsule.budget)}</span>
            </p>
            <h3 className="mem-h3">Saved question</h3>
            <p className="mem-content mem-saved-query">{view.capsule.query}</p>
            <h3 className="mem-h3">Included ({included.length})</h3>
            {included.length ? <Rows rows={included} /> : <p className="mem-muted">Nothing was included.</p>}
            <h3 className="mem-h3">Excluded ({excluded.length})</h3>
            {excluded.length ? <Rows rows={excluded} /> : <p className="mem-muted">Nothing was excluded.</p>}
          </div>
        )}
      </div>
      <aside aria-label="Dispatches" className="qr88">
        <div className="qr79">
          <h3 className="mem-h3">Dispatches</h3>
          {view && view.dispatches.length === 0 && <p className="mem-muted">This capsule was never sent.</p>}
          {!view && <p className="mem-muted">{action.busy ? "Preparing preview…" : !id ? "No capsule selected." : reads.error ? "Capsule unavailable. Read saved capsule again to inspect it." : "Reading capsule…"}</p>}
          {view?.dispatches.map((d: J) => (
            <div key={d.dispatchId} className="mem-stack">
              <p>
                <code title={d.dispatchId}>{shortId(d.dispatchId)}</code> · {d.state}
                <span className="mem-muted"> · prepared {when(d.preparedAt)}{d.sentAt ? ` · sent ${when(d.sentAt)}` : " · not sent"}{d.completedAt ? ` · completed ${when(d.completedAt)}` : ""}</span>
              </p>
              <div className="mem-actions">
                <button type="button" className="mem-button" disabled={action.busy || reads.busy} onClick={() => observeDispatch(d)}>Show the actual request</button>
              </div>
            </div>
          ))}
          {selectedDispatch && <button type="button" className="mem-button" disabled={action.busy || reads.busy || dispatchReads.busy}
            onClick={() => observeDispatch(selectedDispatch)}>Read actual request again</button>}
          {request && (
            <div className="mem-stack">
              <p>
                Actual request <code title={dispatchId ?? ""}>{shortId(dispatchId)}</code> ·{" "}
                {request.verified ? <Tag tone="ok">re-rendered from the saved records and hash-checked</Tag> : <Tag tone="warn">hash mismatch</Tag>}
              </p>
              <p className="mem-muted">{request.tools} tools · {request.destination.kind}</p>
              {request.messages.map((m: J, i: number) => (
                <div key={i} className="mem-stack">
                  <span className="mem-mono mem-muted">{m.role}</span>
                  <pre className="mem-source">{m.text}</pre>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </section>
  );
}
