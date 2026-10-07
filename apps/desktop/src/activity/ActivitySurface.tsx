// The connected Activity & Usage surface (ADR-028, Architecture section 13).
// Every value comes from the installed producer through the Activity client.
// The page can run, retry and pause through that package's runner and lock;
// it cannot edit sequences, delete pending data, reset the archive or touch
// the scheduled task. Activity data never enters Memory or Context.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  SOURCES, activity, describe, describeSetup, retryable,
  type Overview, type Preview, type RunStatus, type Setup, type SourceId,
} from "./client";
import { DELIVERY, FRESHNESS, LABELS, RUN_STATES, STAGES, age, calendar, dateInShanghai, exact } from "./model";

type Failure = { text: string; retry?: () => void } | null;
const when = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const short = (hash: string | null | undefined) => (hash ? `${hash.slice(0, 12)}…` : "—");

function Tag({ tone, children }: { tone?: "ok" | "warn" | "muted"; children: ReactNode }) {
  return <span className={`mem-tag${tone ? ` mem-tag-${tone}` : ""}`}>{children}</span>;
}

function Gate({ setup, onSelect, error }: { setup: Setup | null; onSelect: () => void; error: string | null }) {
  return (
    <div className="mem-gate mem-stack">
      <h2 className="mem-h2">Connect the installed Activity producer</h2>
      <p className="mem-muted">
        Activity & Usage runs as its own installed package, independent of this window, Memory and Context. Choose the
        folder created by <span className="mem-mono">install-activity.ps1</span>. The shell checks its
        <span className="mem-mono"> install.json</span> and runner hash, and only ever starts that runner.
      </p>
      {error && <div role="alert" className="mem-error">{error}</div>}
      <div className="mem-actions">
        <button type="button" className="mem-button mem-primary" onClick={onSelect}>Choose installed package…</button>
        {setup?.configured === false && setup.saved === false && <span className="mem-muted">The choice could not be saved.</span>}
      </div>
    </div>
  );
}

function Heatmap({ id, preview, overview, asOf }: { id: SourceId; preview: Preview | null; overview: Overview; asOf: string }) {
  const summary = overview.sources[id];
  const days = preview?.data.sources[id]?.days ?? [];
  const columns = calendar(days, summary, asOf, 53, id === "claude");
  const unit = LABELS[id].unit;
  const label = (c: { date: string; value: number | null; state: string; incomplete: boolean }) =>
    c.state === "known" ? `${c.date}: ${exact(c.value ?? 0)} ${unit}${c.incomplete ? " (current day, may still grow)" : ""}`
      : c.state === "missing" ? `${c.date}: not recorded` : c.date;
  const recent = days.slice(-14).reverse();
  return (
    <div className="act-chart">
      <div className="act-grid" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${columns.length}, 10px)` }}>
        {columns.map((column, w) => (
          <div key={w} className="act-week">
            {column.map((c) => (
              <span key={c.date} title={label(c)}
                className={`act-cell act-${c.state}${c.incomplete ? " act-incomplete" : ""}`} data-level={c.level} />
            ))}
          </div>
        ))}
      </div>
      <div className="act-legend" aria-hidden="true">
        <span><i className="act-cell act-known" data-level="0" /> 0</span>
        <span><i className="act-cell act-known" data-level="2" /> more</span>
        <span><i className="act-cell act-missing" /> not recorded</span>
        <span><i className="act-cell act-known act-incomplete" data-level="1" /> current day</span>
      </div>
      <details className="act-table">
        <summary>Recent recorded days ({recent.length} of {summary.recordedDays})</summary>
        <table>
          <caption className="mem-sr">{LABELS[id].title} daily {unit}</caption>
          <thead><tr><th scope="col">Date</th><th scope="col">{unit}</th></tr></thead>
          <tbody>
            {recent.map((d) => (
              <tr key={d.date}><th scope="row"><time dateTime={d.date}>{d.date}</time></th><td>{exact(d.value)}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

function SourceCard({ id, overview, preview, asOf }: { id: SourceId; overview: Overview; preview: Preview | null; asOf: string }) {
  const s = overview.sources[id];
  const fresh = FRESHNESS[s.freshness];
  return (
    <section className="mem-card act-source" aria-labelledby={`act-${id}`}>
      <header className="act-source-head">
        <h3 id={`act-${id}`} className="mem-h3">{LABELS[id].title}</h3>
        <Tag tone={fresh.tone}>{fresh.text}</Tag>
      </header>
      <p className="mem-muted">{s.metric} · {LABELS[id].boundary}</p>
      <dl className="mem-facts">
        <dt>Total</dt><dd>{exact(s.total)} {s.metric}</dd>
        <dt>Recorded days</dt><dd>{s.recordedDays}{s.firstDate ? ` · ${s.firstDate} – ${s.lastDate}` : ""}</dd>
        <dt>Last success</dt><dd>{when(s.lastSuccessAt)}{age(s.lastSuccessAt) ? ` · ${age(s.lastSuccessAt)}` : ""}</dd>
        <dt>Last attempt</dt><dd>{when(s.lastAttemptAt)} · {s.lastResult}</dd>
      </dl>
      <Heatmap id={id} overview={overview} preview={preview} asOf={asOf} />
    </section>
  );
}

function StatusCards({ overview, folder }: { overview: Overview; folder: string | null }) {
  const { schedule, delivery, producer, pending } = overview;
  const task = schedule.task;
  const taskText = !task ? "Unknown" : !task.registered ? "Not registered" : task.enabled ? "Registered · enabled" : "Registered · disabled";
  return (
    <div className="act-status">
      <section className="mem-card" aria-labelledby="act-schedule">
        <h3 id="act-schedule" className="mem-h3">Schedule</h3>
        <dl className="mem-facts">
          <dt>Mode</dt><dd>{schedule.mode}</dd>
          <dt>Task</dt><dd>{taskText}</dd>
          <dt>Next trigger</dt><dd>{schedule.nextTriggerAt ? when(schedule.nextTriggerAt) : "Hourly while logged in"}</dd>
          <dt>Package</dt><dd>{folder ?? "—"} · {producer?.mode ?? "—"}</dd>
        </dl>
        <p className="mem-muted">Runs only while you are signed in. Pausing here is durable Activity state, separate from the task.</p>
      </section>
      <section className="mem-card" aria-labelledby="act-delivery">
        <h3 id="act-delivery" className="mem-h3">Delivery</h3>
        <dl className="mem-facts">
          <dt>State</dt><dd>{DELIVERY[delivery.state] ?? delivery.state}</dd>
          <dt>Pending</dt><dd>{pending ? `#${pending.sequence} · ${age(pending.createdAt) ?? "—"} · ${pending.failureCount} failed attempt(s)` : "None"}</dd>
          {pending?.nextEligibleAt && <><dt>Next retry</dt><dd>{when(pending.nextEligibleAt)}</dd></>}
          {pending?.lastErrorCode && <><dt>Last error</dt><dd className="mem-mono">{pending.lastErrorCode}</dd></>}
          <dt>Last transport</dt><dd>{when(delivery.lastTransportAt)}</dd>
          <dt>Published</dt><dd>{delivery.publicationObservedAt ? `${when(delivery.publicationObservedAt)} · ${short(delivery.publicHash)}` : "Not observed"}</dd>
          <dt>Reserved</dt><dd>{producer ? `sequence ${producer.highestReserved}` : "—"}{producer && !producer.deliveryEnabled ? " · delivery disabled" : ""}</dd>
        </dl>
        <p className="mem-muted">A completed transfer is not publication: pending clears only after the public data is observed.</p>
      </section>
    </div>
  );
}

