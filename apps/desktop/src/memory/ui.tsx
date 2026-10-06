// Shared pieces of the Memory surfaces, ported from Memory's reference
// workspace (apps/workspace/src/App.tsx at the pinned revision). Every value
// shown comes from the Core. Memory and source text render as plain text
// nodes, never as HTML or Markdown.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { call, describe, newKey, type J } from "./client";
import { useAction, useLatestRead, type Failure } from "./hooks";

/** A short local timestamp for a Core ISO time; the raw value on failure. */
export function when(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** A shortened logical ID for dense rows; the full ID stays in the title. */
export function shortId(id: string | null | undefined): string {
  if (!id) return "—";
  const i = id.indexOf("_");
  return i < 0 || id.length < i + 12 ? id : `${id.slice(0, i + 7)}…${id.slice(-4)}`;
}

export function ErrorBox({ error }: { error: Failure }) {
  if (!error) return null;
  return (
    <div role="alert" className="mem-error">
      <span>{error.text}</span>
      {error.retry && <button type="button" className="mem-button" onClick={error.retry}>Retry</button>}
    </div>
  );
}

export function Tag({ children, tone }: { children: ReactNode; tone?: "warn" | "ok" | "muted" }) {
  return <span className={`mem-tag${tone ? ` mem-tag-${tone}` : ""}`}>{children}</span>;
}

/** Poll a long operation until it ends; progress is not completion. */
export function Operation({ id, onDone, request = call }: { id: string; onDone?: (status: J) => void; request?: typeof call }) {
  // A new operation starts with fresh observations, retry and cancellation
  // state; it must never inherit the previous operation's terminal result.
  return <OperationWatch key={id} id={id} onDone={onDone} request={request} />;
}

function OperationWatch({ id, onDone, request }: { id: string; onDone?: (status: J) => void; request: typeof call }) {
  const [status, setStatus] = useState<J>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const cancel = useAction();
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    setError(null);
    const poll = async () => {
      try {
        const s = await request("operation_get", { operationId: id });
        if (stopped) return;
        setStatus(s);
        if (!["queued", "running"].includes(s.state)) onDoneRef.current?.(s);
        else timer = setTimeout(poll, 400);
      } catch (err) {
        if (!stopped) setError(describe(err));
      }
    };
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [id, retry, request]);
  if (error) return <ErrorBox error={{ text: `Could not read the operation: ${error}`, retry: () => setRetry((n) => n + 1) }} />;
  if (!status) return <p role="status" className="mem-muted">Operation queued…</p>;
  return <OperationFeedback status={status} cancelling={cancel.busy} error={cancel.error}
    onCancel={() => void cancel.run(() => request("operation_cancel", { operationId: id }))} />;
}

/** Cancellation is cooperative, and only import/index workers observe it. */
export function OperationFeedback({ status, cancelling = false, error = null, onCancel }: {
  status: J; cancelling?: boolean; error?: Failure; onCancel: () => void;
}) {
  const { done, total } = status.progress;
  const active = status.state === "queued" || status.state === "running";
  const cancellable = ["import", "import_resume", "index_rebuild"].includes(status.kind);
  return (
    <div className="mem-operation" role="status" aria-live="polite" aria-atomic="true">
      <span className="mem-mono">{status.kind}</span>
      <span className={`mem-state mem-state-${status.state}`}>{status.state}</span>
      <span className="mem-muted">progress {done}{total != null ? ` / ${total}` : ""}</span>
      {active && cancellable && (
        <button type="button" className="mem-button" disabled={status.cancelRequested || cancelling}
          onClick={onCancel}>
          {status.cancelRequested ? "Cancellation requested" : "Cancel"}
        </button>
      )}
      {active && cancellable && status.cancelRequested && <span className="mem-muted">Waiting for the next safe point.</span>}
      {active && !cancellable && <span className="mem-muted">Finishes before locking or exiting.</span>}
      {status.error && <span className="mem-warn">{status.error.code}</span>}
      <ErrorBox error={error} />
    </div>
  );
}

