// Presentation of saved local Mock output at the pinned Memory revision.
// Unknown formats stay literal; the original recorded text is never changed.
import { shortId } from "./ui";

const STATUS: Record<string, string> = {
  no_supported_evidence: "No approved evidence was available for this answer.",
  supported_evidence: "Supported by approved memories.",
  conflicted: "The approved evidence contains a conflict.",
  implementation_unverified: "Implementation has not been verified by this evidence.",
  needs_reverification: "This evidence needs to be verified again.",
};
type SourceRef = { source_id: string; source_revision: number };
type MockResponse = { status: string; statements: string[]; sources: SourceRef[] };
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

export function SessionEventBody({ kind, text }: { kind: string; text: string }) {
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
    </div>
  );
}
