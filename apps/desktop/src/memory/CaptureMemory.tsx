import { useCallback, useEffect, useRef, useState } from "react";
import { captureCall, settled, type CaptureCorrection, type CaptureJobs, type CapturePage, type CapturePreflight, type CaptureStatus, type CaptureWrite } from "./capture";
import { describe } from "./client";
import { useLatestRead } from "./hooks";
import { ErrorBox, Tag, shortId } from "./ui";
import { labels, msg, t } from "../i18n";

const JOB = labels({
  queued: msg("Queued"), dispatched: msg("Analysing"), forming: msg("Forming"), formed: msg("Formed"),
  no_memory: msg("No memory"), rejected: msg("Rejected"), analysis_unknown: msg("Analysis outcome unknown"),
});
type Exchange = { preview?: CapturePreflight; written?: CaptureWrite; jobs?: CaptureJobs; corrected?: CaptureCorrection; error?: unknown; sending?: boolean };
const revisions = (page: CapturePage | null) => page?.items.reduce((sum, item) => sum + item.base.memory.revision, 0) ?? 0;

export function CaptureMemory({ call = captureCall }: { call?: typeof captureCall }) {
  const [status, setStatus] = useState<CaptureStatus | null>(null);
  const [statusError, setStatusError] = useState<unknown>(null);
  const [exchanges, setExchanges] = useState<Record<number, Exchange>>({});
  const [page, setPage] = useState<CapturePage | null>(null);
  const reads = useLatestRead();
  // Revision total observed when a correction report was saved; the panel
  // rereads the formed list until Memory's worker writes a newer revision.
  const [awaiting, setAwaiting] = useState<{ before: number; left: number } | null>(null);
  const controlling = useRef(false);
  const update = (n: number, change: Exchange) => setExchanges(all => ({ ...all, [n]: { ...all[n], ...change } }));
  const open = status?.state === "open";
  const loadPage = useCallback(() => reads.run(() => call({ operation: "page", cursor: null, limit: 32 }), setPage, () => setPage(null)), [call, reads.run]);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        if (controlling.current) return;
        const next = await call({ operation: "status" });
        if (stopped || controlling.current) return;
        setStatus(next); setStatusError(null);
        if (next.state !== "open") setPage(null);
      } catch (cause) {
        // A busy status only means another native call held the entry; keep
        // what was already observed and read again on the next poll.
        if (!stopped && !controlling.current) { setStatusError(cause); if (cause !== "capture_busy") setStatus(null); }
      } finally { if (!stopped) timer = setTimeout(poll, 1500); }
    };
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [call]);
  useEffect(() => { if (open) void loadPage(); }, [open, loadPage]);
  // Job status is a read: poll written conversations until Memory settles
  // them. Each observation schedules the next one; writes are never repeated.
  useEffect(() => {
    const waiting = Object.entries(exchanges).filter(([, e]) => e.written && !e.sending && !(e.jobs && settled(e.jobs.jobs))).map(([n]) => Number(n));
    if (!open || waiting.length === 0) return;
    let stopped = false;
    const timer = setTimeout(async () => {
      let changed = false;
      for (const n of waiting) {
        try {
          const jobs = await call({ operation: "jobs", exchange: n });
          if (stopped) return;
          update(n, { jobs, error: undefined });
          changed ||= settled(jobs.jobs);
        } catch (error) { if (!stopped) update(n, { error }); }
      }
      if (changed && !stopped) void loadPage();
    }, 600);
    return () => { stopped = true; clearTimeout(timer); };
  }, [open, exchanges, call, loadPage]);
  useEffect(() => {
    if (!open || !awaiting) return;
    if (revisions(page) > awaiting.before || awaiting.left <= 0) { setAwaiting(null); return; }
    const timer = setTimeout(() => { setAwaiting(a => a && { ...a, left: a.left - 1 }); void loadPage(); }, 800);
    return () => clearTimeout(timer);
  }, [open, awaiting, page, loadPage]);
  const correct = async (n: number) => {
    if (exchanges[n]?.sending) return;
    update(n, { sending: true, error: undefined });
    try {
      // Saving the report is the whole effect; Memory's worker decides any revision.
      const corrected = await call({ operation: "correct" });
      update(n, { corrected });
      setAwaiting({ before: revisions(page), left: 30 });
    } catch (error) { update(n, { error }); }
    finally { update(n, { sending: false }); }
  };
  const send = async (n: number, operation: "preflight" | "write") => {
    if (exchanges[n]?.sending) return;
    update(n, { sending: true, error: undefined });
    try {
      // One native call per click. An unknown result is never resent here.
      if (operation === "preflight") update(n, { preview: await call({ operation, exchange: n }) });
      else update(n, { written: await call({ operation, exchange: n }), jobs: undefined });
    } catch (error) { update(n, { error }); }
    finally { update(n, { sending: false }); }
  };
  // Both controls are explicit owner actions, sent once each.
  const control = async (operation: "lock" | "renew") => {
    if (controlling.current) return;
    controlling.current = true;
    if (operation === "lock") setPage(null);
    try { setStatus(await call({ operation })); setStatusError(null); }
    catch (cause) { setStatusError(cause); }
    finally { controlling.current = false; }
  };
  return <>
    <div className="qr45" aria-busy={reads.busy}>
      <div className="qr31"><h2 className="qr29">{t("Synthetic Runtime capture")}</h2><Tag tone="warn">{t("Isolated synthetic Owner root")}</Tag></div>
      <div className="qr44 mem-pad">
        <p className="mem-content">{t("Runtime captures fixed fictional conversations into a fresh Owner root. Memory's background worker forms memories from the user turns and applies a synthetic Agent's correction report. No model, Provider or personal data is used.")}</p>
        {statusError != null && <p role="alert">{describe(statusError)}</p>}
        <p role="status">{status ? t("Capture: {state}", { state: status.state }) : statusError != null ? t("Capture state is unknown.") : t("Reading capture state…")}</p>
        {status?.state === "disabled" && <p className="mem-content">{t("No synthetic capture is enabled in this session.")}</p>}
        {status?.state === "failed" && <p className="mem-content">{t("The synthetic capture is unavailable. Start a new synthetic session to recover.")}</p>}
        {status?.state === "expired" && <p className="mem-content">{t("This capture enrollment has expired. Renew it to capture again.")}</p>}
        {status?.state === "locked" && <p className="mem-content">{t("Capture enrollment ended for this session.")}</p>}
        {status && status.state !== "disabled" && <ol className="mem-list">{status.conversations.map(c => {
          const e = exchanges[c.exchange] ?? {};
          return <li key={c.exchange}>
            <h3 className="mem-content">{t("Conversation {n}", { n: c.exchange + 1 })}</h3>
            {c.corrects !== null && <p className="mem-row-meta">{t("Corrects conversation {n}", { n: c.corrects + 1 })}</p>}
            <p className="mem-content" lang={c.content_lang}><span className="mem-label">{t("User")}</span> {c.user}</p>
            <p className="mem-content" lang={c.content_lang}><span className="mem-label">{t("Assistant")}</span> {c.assistant}</p>
            <div className="mem-actions">
              <button className="mem-button" disabled={!open || e.sending} onClick={() => void send(c.exchange, "preflight")}>{t("Preview capture")}</button>
              <button className="mem-button" disabled={!open || e.sending} onClick={() => void send(c.exchange, "write")}>{t("Capture conversation")}</button>
              {c.corrects !== null && <button className="mem-button" disabled={!open || e.sending} onClick={() => void correct(c.exchange)}>{t("Send synthetic correction report")}</button>}
            </div>
            {e.sending && <p role="status">{t("Sending to Memory…")}</p>}
            {e.error != null && <p role="alert">{describe(e.error)}</p>}
            {e.preview && <p className="mem-content">{t(e.preview.capture.replayed ? "Preview: this conversation is already captured." : "Preview: this conversation is not captured yet. Nothing was queued.")}</p>}
            {e.written && <p className="mem-content">{e.written.queue_error ? t("Captured, but queueing was refused: {error}", { error: describe(e.written.queue_error) })
              : t(e.written.capture.replayed ? "Already captured. Memory returned the original receipt." : "Captured and queued for formation.")}</p>}
            {e.corrected && <p className="mem-content">{t("Correction report saved. Memory's worker decides any revision on its own.")}</p>}
            {e.jobs && <ul className="mem-list">{e.jobs.jobs.map(j => <li key={j.job_key} className="mem-row-meta">
              {t("{state} · {receipts} memories", { state: JOB[j.state], receipts: j.receipts })}</li>)}</ul>}
          </li>;
        })}</ol>}
        {(open || status?.state === "expired") && <div className="mem-actions">
          <button className="mem-button" onClick={() => void control("renew")}>{t("Renew capture enrollment")}</button>
          {open && <button className="mem-button" onClick={() => void control("lock")}>{t("End capture enrollment")}</button>}
        </div>}
        <h3 className="qr29">{t("Formed memories")}</h3>
        <ErrorBox error={reads.error} />
        {open && <button className="mem-button" disabled={reads.busy} onClick={() => void loadPage()}>{t("Refresh formed memories")}</button>}
        {open && page && <>
          <p className="mem-content">{t("{count} memories formed in this root", { count: page.matched_in_scope })}</p>
          <ul className="mem-list">{page.items.map(item => <li key={`${item.base.memory.memory_id}:${item.base.memory.revision}`}>
            <h3 className="mem-content" lang={item.content_lang}>{item.title}</h3><p className="mem-content" lang={item.content_lang}>{item.base.content}</p>
            <p className="mem-row-meta">{shortId(item.base.memory.memory_id)} · r{item.base.memory.revision} · {item.content_lang}</p>
          </li>)}</ul>
          {page.items.length === 0 && <p className="mem-content">{t("No memory has been formed yet.")}</p>}
        </>}
      </div>
    </div>
    <aside className="qr88" aria-label={t("Automatic Memory Inspector")}><div className="qr79">
      <p className="mem-content">{t("Job status shows states and counts only, never conversation text.")}</p>
      <p className="mem-content">{t("System formation preserves what the synthetic subject said. It is not independent verification or Owner confirmation.")}</p>
    </div></aside>
  </>;
}