export default function ActivitySurface() {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [failure, setFailure] = useState<Failure>(null);
  const [run, setRun] = useState<RunStatus | null>(null);
  const [acting, setActing] = useState(false);
  const [showPayload, setShowPayload] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const generation = useRef(0);

  const refresh = useCallback(async () => {
    const current = ++generation.current;
    try {
      const [o, p] = await Promise.all([activity.overview(), activity.preview()]);
      if (generation.current !== current) return;
      setOverview(o);
      setPreview(p);
      setFailure(null);
    } catch (err) {
      if (generation.current === current) setFailure({ text: describe(err), retry: retryable(err) ? () => void refresh() : undefined });
    }
  }, []);

  useEffect(() => {
    let stopped = false;
    activity.setup("status").then((s) => { if (!stopped) setSetup(s); }, () => { if (!stopped) setSetup({ configured: false }); });
    return () => { stopped = true; generation.current += 1; };
  }, []);

  useEffect(() => {
    if (setup?.configured !== true) return;
    void refresh();
    const timer = setInterval(() => void refresh(), 30_000);
    return () => clearInterval(timer);
  }, [setup, refresh]);

  // Poll a started run until it ends; the runner reports only its outcome.
  useEffect(() => {
    if (!run || !["queued", "running"].includes(run.stage)) return;
    const timer = setTimeout(async () => {
      try {
        const next = await activity.run(run.runId);
        setRun(next);
        if (!["queued", "running"].includes(next.stage)) void refresh();
      } catch (err) {
        setFailure({ text: describe(err) });
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [run, refresh]);

  const select = async () => {
    setSetupError(null);
    try {
      const s = await activity.setup("select");
      if ("cancelled" in s && s.cancelled) return;
      if (s.configured === false && s.error) setSetupError(describeSetup(s.error));
      setSetup(s);
    } catch (err) {
      setSetupError(describe(err));
    }
  };

  const act = async (action: () => Promise<{ runId: string } | { paused: boolean }>) => {
    setActing(true);
    setFailure(null);
    try {
      const result = await action();
      if ("runId" in result) setRun({ schemaVersion: 1, kind: "activity_run_status", runId: result.runId, stage: "running", error: null });
      else void refresh();
    } catch (err) {
      setFailure({ text: describe(err), retry: retryable(err) ? () => void act(action) : undefined });
    } finally {
      setActing(false);
    }
  };

  // A production run with delivery enabled publishes; ask once, inline.
  const delivers = overview?.producer?.mode === "production" && overview.producer.deliveryEnabled === true;
  const runNow = () => {
    if (delivers && !confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    void act(activity.runNow);
  };

  const copySummary = async () => {
    if (!overview) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(overview, null, 2));
      setCopied("Sanitized summary copied");
    } catch {
      setCopied("Copy failed");
    }
  };

  if (setup === null) return <div className="mem-pad mem-muted">Checking the Activity package…</div>;
  if (setup.configured !== true) return <Gate setup={setup} onSelect={() => void select()} error={setupError} />;

  const asOf = dateInShanghai();
  const running = run !== null && ["queued", "running"].includes(run.stage);
  const paused = overview?.producer?.paused ?? overview?.schedule.mode === "paused";
  return (
    <section className="act-surface" data-screen-label="Activity" aria-labelledby="act-title">
      <header className="act-head">
        <div>
          <h1 id="act-title" className="qr18">Activity &amp; Usage</h1>
          <div className="qr19">The local producer behind Moriium's About page. Independent of Memory and Context.</div>
        </div>
        <div className="act-badges">
          <Tag tone={setup.mode === "production" ? "warn" : "muted"}>{setup.mode}</Tag>
          {overview?.generatedAt && <span className="mem-muted">Updated {when(overview.generatedAt)}</span>}
        </div>
      </header>

      <div className="mem-actions act-actions" role="group" aria-label="Activity actions">
        <button type="button" className="mem-button mem-primary" disabled={acting || running || !overview || paused} onClick={runNow}>Run now</button>
        <button type="button" className="mem-button" disabled={acting || running || !overview?.delivery.pendingSequence || paused} onClick={() => void act(activity.retryPending)}>Retry pending</button>
        <button type="button" className="mem-button" disabled={acting || running || !overview} onClick={() => void act(() => activity.setPaused(!paused))}>{paused ? "Resume activity sync" : "Pause activity sync"}</button>
        <button type="button" className="mem-button" disabled={!overview} onClick={() => void refresh()}>Refresh</button>
        <button type="button" className="mem-button" disabled={!overview} onClick={() => void copySummary()}>Copy diagnostic summary</button>
        <button type="button" className="mem-link" onClick={() => void activity.setup("clear").then(setSetup)}>Change package</button>
        {copied && <span className="mem-muted" role="status">{copied}</span>}
      </div>
      {confirming && (
        <div role="alert" className="act-confirm">
          <span>Run now collects GitHub, Codex and Claude usage and sends the new batch to Moriium's public About data.</span>
          <button type="button" className="mem-button mem-primary" onClick={runNow}>Collect and send</button>
          <button type="button" className="mem-button" onClick={() => setConfirming(false)}>Cancel</button>
        </div>
      )}

      {run && (
        <div role="status" className={`act-run${run.stage === "failed" ? " act-run-failed" : ""}`}>
          <span>{run.operation === "activity_retry_pending" ? "Retry pending" : "Run now"}: {STAGES[run.stage] ?? run.stage}</span>
          {typeof run.summary?.state === "string"
            ? <span>{RUN_STATES[run.summary.state] ?? run.summary.state}</span>
            : run.error && <span className="mem-mono">{run.error.code}</span>}
          {typeof run.summary?.sourceFailures === "number" && run.summary.sourceFailures > 0 && <span>{run.summary.sourceFailures} source(s) failed · history retained</span>}
        </div>
      )}
      {failure && (
        <div role="alert" className="mem-error">
          <span>{failure.text}</span>
          {failure.retry && <button type="button" className="mem-button" onClick={failure.retry}>Retry</button>}
        </div>
      )}

      {overview ? (
        <>
          <StatusCards overview={overview} folder={setup.folder} />
          <div className="act-sources">
            {SOURCES.map((id) => <SourceCard key={id} id={id} overview={overview} preview={preview} asOf={asOf} />)}
          </div>
          <details className="mem-card act-payload" onToggle={(e) => setShowPayload((e.target as HTMLDetailsElement).open)}>
            <summary>Public payload preview · {short(preview?.sha256)}</summary>
            <p className="mem-muted">The exact allowlisted data the next send carries. Read-only.</p>
            {showPayload && preview && <pre className="mem-mono act-json">{JSON.stringify(preview.data, null, 2)}</pre>}
          </details>
        </>
      ) : (
        !failure && <div className="mem-pad mem-muted">Reading the Activity store…</div>
      )}
      <p className="mem-muted act-foot">No combined AI total is shown: each source keeps its own unit and day boundary.</p>
    </section>
  );
}
