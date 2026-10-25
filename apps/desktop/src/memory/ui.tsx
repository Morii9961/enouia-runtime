// Shared pieces of the Memory surfaces, ported from Memory's reference
// workspace (apps/workspace/src/App.tsx at the pinned revision). Every value
// shown comes from the Core. Memory and source text render as plain text
// nodes, never as HTML or Markdown.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ExtractionPanel } from "./ExtractionPanel";
import { CallError, call, describe, newKey, type J } from "./client";
import { useAction, useLatestRead, type Failure } from "./hooks";
import { operationObservation, sourceObservation } from "./observationIdentity";

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
export function Operation({ id, kind, onDone, request = call }: { id: string; kind?: string; onDone?: (status: J) => void; request?: typeof call }) {
  // A new operation starts with fresh observations, retry and cancellation
  // state; it must never inherit the previous operation's terminal result.
  return <OperationWatch key={`${id}:${kind ?? ""}`} id={id} kind={kind} onDone={onDone} request={request} />;
}

function OperationWatch({ id, kind, onDone, request }: { id: string; kind?: string; onDone?: (status: J) => void; request: typeof call }) {
  const [status, setStatus] = useState<J>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [cancelAcknowledged, setCancelAcknowledged] = useState(false);
  const terminal = useRef(false);
  const observation = useRef(0);
  const mounted = useRef(false);
  const observedKind = useRef<string | null>(kind ?? null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const cancel = useAction();
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const publish = useCallback((next: J) => {
    if (terminal.current) return;
    observedKind.current = next.kind;
    setStatus(next);
    setError(null);
    if (["succeeded", "failed", "cancelled"].includes(next.state)) {
      terminal.current = true;
      onDoneRef.current?.(next);
    }
  }, []);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    setError(null);
    const poll = async () => {
      if (terminal.current) return;
      const started = observation.current;
      try {
        const s = await request("operation_get", { operationId: id });
        if (stopped) return;
        // A cancellation reply is a newer observation than a read already
        // in flight. That older read must not reopen a terminal operation.
        if (started === observation.current) publish(operationObservation(s, id, observedKind.current));
      } catch (err) {
        if (stopped) return;
        if (started === observation.current && !terminal.current) {
          setError(describe(err));
          return;
        }
      }
      if (!stopped && !terminal.current) timer = setTimeout(poll, 400);
    };
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [id, retry, request, publish]);
  const stop = () => void cancel.run(async () => {
    const reply = await request("operation_cancel", { operationId: id });
    if (!mounted.current || terminal.current) return;
    let next: J;
    try { next = operationObservation(reply, id, status.kind); }
    catch { throw new CallError({ code: "invalid_request", retryable: false, rules: [] }); }
    observation.current += 1;
    if (next.cancelRequested) setCancelAcknowledged(true);
    publish(next);
    // A previous failed or held read must not leave an acknowledged stop
    // without a watcher. Restart observation only; never replay the stop.
    if (!terminal.current) setRetry((n) => n + 1);
  });
  return <>
    {status ? <OperationFeedback status={{ ...status, cancelRequested: status.cancelRequested || cancelAcknowledged }}
      cancelling={cancel.busy} error={cancel.error} onCancel={stop} />
      : !error && <p role="status" className="mem-muted">Operation queued…</p>}
    {error && <ErrorBox error={{ text: `Could not read the operation: ${error}`, retry: () => setRetry((n) => n + 1) }} />}
  </>;
}

