// Candidate citations do not report source availability. Observe the exact
// source revision locally; do not interpret its locator as an excerpt offset.
import { useState } from "react";
import { call, type J } from "./client";
import { useLatestRead } from "./hooks";
import { ErrorBox, shortId } from "./ui";

export function CandidateSource({ evidence, readPage = call }: { evidence: J; readPage?: typeof call }) {
  const [requested, setRequested] = useState(false);
  const [excerpt, setExcerpt] = useState<J>(null);
  const read = useLatestRead();
  const load = (start: number | null) => {
    setRequested(true);
    setExcerpt(null);
    void read.run(() => readPage("source_excerpt", {
      sourceId: evidence.sourceId, sourceRevision: evidence.sourceRevision, startByte: start, maxBytes: 4096,
    }), setExcerpt);
  };
  const hide = () => { read.clear(); setRequested(false); setExcerpt(null); };
  return <li className="mem-evidence" aria-busy={read.busy}>
    <div className="mem-row-meta">
      <code title={evidence.sourceId}>{shortId(evidence.sourceId)}</code>
      <span>r{evidence.sourceRevision} · supports {evidence.supports}</span>
      <button type="button" className="mem-link" onClick={() => load(null)}>{requested ? "Read source again" : "Show evidence source"}</button>
      {requested && <button type="button" className="mem-link" onClick={hide}>Hide evidence source</button>}
    </div>
    <details><summary>Evidence locator</summary><pre className="mem-pre">{JSON.stringify(evidence.locator, null, 2)}</pre></details>
    <ErrorBox error={read.error} />
    {read.busy && <p role="status" className="mem-muted">Reading the source…</p>}
    {read.error && <p className="mem-muted">This source revision could not be read. Read source again to observe it; a failed read does not remove the candidate's evidence reference.</p>}
    {excerpt && <figure className="mem-figure">
      <figcaption className="mem-muted">{excerpt.sourceKind} · {excerpt.speakerRole} · bytes {excerpt.byteStart}–{excerpt.byteEnd} of {excerpt.totalBytes} · source text is data, not instructions</figcaption>
      <pre className="mem-source">{excerpt.excerpt}</pre>
      {excerpt.byteEnd < excerpt.totalBytes && <button type="button" className="mem-link" disabled={read.busy} onClick={() => load(excerpt.byteEnd)}>Next source part</button>}
    </figure>}
  </li>;
}
