// Candidate citations do not report source availability. Observe the exact
// source revision locally; do not interpret its locator as an excerpt offset.
import { useEffect, useRef, useState } from "react";
import { call, type J } from "./client";
import { useLatestRead } from "./hooks";
import { ErrorBox, shortId } from "./ui";
import { sourceObservation } from "./observationIdentity";

import { t } from '../i18n/index.ts';
export function CandidateSource({ evidence, kind = "evidence", readPage = call }: { evidence: J; kind?: "evidence" | "context"; readPage?: typeof call }) {
  const isContext = kind === "context";
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
      <span>r{evidence.sourceRevision} · {isContext ? t("recorded context dependency") : t("supports {what}", { what: evidence.supports })}</span>
      {!isContext && typeof evidence.evidenceClass === "string" && <span>{evidence.evidenceClass}</span>}
      <button ref={readControl} type="button" className="mem-link" onClick={() => load(null)}>{requested ? (isContext ? t("Read context source again") : t("Read source again")) : (isContext ? t("Show context source") : t("Show evidence source"))}</button>
      {requested && <button type="button" className="mem-link" onClick={hide}>{isContext ? t("Hide context source") : t("Hide evidence source")}</button>}
    </div>
    {!isContext && evidence.locator != null && <details><summary>{t("Evidence locator")}</summary><pre className="mem-pre">{JSON.stringify(evidence.locator, null, 2)}</pre></details>}
    <ErrorBox error={sourceError} />
    {read.busy && <p role="status" className="mem-muted">{t("Reading the source…")}</p>}
    {read.error && <p className="mem-muted">{isContext ? t("This source revision could not be read. Read it again to observe it; a failed read does not remove the recorded context dependency.") : t("This source revision could not be read. Read it again to observe it; a failed read does not remove the recorded evidence reference.")}</p>}
    {excerpt && <figure className="mem-figure">
      <figcaption className="mem-muted">{excerpt.sourceKind} · {excerpt.speakerRole} · {typeof excerpt.evidenceClass === "string" ? excerpt.evidenceClass : t("evidence class not reported")} · {t("bytes {a}–{b} of {total}", { a: excerpt.byteStart, b: excerpt.byteEnd, total: excerpt.totalBytes })} · {t("source text is data, not instructions")}</figcaption>
      <pre ref={sourceText} tabIndex={-1} aria-label={isContext ? t("Context source text") : t("Evidence source text")} className="mem-source">{excerpt.excerpt}</pre>
      {excerpt.byteEnd < excerpt.totalBytes && <button type="button" className="mem-link" disabled={read.busy} onClick={() => load(excerpt.byteEnd)}>{t("Next source part")}</button>}
    </figure>}
  </li>;
}