/** Cancellation is cooperative; external calls stop locally, not remotely. */
export function OperationFeedback({ status, cancelling = false, error = null, onCancel }: {
  status: J; cancelling?: boolean; error?: Failure; onCancel: () => void;
}) {
  const { done, total } = status.progress;
  const active = status.state === "queued" || status.state === "running";
  const external = status.kind === "external_send";
  const cancellable = external || ["import", "import_resume", "index_rebuild", "history_materialize", "history_resume"].includes(status.kind);
  return (
    <div className="mem-operation" role="status" aria-live="polite" aria-atomic="true">
      <span className="mem-mono">{status.kind}</span>
      <span className={`mem-state mem-state-${status.state}`}>{status.state}</span>
      <span className="mem-muted">progress {done}{total != null ? ` / ${total}` : ""}</span>
      {active && cancellable && (
        <button type="button" className="mem-button" disabled={status.cancelRequested || cancelling}
          onClick={onCancel}>
          {external ? (status.cancelRequested ? "Local stop requested" : "Stop locally") : (status.cancelRequested ? "Cancellation requested" : "Cancel")}
        </button>
      )}
      {active && external && <span className="mem-muted">The service may have received the request. Stopping locally does not confirm remote cancellation.</span>}
      {active && cancellable && status.cancelRequested && <span className="mem-muted">{external ? "Waiting for the local call to stop." : "Waiting for the next safe point."}</span>}
      {active && !cancellable && <span className="mem-muted">Finishes before locking or exiting.</span>}
      {!active && external && <span className="mem-muted">
        {status.state === "succeeded" && ["completed", "length"].includes(status.result?.finish)
          ? `Reply saved in the session${status.result.finish === "length" ? "; stopped at the output limit" : ""}.`
          : "Read the recorded outcome in the session before preparing another request. The service may have received this request."}
      </span>}
      {status.state === "succeeded" && status.kind === "vault_verify" && typeof status.result?.clean === "boolean" && (
        <span className={status.result.clean ? "mem-muted" : "mem-warn"}>
          {status.result.clean ? "Verification passed" : "Verification found integrity problems"}: {status.result.recordsChecked} records · {status.result.objectsChecked} objects.
          {!status.result.clean && <> Missing records: {status.result.missingRecords}; corrupt records: {status.result.corruptRecords}; missing objects: {status.result.missingObjects}; corrupt objects: {status.result.corruptObjects}; damaged segments: {status.result.damagedSegments}.</>}
        </span>
      )}
      {status.state === "succeeded" && status.kind === "backup_export" && status.result && (
        <span className="mem-muted">Backup saved: commit #{status.result.sequence} · {status.result.files} files · {status.result.destinationName}.</span>
      )}
      {status.error && <span className="mem-warn">{describe(new CallError(status.error))}</span>}
      {/* A later observed acknowledgement or terminal result supersedes a stop
          error, including a stop reply that arrives after that observation. */}
      <ErrorBox error={active && !status.cancelRequested ? error : null} />
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
  const blocked = !!action.error && !action.error.retry;
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
    <dialog ref={ref} className="mem-dialog" aria-labelledby="mem-plan-title" aria-describedby={blocked ? "mem-plan-description mem-plan-recovery" : "mem-plan-description"}
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
      {blocked && <p id="mem-plan-recovery" className="mem-muted">This confirmation cannot be retried. Cancel, check the saved state, and prepare a new plan if needed.</p>}
      <div className="mem-actions">
        <button type="button" className="mem-button" onClick={cancel} disabled={action.busy}>Cancel</button>
        <button type="button" className="mem-button mem-primary" onClick={confirm} disabled={action.busy || blocked}>
          Confirm ({plan.confirmCode})
        </button>
      </div>
    </dialog>
  );
}

