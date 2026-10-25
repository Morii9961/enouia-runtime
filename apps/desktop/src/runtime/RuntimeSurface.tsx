// Native Inspector: observations through the existing host facades only.
// Activity is read independently; none of its state enters Memory or Context.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { activity, describe as activityError, describeSetup, type Overview, type Setup } from "../activity/client";
import { shell, describe, type J } from "../memory/client";
import { ComponentList, exiting, useStatus, vaultLabel } from "../memory/status";
import { when } from "../memory/ui";
import { WorkspaceOperations } from "./WorkspaceOperations";

type Snapshot<T> = { value: T; observedAt: string };

// One read at a time. Failed reads clear the previous observation, and an
// unmounted page cannot publish a late reply. This page has no action/retry keys.
function useSnapshot<T>(read: () => Promise<T>, message: (error: unknown) => string) {
  const [snapshot, setSnapshot] = useState<Snapshot<T> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const pending = useRef(false);
  const refresh = useCallback(async () => {
    if (pending.current) return;
    const current = ++generation.current;
    pending.current = true;
    setBusy(true);
    setError(null);
    setSnapshot(null);
    try {
      const value = await read();
      if (current === generation.current) setSnapshot({ value, observedAt: new Date().toISOString() });
    } catch (error) {
      if (current === generation.current) setError(message(error));
    } finally {
      if (current === generation.current) { pending.current = false; setBusy(false); }
    }
  }, [read, message]);
  useEffect(() => {
    void refresh();
    return () => { generation.current += 1; pending.current = false; };
  }, [refresh]);
  return { snapshot, error, busy, refresh };
}

type ActivityObservation = { setup: Setup; overview: Overview | null };
async function readActivity(): Promise<ActivityObservation> {
  const setup = await activity.setup("status");
  return { setup, overview: setup.configured ? await activity.overview() : null };
}

function Fact({ name, children }: { name: string; children: ReactNode }) {
  return <div className="qr199"><span className="qr35">{name}</span><span className="qr180">{children}</span></div>;
}

const activityTime = (value: string | null) => value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : when(value);

