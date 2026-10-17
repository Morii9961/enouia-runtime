// Candidate citations do not report source availability. Observe the exact
// source revision locally; do not interpret its locator as an excerpt offset.
import { useEffect, useRef, useState } from "react";
import { call, type J } from "./client";
import { useLatestRead } from "./hooks";
import { ErrorBox, shortId } from "./ui";
import { sourceObservation } from "./observationIdentity";

export function CandidateSource({ evidence, readPage = call }: { evidence: J; readPage?: typeof call }) {
  const [requested, setRequested] = useState(false);
  const [excerpt, setExcerpt] = useState<J>(null);
  const read = useLatestRead();
  const readControl = useRef<HTMLButtonElement>(null);
  const sourceText = useRef<HTMLPreElement>(null);
  const focusAfterRead = useRef<{ trigger: Element | null } | null>(null);
  useEffect(() => {
    if (read.busy || read.pending.current || !focusAfterRead.current) return;
    const { trigger } = focusAfterRead.current;
    focusAfterRead.current = null;
    if (document.activeElement === document.body || document.activeElement === trigger) {
      (read.error ? readControl.current : sourceText.current)?.focus();
    }
  }, [excerpt, read.busy, read.error]);
  const load = (start: number | null) => {
    focusAfterRead.current = { trigger: document.activeElement };
    setRequested(true);
    setExcerpt(null);
    void read.run(async () => {
      const result = await readPage("source_excerpt", {
        sourceId: evidence.sourceId, sourceRevision: evidence.sourceRevision, startByte: start, maxBytes: 4096,
      });
      // An excerpt must observe the exact cited source revision.
      return sourceObservation(result, evidence.sourceId, evidence.sourceRevision);
    }, setExcerpt);
  };
  const hide = () => { focusAfterRead.current = null; read.clear(); setRequested(false); setExcerpt(null); readControl.current?.focus(); };
  const sourceError = read.error && {
    ...read.error,
    retry: read.error.retry ? () => {
      if (read.pending.current) return;
      focusAfterRead.current = { trigger: document.activeElement };
      read.error?.retry?.();
    } : undefined,
  };
  return <li className="mem-evidence" aria-busy={read.busy}>
    <div className="mem-row-meta">
      <code title={evidence.sourceId}>{shortId(evidence.sourceId)}</code>
      <span>r{evidence.sourceRevision} · supports {evidence.supports}</span>
      <button ref={readControl} type="button" className="mem-link" onClick={() => load(null)}>{requested ? "Read source again" : "Show evidence source"}</button>
      {requested && <button type="button" className="mem-link" onClick={hide}>Hide evidence source</button>}
    </div>
    <details><summary>Evidence locator</summary><pre className="mem-pre">{JSON.stringify(evidence.locator, null, 2)}</pre></details>
    <ErrorBox error={sourceError} />
    {read.busy && <p role="status" className="mem-muted">Reading the source…</p>}
    {read.error && <p className="mem-muted">This source revision could not be read. Read source again to observe it; a failed read does not remove the candidate's evidence reference.</p>}
    {excerpt && <figure className="mem-figure">
      <figcaption className="mem-muted">{excerpt.sourceKind} · {excerpt.speakerRole} · bytes {excerpt.byteStart}–{excerpt.byteEnd} of {excerpt.totalBytes} · source text is data, not instructions</figcaption>
      <pre ref={sourceText} tabIndex={-1} aria-label="Evidence source text" className="mem-source">{excerpt.excerpt}</pre>
      {excerpt.byteEnd < excerpt.totalBytes && <button type="button" className="mem-link" disabled={read.busy} onClick={() => load(excerpt.byteEnd)}>Next source part</button>}
    </figure>}
  </li>;
}
