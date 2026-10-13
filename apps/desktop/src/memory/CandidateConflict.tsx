// A candidate's conflict revision is a recorded reference; memory_read
// observes the current saved record, which may have changed since then.
import { useState } from "react";
import { call, type J } from "./client";
import { useLatestRead } from "./hooks";
import { ErrorBox, Tag, shortId } from "./ui";

export function CandidateConflict({ conflict, readPage = call }: { conflict: J; readPage?: typeof call }) {
  const [requested, setRequested] = useState(false);
  const [record, setRecord] = useState<J>(null);
  const read = useLatestRead();
  const observe = () => {
    setRequested(true); setRecord(null);
    void read.run(() => readPage("memory_read", { memoryId: conflict.memory_id }), result => setRecord(result.record));
  };
  const hide = () => { read.clear(); setRequested(false); setRecord(null); };
  return <li className="mem-evidence" aria-busy={read.busy}>
    <p className="mem-muted">Reported conflict: <code title={conflict.memory_id}>{shortId(conflict.memory_id)}</code> · r{conflict.revision}</p>
    <div className="mem-actions">
      <button type="button" className="mem-link" onClick={observe}>{requested ? "Read conflicting memory again" : "Read current conflicting memory"}</button>
      {requested && <button type="button" className="mem-link" onClick={hide}>Hide conflicting memory</button>}
    </div>
    <ErrorBox error={read.error} />
    {read.busy && <p role="status" className="mem-muted">Reading the conflicting memory…</p>}
    {read.error && <p className="mem-muted">The current record could not be read. Its reported conflict remains in the candidate; read again to observe the saved record.</p>}
    {record && <div className="mem-stack">
      <p className="mem-muted">Current saved observation · r{record.revision} · <Tag>{record.status}</Tag></p>
      {record.revision !== conflict.revision && <p className="mem-warn">This record has changed since the reported conflict. The candidate reference above still names r{conflict.revision}; this read does not resolve that conflict.</p>}
      <p className="mem-content">{record.content}</p>
    </div>}
  </li>;
}
