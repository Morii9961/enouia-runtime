// The connected Activity & Usage surface (ADR-028, Architecture section 13).
// Every value comes from the installed producer through the Activity client.
// The page can run, retry and pause through that package's runner and lock;
// it cannot edit sequences, delete pending data, reset the archive or touch
// the scheduled task. Activity data never enters Memory or Context.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  SOURCES, activity, describe, describeSetup, retryable,
  type Day, type Overview, type Preview, type RunStatus, type Setup, type SourceId,
} from "./client";
import { DELIVERY, FRESHNESS, LABELS, RUN_STATES, STAGES, age, calendar, dateInShanghai, exact, requiresRunConfirmation } from "./model";

type Failure = { text: string; retry?: () => void } | null;
const ACTIVE_STAGES: readonly RunStatus["stage"][] = ["queued", "running", "collecting", "persisting", "uploading", "observing"];
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

function PackageChoiceFeedback({ setup, onClear, busy = false }: { setup: Setup | null; onClear?: () => void; busy?: boolean }) {
  if (!setup || !("saved" in setup) || setup.saved !== false) return null;
  if (setup.configured === true) return <div role="status" className="mem-muted">Package connected for this window. The choice could not be verified as saved; you may need to select it again after restarting.</div>;
  return <div className="mem-stack">
    <div role="status" className="mem-muted">The saved package choice could not be cleared. It may reconnect after restarting.</div>
    {onClear && <div className="mem-actions"><button type="button" className="mem-button" disabled={busy} onClick={onClear}>Retry forgetting package</button></div>}
  </div>;
}

export function Gate({ setup, onSelect, onClear, error, busy = false }: { setup: Setup | null; onSelect: () => void; onClear?: () => void; error: string | null; busy?: boolean }) {
  return (
    <section className="mem-gate mem-stack" data-screen-label="Activity" aria-labelledby="act-connect">
      <h1 id="act-connect" className="mem-h2">Connect the installed Activity producer</h1>
      <p className="mem-muted">
        Activity &amp; Usage runs independently of this window, Memory and Context.
        Choose its installed package folder to read usage and delivery status.
        Connecting does not collect usage or enable its schedule.
      </p>
      {error && <div role="alert" className="mem-error">{error}</div>}
      <div className="mem-actions">
        <button type="button" className="mem-button mem-primary" disabled={busy} onClick={onSelect}>Choose installed package…</button>
      </div>
      <PackageChoiceFeedback setup={setup} onClear={onClear} busy={busy} />
    </section>
  );
}

export function RunStatusCard({ run }: { run: RunStatus }) {
  const state = run.summary?.state;
  const label = typeof state === "string"
    ? Object.hasOwn(RUN_STATES, state) ? RUN_STATES[state] : "Run outcome unavailable"
    : null;
  const count = run.summary?.sourceFailures;
  const sourceFailures = typeof count === "number" && Number.isInteger(count) && count >= 0 && count <= SOURCES.length ? count : null;
  return (
    <div role="status" className={`act-run${run.stage === "failed" ? " act-run-failed" : ""}`}>
      <span>{run.operation === "activity_retry_pending" ? "Retry pending" : "Run now"}: {STAGES[run.stage] ?? run.stage}</span>
      {label !== null
        ? <span>{label}</span>
        : run.error && <span className="mem-mono">{run.error.code}</span>}
      {sourceFailures !== null && sourceFailures > 0 && <span>{sourceFailures} source(s) failed · history retained</span>}
    </div>
  );
}