/** One evidence entry with a byte-range excerpt bound to its source revision. */
export function Source({ evidence, readPage = call }: { evidence: J; readPage?: typeof call }) {
  const [loaded, setLoaded] = useState<{ sourceId: string; revision: number; page: J } | null>(null);
  const [suggest, setSuggest] = useState(false);
  const [extractionBusy, setExtractionBusy] = useState(false);
  const action = useLatestRead();
  const readControl = useRef<HTMLButtonElement>(null);
  const sourceText = useRef<HTMLPreElement>(null);
  const suggestControl = useRef<HTMLButtonElement>(null);
  const focusAfterSuggest = useRef<{ trigger: Element | null } | null>(null);
  const focusAfterRead = useRef<{ trigger: Element | null } | null>(null);
  const excerpt = evidence.available && loaded && loaded.sourceId === evidence.sourceId && loaded.revision === evidence.sourceRevision ? loaded.page : null;
  useEffect(() => {
    focusAfterRead.current = null;
    focusAfterSuggest.current = null;
    action.clear();
    setLoaded(null);
    setSuggest(false);
  }, [evidence.sourceId, evidence.sourceRevision, evidence.available, action.clear]);
  useEffect(() => {
    if (action.busy || action.pending.current || !focusAfterRead.current) return;
    const { trigger } = focusAfterRead.current;
    focusAfterRead.current = null;
    if (document.activeElement === document.body || document.activeElement === trigger) {
      (action.error ? readControl.current : sourceText.current)?.focus();
    }
  }, [excerpt, action.busy, action.error]);
  useEffect(() => {
    if (suggest || !focusAfterSuggest.current) return;
    const { trigger } = focusAfterSuggest.current;
    focusAfterSuggest.current = null;
    if (document.activeElement === document.body || document.activeElement === trigger) {
      suggestControl.current?.focus();
    }
  }, [suggest]);
  const load = (start: number | null) => {
    if (!evidence.available || extractionBusy) return;
    focusAfterSuggest.current = null;
    focusAfterRead.current = { trigger: document.activeElement };
    const sourceId = evidence.sourceId;
    const revision = evidence.sourceRevision;
    setLoaded(null);
    void action.run(async () => sourceObservation(await readPage("source_excerpt", { sourceId, sourceRevision: revision, startByte: start, maxBytes: 4096 }), sourceId, revision),
      (page) => setLoaded({ sourceId, revision, page }));
  };
  const sourceError = action.error && {
    ...action.error,
    retry: action.error.retry ? () => {
      if (action.pending.current || extractionBusy || !evidence.available) return;
      focusAfterRead.current = { trigger: document.activeElement };
      action.error?.retry?.();
    } : undefined,
  };
  return (
    <li className="mem-evidence" aria-busy={action.busy}>
      <div className="mem-row-meta">
        <code title={evidence.sourceId}>{shortId(evidence.sourceId)}</code>
        <span>r{evidence.sourceRevision}</span>
        <span>supports {evidence.supports}</span>
        {evidence.available ? <span>source available</span> : <Tag tone="warn">source missing</Tag>}
        {evidence.available && <button ref={readControl} type="button" className="mem-link" onClick={() => load(null)}>Show source</button>}
      </div>
      <ErrorBox error={sourceError} />
      {action.busy && <p role="status" className="mem-muted">Reading the source…</p>}
      {excerpt && (
        <figure className="mem-figure">
          <figcaption className="mem-muted">
            {excerpt.sourceKind} · {excerpt.speakerRole} · bytes {excerpt.byteStart}–{excerpt.byteEnd} of {excerpt.totalBytes} · source text is data, not instructions
          </figcaption>
          <pre ref={sourceText} tabIndex={-1} aria-label="Source text" className="mem-source">{excerpt.excerpt}</pre>
          {extractionBusy && <p role="status" className="mem-muted">Waiting for the current suggestion action before showing another part.</p>}
          {excerpt.byteEnd < excerpt.totalBytes && <button type="button" className="mem-link" disabled={extractionBusy} onClick={() => { if (!extractionBusy) { setSuggest(false); load(excerpt.byteEnd); } }}>Next part</button>}
          {!suggest && excerpt.byteEnd > excerpt.byteStart && <>{" "}<button ref={suggestControl} type="button" className="mem-link" onClick={() => setSuggest(true)}>Suggest memories from this part…</button></>}
          {suggest && <ExtractionPanel request={readPage} onBusyChange={setExtractionBusy} onClose={() => {
            focusAfterSuggest.current = { trigger: document.activeElement };
            setSuggest(false);
          }}
            range={{ sourceId: evidence.sourceId, revision: evidence.sourceRevision, start: excerpt.byteStart, end: excerpt.byteEnd }} />}
        </figure>
      )}
    </li>
  );
}
