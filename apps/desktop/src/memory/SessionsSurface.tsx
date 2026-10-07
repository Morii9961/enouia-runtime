// Sessions surface backed by the pinned Enouia Memory Core (ADR-025).
// Ported from Memory's reference workspace:
// - Selection and detail change together, only when the latest read publishes.
// - Drafts are kept per session branch across switches and retries.
// - An acknowledgement clears a draft only if it is unchanged.
// - A write blocks branch switching until it settles.
import { useCallback, useEffect, useRef, useState } from "react";
import { call, type J } from "./client";
import { useAction, useLatestRead } from "./hooks";
import { VaultGate } from "./status";
import { ErrorBox, Tag, shortId, when } from "./ui";
import { SessionEventBody } from "./SessionEventBody";

type Branch = { sessionId: string; branchId: string };

export default function SessionsSurface({ inspect }: { inspect: (capsuleId: string) => void }) {
  return (
    <VaultGate>
      <Sessions inspect={inspect} />
    </VaultGate>
  );
}

export function Sessions({ inspect, request = call }: { inspect: (capsuleId: string) => void; request?: typeof call }) {
  const [sessions, setSessions] = useState<J[] | null>(null);
  const [current, setCurrent] = useState<Branch | null>(null);
  const [detail, setDetail] = useState<J>(null);
  const [text, setText] = useState("");
  const [answer, setAnswer] = useState<J>(null);
  const [summary, setSummary] = useState("");
  const action = useAction();
  const listRead = useLatestRead();
  const detailRead = useLatestRead();
  const writing = useRef(false);
  const selectedBranch = useRef<string | null>(null);
  const drafts = useRef(new Map<string, { text: string; summary: string }>());
  const branchKey = (b: Branch) => `${b.sessionId}:${b.branchId}`;
  const list = useCallback(() => listRead.run(() => request("session_list"), (page) => setSessions(page.items)), [listRead.run, request]);
  useEffect(() => { void list(); }, [list]);
  const open = (b: Branch) =>
    detailRead.run(() => request("session_detail", b), (saved) => {
      const key = branchKey(b);
      if (selectedBranch.current !== key) { setAnswer(null); action.clear(); }
      selectedBranch.current = key;
      const draft = drafts.current.get(key);
      setText(draft?.text ?? "");
      setSummary(draft?.summary ?? "");
      setCurrent(b);
      setDetail(saved);
    });
  const editDraft = (field: "text" | "summary", value: string) => {
    if (!current) return;
    const key = branchKey(current);
    drafts.current.set(key, { ...(drafts.current.get(key) ?? { text: "", summary: "" }), [field]: value });
    if (field === "text") setText(value); else setSummary(value);
  };
  const clearSubmittedDraft = (field: "text" | "summary", submitted: string) => {
    if (current && drafts.current.get(branchKey(current))?.[field] === submitted) editDraft(field, "");
  };
  const write = (commit: (key: string) => Promise<void>) => {
    if (writing.current || detailRead.pending.current) return;
    void action.run(async (key) => {
      writing.current = true;
      try { await commit(key); } finally { writing.current = false; }
    });
  };
  const busy = action.busy || detailRead.busy;
  return (
    <section data-screen-label="Sessions" className="mem-sessions">
      <aside className="qr28" aria-label="Sessions" aria-busy={listRead.busy || (sessions == null && !listRead.error)}>
        <div className="qr20">
          <h1 className="qr18">Sessions</h1>
          <div className="qr19">Conversations kept as they happened.</div>
        </div>
        <div className="qr20">
          <button type="button" className="mem-button mem-primary" disabled={busy || listRead.busy}
            onClick={() => write(async (key) => {
              const s = await request("session_new", {}, key);
              await list();
              await open({ sessionId: s.sessionId, branchId: s.branchId });
            })}>New session</button>
        </div>
        <ErrorBox error={listRead.error} />
        {(listRead.busy || (sessions == null && !listRead.error)) && <p role="status" className="mem-muted qr20">Reading sessions…</p>}
        {sessions != null && !listRead.busy && !listRead.error && sessions.length === 0 && <p className="mem-muted qr20">No sessions yet.</p>}
        <div className="qr27">
          {sessions?.map((s) => s.branches.map((b: J) => {
            const active = current?.branchId === b.branchId;
            return (
              <button key={b.branchId} type="button" className="qr26 mem-session-row" disabled={action.busy} aria-pressed={active}
                style={{ background: active ? "#17212B" : "transparent", color: active ? "#E7EDF2" : "#9BA9B6" }}
                title={`${s.sessionId} · ${b.branchId}`}
                onClick={() => { if (!writing.current) void open({ sessionId: s.sessionId, branchId: b.branchId }); }}>
                <span className="qr24">{when(s.updatedAt)}</span>
                <span className="qr25">{b.lastEventSeq} {b.lastEventSeq === 1 ? "event" : "events"}</span>
              </button>
            );
          }))}
        </div>
      </aside>
      <div className="qr45" aria-label="Session transcript" aria-busy={busy}>
        <div className="qr31">
          <h2 className="qr29" tabIndex={-1}>{current ? `Session ${shortId(current.sessionId)}` : "Choose a session"}</h2>
          {detail && <div className="qr19">last saved event {detail.lastSavedEventId ? shortId(detail.lastSavedEventId) : "none"}</div>}
          <div className="qr30" />
        </div>
        <div className="qr44">
          <ErrorBox error={detailRead.error} />
          {detailRead.busy && <p role="status" className="mem-muted mem-pad">Reading the session…</p>}
          {detail && current && (
            <div className="mem-pad mem-stack">
              <ol className="mem-transcript">
                {detail.transcript.map((e: J) => (
                  <li key={e.eventId} className={`mem-event mem-event-${e.kind}`}>
                    <span className="mem-muted mem-mono">{e.kind} · {e.deliveryState}</span>
                    {e.text != null && <SessionEventBody kind={e.kind} text={e.text} />}
                  </li>
                ))}
              </ol>
              {detail.turns.filter((t: J) => t.state !== "completed").map((t: J) => (
                <p key={t.turnId} className="mem-warn">Turn {shortId(t.turnId)}: {t.state} (last persisted event {shortId(t.last_persisted_event_id ?? t.lastPersistedEventId)})</p>
              ))}
              <form className="mem-stack" onSubmit={(e) => {
                e.preventDefault();
                write(async (key) => {
                  setAnswer(null);
                  setAnswer(await request("session_ask", { ...current, text }, key));
                  clearSubmittedDraft("text", text);
                  await open(current);
                  await list();
                });
              }}>
                <label className="mem-label" htmlFor="mem-ask">Ask (local Mock; answers cite approved memories only)</label>
                <textarea id="mem-ask" className="mem-textarea" value={text} disabled={busy} onChange={(e) => editDraft("text", e.target.value)} />
                <div className="mem-actions">
                  <button type="submit" className="mem-button mem-primary" disabled={!text.trim() || busy}>Send</button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
      <aside aria-label="Session inspector" className="qr88">
        <div className="qr79">
          <ErrorBox error={action.error} />
          {action.busy && <p role="status" className="mem-muted">Waiting for Memory to return the session result…</p>}
          {answer && (
            <div className="mem-stack" aria-live="polite">
              <h3 className="mem-h3">Answer · {answer.status}</h3>
              {answer.statements.map((s: string, i: number) => <p key={i} className="mem-content">{s}</p>)}
              <p className="mem-muted">Sources: {answer.sources.map((s: J) => shortId(s.source_id)).join(", ") || "none"}</p>
              <div className="mem-actions">
                <button type="button" className="mem-button" onClick={() => inspect(answer.capsuleId)}>Inspect the context behind this answer</button>
              </div>
            </div>
          )}
          {detail && current && (
            <>
              <div className="mem-stack">
                <h3 className="mem-h3">Checkpoints</h3>
                <p className="mem-muted">Provisional session artifacts. They become memories only after review.</p>
                {detail.checkpoints.length === 0 && <p className="mem-muted">None yet.</p>}
                <ul className="mem-list">
                  {detail.checkpoints.map((c: J) => (
                    <li key={c.checkpoint_id}><Tag>{c.status}</Tag> {typeof c.summary === "string" ? c.summary : shortId(c.checkpoint_id)}</li>
                  ))}
                </ul>
              </div>
              <form className="mem-stack" onSubmit={(e) => {
                e.preventDefault();
                write(async (key) => {
                  await request("session_checkpoint", { ...current, summary }, key);
                  clearSubmittedDraft("summary", summary);
                  await open(current);
                  await list();
                });
              }}>
                <label className="mem-label" htmlFor="mem-cp">Checkpoint summary</label>
                <input id="mem-cp" className="mem-input" value={summary} disabled={busy} onChange={(e) => editDraft("summary", e.target.value)} autoComplete="off" />
                <div className="mem-actions">
                  <button type="submit" className="mem-button" disabled={!summary.trim() || busy}>Save checkpoint</button>
                </div>
              </form>
            </>
          )}
          {!detail && !answer && <div className="mem-muted">Select a session to read its transcript and checkpoints.</div>}
        </div>
      </aside>
    </section>
  );
}