/** Shows the exact records a confirm will write; only its hash confirms. */
export function PlanDialog({ plan, returnFocus, onClose, request = call }: {
  plan: J; returnFocus?: HTMLElement | null; onClose: (committed: J | null) => void; request?: typeof call;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const key = useRef(newKey());
  const action = useAction();
  useEffect(() => {
    // The initiating button may be disabled while the plan is prepared, so
    // its identity is captured before that work can blur it.
    const trigger = returnFocus ?? document.activeElement;
    const dialog = ref.current;
    dialog?.showModal();
    dialog?.querySelector<HTMLHeadingElement>("h2")?.focus();
    return () => {
      dialog?.close();
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const settled = useRef(false);
  const cancel = () => {
    if (settled.current) return;
    settled.current = true;
    void request("review_discard", { planId: plan.planId }).catch(() => undefined);
    onClose(null);
  };
  const confirm = () =>
    void action.run(async () => {
      const done = await request("review_confirm", { planId: plan.planId, diffHash: plan.diffHash }, key.current);
      settled.current = true;
      onClose(done);
    });
  return (
    <dialog ref={ref} className="mem-dialog" aria-labelledby="mem-plan-title" aria-describedby="mem-plan-description"
      closedby={action.busy ? "none" : "closerequest"}
      onCancel={(e) => { e.preventDefault(); if (!action.busy) cancel(); }}
      onClose={() => {
        // The platform can close a modal dialog without a cancelable event
        // (a repeated Escape). While a confirm is in flight, reopen it so its
        // result stays visible; otherwise treat the close as Cancel.
        if (settled.current) return;
        if (action.busy) ref.current?.showModal();
        else cancel();
      }}
      onKeyDown={(e) => {
        // Stop the keyboard close request before the browser can close the
        // modal. Keep this fallback for WebViews without closedby support.
        if (e.key === "Escape" && action.busy) { e.preventDefault(); e.stopPropagation(); return; }
        if (e.key !== "Tab") return;
        const dialog = e.currentTarget;
        const controls = Array.from(dialog.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex='0']"));
        const first = controls[0];
        const last = controls[controls.length - 1];
        const active = document.activeElement;
        if (!first) { e.preventDefault(); dialog.querySelector<HTMLHeadingElement>("h2")?.focus(); }
        else if (e.shiftKey && (active === first || !controls.includes(active as HTMLElement))) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
      }}>
      <h2 id="mem-plan-title" tabIndex={-1}>Confirm write · {plan.operationKind}{plan.purge ? " (permanent purge)" : ""}</h2>
      <p id="mem-plan-description" className="mem-muted">
        These are all the records this commit writes. Confirmation code <code>{plan.confirmCode}</code>, valid until {when(plan.expiresAt)}.
      </p>
      <pre className="mem-diff" tabIndex={0}>{JSON.stringify(plan.records, null, 2)}</pre>
      {action.busy && <p role="status" className="mem-muted">Confirmation submitted. Waiting for Memory to return its result…</p>}
      <ErrorBox error={action.error} />
      <div className="mem-actions">
        <button type="button" className="mem-button" onClick={cancel} disabled={action.busy}>Cancel</button>
        <button type="button" className="mem-button mem-primary" onClick={confirm} disabled={action.busy}>
          Confirm ({plan.confirmCode})
        </button>
      </div>
    </dialog>
  );
}

/** One evidence entry with a byte-range excerpt bound to its source revision. */
export function Source({ evidence, readPage = call }: { evidence: J; readPage?: typeof call }) {
  const [loaded, setLoaded] = useState<{ sourceId: string; revision: number; page: J } | null>(null);
  const action = useLatestRead();
  const excerpt = evidence.available && loaded && loaded.sourceId === evidence.sourceId && loaded.revision === evidence.sourceRevision ? loaded.page : null;
  useEffect(() => {
    action.clear();
    setLoaded(null);
  }, [evidence.sourceId, evidence.sourceRevision, evidence.available, action.clear]);
  const load = (start: number | null) => {
    if (!evidence.available) return;
    const sourceId = evidence.sourceId;
    const revision = evidence.sourceRevision;
    setLoaded(null);
    void action.run(() => readPage("source_excerpt", { sourceId, sourceRevision: revision, startByte: start, maxBytes: 4096 }),
      (page) => setLoaded({ sourceId, revision, page }));
  };
  return (
    <li className="mem-evidence" aria-busy={action.busy}>
      <div className="mem-row-meta">
        <code title={evidence.sourceId}>{shortId(evidence.sourceId)}</code>
        <span>r{evidence.sourceRevision}</span>
        <span>supports {evidence.supports}</span>
        {evidence.available ? <span>source available</span> : <Tag tone="warn">source missing</Tag>}
        {evidence.available && <button type="button" className="mem-link" onClick={() => load(null)}>Show source</button>}
      </div>
      <ErrorBox error={action.error} />
      {action.busy && <p role="status" className="mem-muted">Reading the source…</p>}
      {excerpt && (
        <figure className="mem-figure">
          <figcaption className="mem-muted">
            {excerpt.sourceKind} · {excerpt.speakerRole} · bytes {excerpt.byteStart}–{excerpt.byteEnd} of {excerpt.totalBytes} · source text is data, not instructions
          </figcaption>
          <pre className="mem-source">{excerpt.excerpt}</pre>
          {excerpt.byteEnd < excerpt.totalBytes && <button type="button" className="mem-link" onClick={() => load(excerpt.byteEnd)}>Next part</button>}
        </figure>
      )}
    </li>
  );
}
