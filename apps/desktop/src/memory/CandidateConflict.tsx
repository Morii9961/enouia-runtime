// A candidate's conflict revision is a recorded reference; memory_read
// observes the current saved record, which may have changed since then.
import { useEffect, useRef, useState } from "react";
import { call, type J } from "./client";
import { useLatestRead } from "./hooks";
import { ErrorBox, Tag, shortId } from "./ui";
import { memoryObservation } from "./observationIdentity";

import { t } from '../i18n/index.ts';
export function CandidateConflict({ conflict, readPage = call }: { conflict: J; readPage?: typeof call }) {
  const [requested, setRequested] = useState(false);
  const [record, setRecord] = useState<J>(null);
  const read = useLatestRead();
  const readControl = useRef<HTMLButtonElement>(null);
  const recordText = useRef<HTMLParagraphElement>(null);
  const focusAfterRead = useRef<{ trigger: Element | null } | null>(null);
  useEffect(() => {
    if (read.busy || read.pending.current || !focusAfterRead.current) return;
    const { trigger } = focusAfterRead.current;
    focusAfterRead.current = null;
    if (document.activeElement === document.body || document.activeElement === trigger) {
      (read.error ? readControl.current : recordText.current)?.focus();
    }
  }, [record, read.busy, read.error]);
  const observe = () => {
    focusAfterRead.current = { trigger: document.activeElement };
    setRequested(true); setRecord(null);
    void read.run(async () => {
      const result = await readPage("memory_read", { memoryId: conflict.memory_id });
      // Current revision may differ, but this must still be the cited memory.
      return memoryObservation(result, conflict.memory_id).record;
    }, setRecord);
  };
  const hide = () => { focusAfterRead.current = null; read.clear(); setRequested(false); setRecord(null); readControl.current?.focus(); };
  const readError = read.error && {
    ...read.error,
    retry: read.error.retry ? () => {
      if (read.pending.current) return;
      focusAfterRead.current = { trigger: document.activeElement };
      read.error?.retry?.();
    } : undefined,
  };
  return <li className="mem-evidence" aria-busy={read.busy}>
    <p className="mem-muted">{t("Reported conflict:")} <code title={conflict.memory_id}>{shortId(conflict.memory_id)}</code> · r{conflict.revision}</p>
    <div className="mem-actions">
      <button ref={readControl} type="button" className="mem-link" onClick={observe}>{requested ? "Read conflicting memory again" : "Read current conflicting memory"}</button>
      {requested && <button type="button" className="mem-link" onClick={hide}>{t("Hide conflicting memory")}</button>}
    </div>
    <ErrorBox error={readError} />
    {read.busy && <p role="status" className="mem-muted">{t("Reading the conflicting memory…")}</p>}
    {read.error && <p className="mem-muted">The current record could not be read. Its reported conflict remains in the candidate; read again to observe the saved record.</p>}
    {record && <div className="mem-stack">
      <p className="mem-muted">Current saved observation · r{record.revision} · <Tag>{record.status}</Tag></p>
      {record.revision !== conflict.revision && <p className="mem-warn">This record has changed since the reported conflict. The candidate reference above still names r{conflict.revision}; this read does not resolve that conflict.</p>}
      <p ref={recordText} tabIndex={-1} aria-label={t("Current conflicting memory")} className="mem-content">{record.content}</p>
    </div>}
  </li>;
}