function ReadStatus({ busy, error, observedAt, refresh, label }: {
  busy: boolean; error: string | null; observedAt?: string; refresh: () => unknown; label: string;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  useEffect(() => {
    if (busy || !returnFocus.current) return;
    returnFocus.current = false;
    if (document.activeElement === document.body) button.current?.focus();
  }, [busy]);
  return <>
    <div className="mem-actions">
      <button ref={button} type="button" className="mem-button" disabled={busy} onClick={() => {
        returnFocus.current = document.activeElement === button.current;
        void refresh();
      }}>Read {label} again</button>
      <span role="status" className="mem-muted">{busy ? `Reading ${label}…` : error ? "Status unavailable" : observedAt ? `Observed ${when(observedAt)}` : "Status unknown"}</span>
    </div>
    {error && <p role="alert" className="mem-error">{error}</p>}
  </>;
}

export default function RuntimeSurface() {
  const { status, error, vaultChanging, refresh } = useStatus();
  const host = useSnapshot<J>(shell.lifecycleStatus, describe);
  const producer = useSnapshot(readActivity, activityError);
  const hostStatus = host.snapshot?.value;
  const observation = producer.snapshot?.value;
  const overview = observation?.overview;
  const open = status?.vault?.state === "open" && !vaultChanging && !exiting(status);
  return <section data-screen-label="Runtime Inspector" className="qr210">
    <aside className="qr191">
      <div className="qr20"><h1 className="qr18">Runtime</h1><div className="qr101">Observed component status</div></div>
      <p className="mem-muted">Memory, Windows shell and Activity keep their own status. Each observation describes its own component.</p>
      <p className="mem-muted">Memory refreshes every few seconds. Shell and Activity show their last explicit read; read them again after a change.</p>
    </aside>
    <div className="qr209"><div className="qr208">
      <section className="mem-stack" aria-labelledby="runtime-memory-title">
        <h2 id="runtime-memory-title" className="qr194">Memory Core</h2>
        <p role="status" className="mem-muted">{vaultLabel(status, vaultChanging)}</p>
        <button type="button" className="mem-button" onClick={() => void refresh()}>Read Memory status again</button>
        {error && <p role="alert" className="mem-error">{error.text}</p>}
        {status && !exiting(status) && !vaultChanging && <>
          <ComponentList status={status} />
          {open && <>
            <Fact name="Vault">{status.vault.rootName}</Fact>
            <Fact name="Latest commit">#{status.vault.headSequence} · {when(status.vault.lastCommitAt)}</Fact>
            <Fact name="Running operations">{status.operationsRunning ?? "unknown"}</Fact>
            <Fact name="Pending candidates">{status.pendingCandidates ?? "unknown"}</Fact>
          </>}
        </>}
      </section>
      {open && typeof status.vault.vaultId === "string" && status.vault.vaultId.length > 0 && <WorkspaceOperations key={status.vault.vaultId} />}
      <section className="mem-stack" aria-labelledby="runtime-shell-title">
        <h2 id="runtime-shell-title" className="qr194">Windows shell</h2>
        <ReadStatus {...host} observedAt={host.snapshot?.observedAt} label="shell status" />
        {hostStatus && <>
          <Fact name="Lifecycle">{hostStatus.closing ? "Exiting, finishing operations" : hostStatus.locking ? "Finishing Vault lock" : hostStatus.vaultChanging ? "Finishing Vault change" : "Running"}</Fact>
          <Fact name="System tray">{hostStatus.tray ?? "unknown"}</Fact>
          <Fact name="Quick Search">{hostStatus.hotkey?.state ?? "unknown"}{hostStatus.hotkey?.combo ? ` · ${hostStatus.hotkey.combo}` : ""}</Fact>
          <Fact name="Main window">{hostStatus.visible == null ? "unknown" : hostStatus.visible ? "visible" : "hidden"}</Fact>
          {hostStatus.error && <Fact name="Last shell error">{hostStatus.error}</Fact>}
          {hostStatus.vaultAdmissionError && <Fact name="Vault admission">{hostStatus.vaultAdmissionError}</Fact>}
        </>}
      </section>
      <section className="mem-stack" aria-labelledby="runtime-activity-title">
        <h2 id="runtime-activity-title" className="qr194">Activity producer</h2>
        <p className="mem-muted">The installed producer runs independently of Memory and this window.</p>
        <ReadStatus {...producer} observedAt={producer.snapshot?.observedAt} label="Activity status" />
        {observation?.setup.configured === false && <p className="mem-muted">{observation.setup.error ? describeSetup(observation.setup.error) : "No Activity package connected. Connect one from Activity."}</p>}
        {overview && <>
          <Fact name="Producer mode">{overview.producer?.mode ?? "unknown"}</Fact>
          <Fact name="Schedule mode">{overview.schedule.mode}</Fact>
          <Fact name="Scheduled task">{!overview.schedule.task ? "unknown" : !overview.schedule.task.registered ? "not registered" : overview.schedule.task.enabled == null ? "registered · enabled state unknown" : overview.schedule.task.enabled ? "registered · enabled" : "registered · disabled"}</Fact>
          <Fact name="Next trigger">{activityTime(overview.schedule.nextTriggerAt)}</Fact>
          <Fact name="Delivery">{overview.delivery.state}</Fact>
          <Fact name="Pending sequence">{overview.delivery.pendingSequence ?? "none"}</Fact>
          <Fact name="Publication observed">{activityTime(overview.delivery.publicationObservedAt)}</Fact>
          <ul className="mem-components">{overview.health.filter(c => c.id.startsWith("activity_")).map(c => <li key={c.id}>
            <span className="mem-mono">{c.id}</span><span>{c.state}</span><span className="mem-muted">{c.mode}</span>
          </li>)}</ul>
        </>}
      </section>
    </div></div>
  </section>;
}
