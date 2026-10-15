// Presentation of saved local Mock output at the pinned Memory revision.
// Unknown formats stay literal; the original recorded text is never changed.
import { ErrorBox, shortId, when } from "./ui";
import { call } from "./client";
import { useLatestRead } from "./hooks";
import { useEffect, useRef, useState } from "react";
import { readSavedMockContext, type SavedMockReference } from "./savedMockContext";

const EVENT: Record<string, string> = {
  user_message: "User message", assistant_chunk: "Assistant response part", assistant_completed: "Assistant response",
  tool_request: "Tool request", tool_result: "Tool result", turn_cancelled: "Turn cancelled", turn_failed: "Turn failed",
  checkpoint_created: "Checkpoint", provider_switched: "Provider changed",
};
const DELIVERY: Record<string, string> = {
  not_applicable: "recorded", partial: "partial", completed: "complete", interrupted: "interrupted", failed: "failed",
};

export function SessionEventMetadata({ kind, deliveryState, occurredAt }: { kind: unknown; deliveryState: unknown; occurredAt?: unknown }) {
  const event = typeof kind === "string" && Object.hasOwn(EVENT, kind) ? EVENT[kind] : "Recorded event";
  const delivery = typeof deliveryState === "string" && Object.hasOwn(DELIVERY, deliveryState) ? DELIVERY[deliveryState] : "delivery unavailable";
  const time = typeof occurredAt === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(occurredAt)
    && !Number.isNaN(Date.parse(occurredAt)) ? occurredAt : null;
  return <>{event} · {delivery} · {time ? <time dateTime={time} title={time}>{when(time)}</time> : "time unavailable"}</>;
}

const STATUS: Record<string, string> = {
  no_supported_evidence: "No approved evidence was available for this answer.",
  supported_evidence: "Supported by approved memories.",
  conflicted: "The approved evidence contains a conflict.",
  implementation_unverified: "Implementation has not been verified by this evidence.",
  needs_reverification: "This evidence needs to be verified again.",
};
type SourceRef = { source_id: string; source_revision: number };
type MockResponse = { status: string; statements: string[]; sources: SourceRef[]; dispatch_id: string; request_hash: string };
const object = (value: unknown): value is Record<string, unknown> => value != null && typeof value === "object" && !Array.isArray(value);
const revision = (value: unknown) => typeof value === "number" && Number.isInteger(value) && value > 0;

function recordedMock(text: string): MockResponse | null {
  try {
    const value: unknown = JSON.parse(text);
    if (!object(value) || typeof value.status !== "string" || !Object.hasOwn(STATUS, value.status)
      || typeof value.dispatch_id !== "string" || !value.dispatch_id.startsWith("dsp_")
      || typeof value.request_hash !== "string" || !/^[a-f0-9]{64}$/.test(value.request_hash)
      || !Array.isArray(value.statements) || !value.statements.every(item => typeof item === "string")
      || !Array.isArray(value.sources) || !value.sources.every(item => object(item) && typeof item.source_id === "string" && revision(item.source_revision))
      || !Array.isArray(value.memories) || !value.memories.every(item => object(item) && typeof item.memory_id === "string" && revision(item.revision))) return null;
    return value as MockResponse;
  } catch { return null; }
}

type ContextAccess = { sessionId: string; branchId: string; disabled: boolean; inspect: (capsuleId: string) => void; request: typeof call };

function SavedMockContext({ reference, disabled, inspect, request }: { reference: SavedMockReference } & Pick<ContextAccess, "disabled" | "inspect" | "request">) {
  const reads = useLatestRead();
  const [observed, setObserved] = useState<{ capsuleId: string } | null>(null);
  const capsuleId = observed?.capsuleId;
  const readButton = useRef<HTMLButtonElement>(null);
  const inspectButton = useRef<HTMLButtonElement>(null);
  const focusAfterRead = useRef<{ trigger: Element | null } | null>(null);
  useEffect(() => {
    if (reads.busy || reads.pending.current || !focusAfterRead.current) return;
    const { trigger } = focusAfterRead.current;
    focusAfterRead.current = null;
    // Restore the task path only if the reader did not move focus elsewhere.
    // Discard this handoff while the parent owns the Session; never defer it.
    if (!disabled && (document.activeElement === document.body || document.activeElement === trigger)) {
      (capsuleId ? inspectButton.current : readButton.current)?.focus();
    }
  }, [reads.busy, reads.error, observed, disabled, capsuleId]);
  const read = () => {
    if (disabled || reads.pending.current) return;
    focusAfterRead.current = { trigger: document.activeElement };
    setObserved(null);
    void reads.run(() => readSavedMockContext(reference, request), capsuleId => setObserved({ capsuleId }));
  };
  return <div className="mem-stack" aria-label="Saved answer context" aria-busy={reads.busy}>
    <div className="mem-actions">
      <button ref={readButton} type="button" className="mem-button" disabled={disabled || reads.busy} onClick={read}>{reads.error || capsuleId ? "Read saved answer context again" : "Read saved answer context"}</button>
      {capsuleId && <button ref={inspectButton} type="button" className="mem-button" disabled={disabled || reads.busy} onClick={() => { if (!disabled && !reads.pending.current) inspect(capsuleId); }}>Inspect saved answer context</button>}
    </div>
    {reads.busy && <p role="status" className="mem-muted">Reading this answer's saved context…</p>}
    <ErrorBox error={reads.error && { ...reads.error, retry: !disabled && reads.error.retry ? read : undefined }} />
    {reads.error && <p className="mem-muted">This answer's saved context could not be verified. Read it again; this does not generate another answer.</p>}
  </div>;
}

export function SessionEventBody({ kind, text, context }: { kind: string; text: string; context?: ContextAccess }) {
  const response = kind === "assistant_completed" ? recordedMock(text) : null;
  if (!response) return kind.startsWith("assistant") ? <pre className="mem-source">{text}</pre> : <p className="mem-content">{text}</p>;
  return (
    <div className="mem-stack">
      <p className="mem-muted mem-response-status">Local Mock · {STATUS[response.status]}</p>
      {response.statements.map((statement, index) => <p key={index} className="mem-content">{statement}</p>)}
      <p className="mem-muted mem-response-sources">
        Sources: {response.sources.length ? response.sources.map((source, index) => (
          <span key={`${source.source_id}:${source.source_revision}`}>{index > 0 && ", "}<code title={source.source_id}>{shortId(source.source_id)}</code> r{source.source_revision}</span>
        )) : "none"}
      </p>
      <details className="mem-recorded-response">
        <summary className="mem-muted">Recorded response</summary>
        <pre className="mem-source" tabIndex={0}>{text}</pre>
      </details>
      {context && <SavedMockContext key={`${context.sessionId}:${context.branchId}:${response.dispatch_id}:${response.request_hash}`}
        reference={{ sessionId: context.sessionId, branchId: context.branchId, dispatchId: response.dispatch_id, requestHash: response.request_hash }}
        disabled={context.disabled} inspect={context.inspect} request={context.request} />}
    </div>
  );
}
