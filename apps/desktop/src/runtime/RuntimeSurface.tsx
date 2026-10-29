// Native Inspector: observations through the existing host facades only.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { shell, describe, type J } from "../memory/client";
import { ComponentList, exiting, useStatus, vaultLabel } from "../memory/status";
import { when } from "../memory/ui";
import { WorkspaceOperations } from "./WorkspaceOperations";

import { t } from '../i18n/index.ts';
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

function Fact({ name, children }: { name: string; children: ReactNode }) {
  return <div className="qr199"><span className="qr35">{name}</span><span className="qr180">{children}</span></div>;
}

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
      }}>{t("Read {what} again", { what: label })}</button>
      <span role="status" className="mem-muted">{busy ? t("Reading {what}…", { what: label }) : error ? t("Status unavailable") : observedAt ? t("Observed {when}", { when: when(observedAt) }) : t("Status unknown")}</span>
    </div>
    {error && <p role="alert" className="mem-error">{error}</p>}
  </>;
}

export default function RuntimeSurface() {
  const { status, error, vaultChanging, refresh } = useStatus();
  const host = useSnapshot<J>(shell.lifecycleStatus, describe);
  const hostStatus = host.snapshot?.value;
  const open = status?.vault?.state === "open" && !vaultChanging && !exiting(status);
  return <section data-screen-label="Runtime Inspector" className="qr210">
    <aside className="qr191">
      <div className="qr20"><h1 className="qr18">{t("Runtime")}</h1><div className="qr101">{t("Observed component status")}</div></div>
      <p className="mem-muted">{t("Memory and the Windows shell keep their own status. Each observation describes its own component.")}</p>
      <p className="mem-muted">{t("Memory refreshes every few seconds. The shell shows its last explicit read; read it again after a change.")}</p>
    </aside>
    <div className="qr209"><div className="qr208">
      <section className="mem-stack" aria-labelledby="runtime-memory-title">
        <h2 id="runtime-memory-title" className="qr194">{t("Memory Core")}</h2>
        <p role="status" className="mem-muted">{vaultLabel(status, vaultChanging)}</p>
        <button type="button" className="mem-button" onClick={() => void refresh()}>{t("Read Memory status again")}</button>
        {error && <p role="alert" className="mem-error">{error.text}</p>}
        {status && !exiting(status) && !vaultChanging && <>
          <ComponentList status={status} />
          {open && <>
            <Fact name={t("Vault")}>{status.vault.rootName}</Fact>
            <Fact name={t("Latest commit")}>#{status.vault.headSequence} · {when(status.vault.lastCommitAt)}</Fact>
            <Fact name={t("Running operations")}>{status.operationsRunning ?? "unknown"}</Fact>
            <Fact name={t("Pending candidates")}>{status.pendingCandidates ?? "unknown"}</Fact>
          </>}
        </>}
      </section>
      {open && typeof status.vault.vaultId === "string" && status.vault.vaultId.length > 0 && <WorkspaceOperations key={status.vault.vaultId} />}
      <section className="mem-stack" aria-labelledby="runtime-shell-title">
        <h2 id="runtime-shell-title" className="qr194">{t("Windows shell")}</h2>
        <ReadStatus {...host} observedAt={host.snapshot?.observedAt} label={t("shell status")} />
        {hostStatus && <>
          <Fact name={t("Lifecycle")}>{hostStatus.closing ? t("Exiting, finishing operations") : hostStatus.locking ? t("Finishing Vault lock") : hostStatus.vaultChanging ? t("Finishing Vault change") : t("Running")}</Fact>
          <Fact name={t("System tray")}>{hostStatus.tray ?? "unknown"}</Fact>
          <Fact name={t("Quick Search")}>{hostStatus.hotkey?.state ?? "unknown"}{hostStatus.hotkey?.combo ? ` · ${hostStatus.hotkey.combo}` : ""}</Fact>
          <Fact name={t("Main window")}>{hostStatus.visible == null ? "unknown" : hostStatus.visible ? "visible" : "hidden"}</Fact>
          {hostStatus.error && <Fact name={t("Last shell error")}>{hostStatus.error}</Fact>}
          {hostStatus.vaultAdmissionError && <Fact name={t("Vault admission")}>{hostStatus.vaultAdmissionError}</Fact>}
        </>}
      </section>
    </div></div>
  </section>;
}