export function RecordedDays({ id, days, total }: { id: SourceId; days: Day[]; total: number }) {
  const [allDays, setAllDays] = useState(false);
  const shown = allDays ? days.slice().reverse() : days.slice(-14).reverse();
  const tableId = `act-days-${id}`;
  return (
    <details className="act-table">
      <summary>{allDays ? "All recorded days" : "Recent recorded days"} ({shown.length} of {total})</summary>
      {days.length > 14 && (
        <div className="mem-actions">
          <button type="button" className="mem-button" aria-expanded={allDays} aria-controls={tableId}
            onClick={() => setAllDays((current) => !current)}>
            {allDays ? "Show recent days" : "Show all recorded days"}
          </button>
        </div>
      )}
      <table>
        <caption className="mem-sr">{LABELS[id].title} daily {LABELS[id].unit}</caption>
        <thead><tr><th scope="col">Date</th><th scope="col">{LABELS[id].unit}</th></tr></thead>
        <tbody id={tableId}>
          {shown.map((day) => (
            <tr key={day.date}><th scope="row"><time dateTime={day.date}>{day.date}</time></th><td>{exact(day.value)}</td></tr>
          ))}
        </tbody>
      </table>
    </details>
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
      <RecordedDays id={id} days={days} total={summary.recordedDays} />
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

export function StatusCards({ overview, folder }: { overview: Overview; folder: string | null }) {
  const { schedule, delivery, producer, pending } = overview;
  const task = schedule.task;
  const taskText = !task ? "Unknown" : !task.registered ? "Not registered" : task.enabled === null ? "Registered · enablement unknown" : task.enabled ? "Registered · enabled" : "Registered · disabled";
  return (
    <div className="act-status">
      <section className="mem-card" aria-labelledby="act-schedule">
        <h3 id="act-schedule" className="mem-h3">Schedule</h3>
        <dl className="mem-facts">
          <dt>Mode</dt><dd>{schedule.mode}</dd>
          <dt>Task</dt><dd>{taskText}</dd>
          <dt>Next trigger</dt><dd>{schedule.nextTriggerAt ? when(schedule.nextTriggerAt) : "Not observed"}</dd>
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
          <dt>Published</dt><dd>{delivery.publicationObservedAt ? `${when(delivery.publicationObservedAt)} · ${short(delivery.publicHash)}` : delivery.publicHash ? `${short(delivery.publicHash)} · observation time not recorded` : "Not observed"}</dd>
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
  const context = useRef(0);
  const actionPending = useRef(false);

  const refresh = useCallback(async () => {
    const current = ++generation.current;
    try {
      const [o, p] = await Promise.all([activity.overview(), activity.preview()]);
      if (generation.current !== current) return;
      setOverview(o);
      setPreview(p);
      setFailure(null);
    } catch (err) {
      if (generation.current === current) {
        setOverview(null);
        setPreview(null);
        setConfirming(false);
        setCopied(null);
        setFailure({ text: describe(err), retry: retryable(err) ? () => void refresh() : undefined });
      }
    }
  }, []);

  useEffect(() => {
    let stopped = false;
    activity.setup("status").then((s) => { if (!stopped) setSetup(s); }, (err) => {
      if (!stopped) { setSetup({ configured: false }); setSetupError(describe(err)); }
    });
    return () => { stopped = true; generation.current += 1; context.current += 1; };
  }, []);

  useEffect(() => {
    if (setup?.configured !== true) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      await refresh();
      if (!stopped) timer = setTimeout(() => void poll(), 30_000);
    };
    void poll();
    return () => { stopped = true; clearTimeout(timer); generation.current += 1; };
  }, [setup, refresh]);

  // Poll a started run until it ends; the runner reports only its outcome.
  useEffect(() => {
    if (!run || !ACTIVE_STAGES.includes(run.stage)) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    let queryFailure: string | null = null;
    const poll = async () => {
      try {
        const next = await activity.run(run.runId);
        if (stopped) return;
        if (queryFailure !== null) setFailure(current => current?.text === queryFailure ? null : current);
        setRun(next);
        if (!ACTIVE_STAGES.includes(next.stage)) void refresh();
      } catch (err) {
        if (stopped) return;
        queryFailure = describe(err);
        setFailure({ text: queryFailure });
        // Retry only the read for this same run. Never repeat its mutation.
        const delay = Math.min(30_000, 1000 * 2 ** Math.min(failures++, 5));
        timer = setTimeout(() => void poll(), delay);
      }
    };
    timer = setTimeout(() => void poll(), 1000);
    return () => { stopped = true; clearTimeout(timer); };
  }, [run, refresh]);

  const replaceSetup = (s: Setup) => {
    context.current += 1;
    generation.current += 1;
    setOverview(null); setPreview(null); setFailure(null); setRun(null);
    setConfirming(false); setCopied(null); setShowPayload(false);
    setSetup(s);
  };

  const select = async () => {
    if (actionPending.current) return;
    actionPending.current = true;
    setActing(true);
    setSetupError(null);
    try {
      const s = await activity.setup("select");
      if ("cancelled" in s && s.cancelled) return;
      if (s.configured === false && s.error) setSetupError(describeSetup(s.error));
      replaceSetup(s);
    } catch (err) {
      setSetupError(describe(err));
    } finally {
      actionPending.current = false;
      setActing(false);
    }
  };

  const changePackage = async () => {
    if (actionPending.current) return;
    actionPending.current = true;
    setActing(true);
    setSetupError(null);
    try { replaceSetup(await activity.setup("clear")); }
    catch (err) { setSetupError(describe(err)); setFailure({ text: describe(err) }); }
    finally { actionPending.current = false; setActing(false); }
  };

  const act = async (action: () => Promise<{ runId: string } | { paused: boolean }>) => {
    if (actionPending.current) return;
    actionPending.current = true;
    const started = context.current;
    setActing(true);
    setFailure(null);
    try {
      const result = await action();
      if (context.current !== started) return;
      if ("runId" in result) setRun({ schemaVersion: 1, kind: "activity_run_status", runId: result.runId, stage: "running", error: null });
      else void refresh();
    } catch (err) {
      if (context.current === started) setFailure({ text: describe(err), retry: retryable(err) ? () => void act(action) : undefined });
    } finally {
      actionPending.current = false;
      if (context.current === started) setActing(false);
    }
  };

  // Only the explicit confirmation button consents to a production send.
  const delivers = requiresRunConfirmation(setup?.configured === true ? setup.mode : undefined, overview?.producer);
  const runNow = () => {
    if (delivers) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    void act(activity.runNow);
  };
  const confirmRunNow = () => {
    if (!confirming || !overview || actionPending.current) return;
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

  if (setup === null) return <section data-screen-label="Activity" className="mem-pad" aria-labelledby="act-check"><h1 id="act-check" className="qr18">Activity &amp; Usage</h1><p role="status" className="mem-muted">Checking the Activity package…</p></section>;
  if (setup.configured !== true) return <Gate setup={setup} onSelect={() => void select()} onClear={() => void changePackage()} error={setupError} busy={acting} />;

  const asOf = dateInShanghai();
  const running = run !== null && ACTIVE_STAGES.includes(run.stage);
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

      <PackageChoiceFeedback setup={setup} />

      <div className="mem-actions act-actions" role="group" aria-label="Activity actions">
        <button type="button" className="mem-button mem-primary" disabled={acting || running || !overview || paused} onClick={runNow}>Run now</button>
        <button type="button" className="mem-button" disabled={acting || running || !overview?.delivery.pendingSequence || paused} onClick={() => void act(activity.retryPending)}>Retry pending</button>
        <button type="button" className="mem-button" disabled={acting || running || !overview} onClick={() => void act(() => activity.setPaused(!paused))}>{paused ? "Resume activity sync" : "Pause activity sync"}</button>
        <button type="button" className="mem-button" onClick={() => void refresh()}>Refresh</button>
        <button type="button" className="mem-button" disabled={!overview} onClick={() => void copySummary()}>Copy diagnostic summary</button>
        <button type="button" className="mem-link" disabled={acting || running} onClick={() => void changePackage()}>Change package</button>
        {copied && <span className="mem-muted" role="status">{copied}</span>}
      </div>
      {confirming && (
        <div role="alert" className="act-confirm">
          <span>Run now collects GitHub, Codex and Claude usage. The installed production package may send the batch to Moriium's public About data.</span>
          <button type="button" className="mem-button mem-primary" disabled={acting || running || !overview || paused} onClick={confirmRunNow}>Collect and send</button>
          <button type="button" className="mem-button" onClick={() => setConfirming(false)}>Cancel</button>
        </div>
      )}

      {run && <RunStatusCard run={run} />}
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
