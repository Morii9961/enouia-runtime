// Memory status shared by the connected surfaces: one serial poll of
// `workspace_status`, the header badge, the Home and Settings panels, and the
// gate that keeps Vault-dependent surfaces closed until a Vault is open.
import { lazy, Suspense, createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { call, pick, shell, type J } from "./client";
import { useAction, useLatestRead, useMemoryStatus, type Failure } from "./hooks";
import { ErrorBox, Operation, Tag, when } from "./ui";
import VaultAdmissionNotice from '../shell/VaultAdmissionNotice';

import { labels, msg, t, tj, tn } from '../i18n/index.ts';
const ProviderConfigDraft = lazy(() => import("./ProviderConfigDraft").then(module => ({ default: module.ProviderConfigDraft })));
const ProviderSettingsStatus = lazy(() => import("./ProviderSettingsStatus").then(module => ({ default: module.ProviderSettingsStatus })));

type StatusValue = { status: J; vaultChanging: boolean; error: Failure; refresh: () => Promise<void> };
const StatusContext = createContext<StatusValue | null>(null);

export function MemoryStatusProvider({ children }: { children: ReactNode }) {
  const value = useMemoryStatus();
  return <StatusContext.Provider value={value}>{children}</StatusContext.Provider>;
}

export function useStatus(): StatusValue {
  const value = useContext(StatusContext);
  if (!value) throw new Error("MemoryStatusProvider is missing");
  return value;
}

const VAULT: Record<string, string> = labels({ open: msg("Vault open"), locked: msg("Vault locked"), none: msg("No Vault open") });

export function vaultLabel(status: J, vaultChanging = false): string {
  if (!status) return t("Memory status unknown");
  if (exiting(status)) return t("Exiting, finishing operations");
  if (vaultChanging) return t("Finishing Vault change");
  return VAULT[status.vault?.state] ?? String(status.vault?.state);
}

/** The shell reports an Exit in progress (tray or Settings, ADR-026). */
export const exiting = (status: J): boolean => status?.companion?.exiting === true;

const EXITING = msg("Enouia Runtime is exiting. Memory is stopping model calls locally, cancelling imports and index work, letting a running verify or backup finish, and releasing the Vault. A local stop does not confirm remote cancellation. Reopen the Vault and read saved session outcomes before sending again.");

/** Waiting for, or unable to read, the Memory status. */
export function StatusPending() {
  const { error } = useStatus();
  return (
    <p role="status" className="mem-muted">
      {error ? t("Memory status could not be read. It is retried every few seconds.") : t("Reading the Memory status…")}
    </p>
  );
}

/** Header badge: what this window is connected to, stated plainly. */
export function MemoryBadge() {
  const { status, error, vaultChanging } = useStatus();
  const open = status?.vault?.state === "open" && !vaultChanging && !exiting(status);
  const text = status ? `${t("Memory")} · ${vaultLabel(status, vaultChanging)}` : error ? t("Memory status unavailable") : t("Memory · checking…");
  return (
    <div className="qr224" role="status" title={t("Memory, Context and Sessions use the pinned Enouia Memory Core. The Runtime Inspector shows observed component status.")}>
      <span className="qr223" style={{ background: open ? "var(--ok)" : "var(--pending)" }} />
      {text}
      <span className="qr4">·</span>
      {t("Connected workspace")}
    </div>
  );
}

/** Memory's own components. Its fixed `activity` row is not Runtime's Activity state, so it is not shown. */
export function ComponentList({ status }: { status: J }) {
  const rows = (status?.components ?? []).filter((c: J) => c.component !== "activity");
  return (
    <ul className="mem-components">
      {rows.map((c: J) => (
        <li key={c.component}>
          <span className="mem-mono">{c.component}</span>
          <span className={`mem-state mem-state-${c.state}`}>{c.state}</span>
          <span className="mem-muted">{c.mode ?? (c.errorCode ? `error ${c.errorCode}` : "")}{c.watermarkSequence != null ? ` · watermark #${c.watermarkSequence}` : ""}</span>
        </li>
      ))}
    </ul>
  );
}

/** Open, create or unlock a Vault. Folders are chosen in a native dialog. */
export function VaultConnect() {
  const { status, refresh, vaultChanging } = useStatus();
  const [phrase, setPhrase] = useState("");
  const action = useAction();
  const heading = useRef<HTMLHeadingElement>(null);
  const region = useRef<HTMLElement | null>(null);
  // Locking removes the control that held focus, and opening or unlocking
  // removes this card. Continue at the new state only if focus was lost.
  useEffect(() => {
    if (vaultChanging) return;
    region.current = heading.current?.closest("main") ?? null;
    if (document.activeElement === document.body) heading.current?.focus();
  }, [vaultChanging]);
  useEffect(() => () => {
    if (document.activeElement === document.body) region.current?.focus();
  }, []);
  const v = status?.vault ?? {};
  const after = (f: () => Promise<unknown>) => void action.run(async () => { await f(); await refresh(); });
  if (vaultChanging) return <VaultLifecycleWait />;
  return (
    <div className="mem-card">
      <VaultAdmissionNotice />
      <h2 ref={heading} tabIndex={-1} className="mem-h2">{v.state === "locked" ? `${t("Vault locked")} · ${v.rootName}` : t("No Vault open")}</h2>
      <p className="mem-muted">
        {t("Memory opens only a folder you choose here. Nothing is remembered between runs, and no default location is created.")}
      </p>
      <div className="mem-actions">
        {v.state === "locked" && (
          <button type="button" className="mem-button mem-primary" disabled={action.busy} onClick={() => after(() => call("vault_unlock"))}>{t("Unlock")}</button>
        )}
        <button type="button" className="mem-button" disabled={action.busy}
          onClick={() => after(async () => { const p = await pick("vault_root"); if (p) await call("vault_open", { rootToken: p.token }); })}>
          {t("Open an existing Vault…")}
        </button>
      </div>
      <label className="mem-label" htmlFor="mem-create-phrase">
        {tj("New Vault in an empty folder. Type {phrase} to confirm.", { phrase: <code lang="en">create new vault</code> })}
      </label>
      <div className="mem-actions">
        <input id="mem-create-phrase" className="mem-input" value={phrase} onChange={(e) => setPhrase(e.target.value)} autoComplete="off" spellCheck={false} />
        <button type="button" className="mem-button" disabled={phrase !== "create new vault" || action.busy}
          onClick={() => after(async () => { const p = await pick("vault_root"); if (p) await call("vault_create", { rootToken: p.token, confirmPhrase: phrase }); })}>
          {t("Create Vault…")}
        </button>
      </div>
      <p className="mem-muted">{t("A Vault cannot sit inside a Git working tree, a sync folder such as OneDrive, Program Files or Windows, and it needs a local NTFS or ReFS disk.")}</p>
      <ErrorBox error={action.error} />
    </div>
  );
}

/** Children render only while a Vault is open; otherwise the connect card. */
export function VaultGate({ children }: { children: ReactNode }) {
  const { status, error, vaultChanging } = useStatus();
  if (!status) {
    return <div className="mem-gate"><ErrorBox error={error} /><StatusPending /></div>;
  }
  if (exiting(status)) return <div className="mem-gate"><p role="status" className="mem-muted">{t(EXITING)}</p></div>;
  if (vaultChanging) return <div className="mem-gate"><VaultLifecycleWait /></div>;
  if (status.vault?.state !== "open") return <div className="mem-gate"><VaultConnect /></div>;
  return <>{children}</>;
}

/** Core's detached slot does not mean Runtime has finished releasing it. */
export function VaultLifecycleFeedback({ children }: { children?: ReactNode }) {
  return <div className="mem-card mem-stack" aria-busy="true">
    <h2 className="mem-h2">{t("Finishing Vault change")}</h2>
    <p role="status" className="mem-muted">{t("Runtime is finishing Memory operations before releasing the Vault. Verify and backup cannot be cancelled. Wait for this to finish before unlocking or opening a Vault.")}</p>
    <p className="mem-muted">Model calls stop locally. The service may have received the request; after reopening, read the saved session outcome before sending again.</p>
    {children}
  </div>;
}

export function VaultLifecycleWait() {
  const [operations, setOperations] = useState<J[]>([]);
  const [error, setError] = useState<Failure>(null);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await call("operation_list");
        if (!stopped) {
          setOperations(result.items.filter((op: J) => ["queued", "running"].includes(op.state)));
          setError(null);
        }
      } catch {
        if (!stopped) setError({ text: t("Operation progress could not be read. Runtime is still finishing the Vault change.") });
      } finally {
        if (!stopped) timer = setTimeout(poll, 400);
      }
    };
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, []);
  return <VaultLifecycleFeedback>
    <ErrorBox error={error} />
    {operations.map(op => <Operation key={op.operationId} id={op.operationId} kind={op.kind} />)}
  </VaultLifecycleFeedback>;
}

/** Home in the native shell: real Memory status and plain routes. */
export function ConnectedHome({ nav, ring }: { nav: J; ring: ReactNode }) {
  const { status, vaultChanging } = useStatus();
  const v = status?.vault;
  const stopping = exiting(status);
  const open = v?.state === "open" && !vaultChanging && !stopping;
  const pending: number | null = status?.pendingCandidates ?? null;
  const reviewLine = !status
    ? t("Memory status unknown")
    : stopping
      ? t("Runtime is exiting · waiting for Memory operations")
      : vaultChanging
      ? t("Finishing Memory operations before releasing the Vault")
      : v?.state === "locked"
      ? t("Vault locked · unlock it in Memory Vault")
      : !open
        ? t("Open or create a Vault to begin")
        : pending == null
          ? t("Review queue could not be read")
          : pending
            ? tn(pending, "{n} candidate waiting for your review", "{n} candidates waiting for your review")
            : t("Nothing waiting for review");
  return (
    <section data-screen-label="Home" className="qr17">
      <div className="qr16">
        <VaultAdmissionNotice />
        <div className="qr8">
          {ring}
          <div className="qr7">
            <div className="qr1">Enouia Runtime</div>
            <h1 className="qr2" lang="en">I'm here.</h1>
            <div className="qr6">
              <span className="qr3" style={{ background: open ? "var(--ok)" : "var(--pending)" }} />
              <span>{vaultLabel(status, vaultChanging)}{v?.rootName ? ` · ${v.rootName}` : ""}</span>
              <span className="qr4">·</span>
              <span>{t("Local Mock responses")}</span>
            </div>
          </div>
        </div>
        <div className="qr13">
          <button onClick={nav.memory.go} className="qr12" type="button">
            <span className="qr9">{t("Memory Vault")}</span>
            <span className="qr10">{reviewLine}</span>
            <span className="qr11">{stopping ? "exiting" : vaultChanging ? "waiting" : open ? `#${v.headSequence}` : v?.state ?? "—"}</span>
          </button>
          <button onClick={nav.sessions.go} className="qr12" type="button">
            <span className="qr9">{t("Sessions")}</span>
            <span className="qr10">{t("Use the local Mock, or inspect and authorize an external model request")}</span>
            <span className="qr11">{t("open")}</span>
          </button>
          <button onClick={nav.context.go} className="qr12" type="button">
            <span className="qr9">{t("Context")}</span>
            <span className="qr10">{t("Preview what a question would carry, and why")}</span>
            <span className="qr11">{t("inspect")}</span>
          </button>
        </div>
        {open && (
          <div className="qr15">
            <div className="qr9">{t("Last commit")}</div>
            <div className="qr14">{when(v.lastCommitAt)}</div>
          </div>
        )}
      </div>
    </section>
  );
}

function Row({ k, children }: { k: string; children: ReactNode }) {
  return <div className="qr216"><span className="qr35">{k}</span><span>{children}</span></div>;
}

/** Settings rows for the Vault, replacing the demo's pending adapter row. */
export function MemorySettings({ openMemory }: { openMemory: () => void }) {
  const { status, vaultChanging } = useStatus();
  const v = status?.vault ?? {};
  return (
    <><div className="qr65">
      <div className="qr198">{t("Memory Vault")}</div>
      <Row k={t("State")}>{vaultLabel(status, vaultChanging)}</Row>
      <Row k={t("Folder")}>{v.rootName ?? "—"}</Row>
      {v.state === "open" && !vaultChanging && !exiting(status) && (
        <>
          <Row k={t("Health")}>{v.health}</Row>
          <Row k={t("Last commit")}><span className="qr217">#{v.headSequence} · {when(v.lastCommitAt)}</span></Row>
          <Row k={t("Owner-only access")}>{v.ownerOnlyAcl == null ? t("unknown") : v.ownerOnlyAcl ? t("yes") : <Tag tone="warn">{t("no")}</Tag>}</Row>
          <Row k={t("Free space")}>{v.freeBytes != null ? `${(v.freeBytes / 2 ** 30).toFixed(1)} GiB` : t("unknown")}</Row>
        </>
      )}
      <Row k={t("Components")}><ComponentList status={status} /></Row>
      <div className="qr216">
        <span className="qr35">{t("Manage")}</span>
        <span><button type="button" className="mem-link" onClick={openMemory}>{t("Open the Memory Vault surface")}</button></span>
      </div>
      <CompanionSettings status={status} />
    </div>
    <Suspense fallback={<p role="status" className="mem-muted">{t("Loading panel…")}</p>}>
      <ProviderConfigDraft disabled={exiting(status)} />
    </Suspense>
    <Suspense fallback={<p role="status" className="mem-muted">{t("Loading panel…")}</p>}>
      <ProviderSettingsStatus disabled={exiting(status)} />
    </Suspense></>
  );
}

const HOTKEY: Record<string, string> = labels({
  registered: msg("ready"),
  conflict: msg("taken by another program, so it is not registered"),
  unsupported: msg("not supported on this system"),
  absent: msg("not set up"),
});

/** Window, quick search and login startup (ADR-026). */
function CompanionSettings({ status }: { status: J }) {
  const { refresh } = useStatus();
  const [startup, setStartup] = useState<J>(null);
  const [note, setNote] = useState("");
  const startupRead = useLatestRead();
  const action = useAction();
  const leave = useAction();
  const leaving = exiting(status) || leave.busy;
  const readStartup = useCallback(() => startupRead.run(() => shell.startupStatus(), setStartup), [startupRead.run]);
  useEffect(() => { void readStartup(); }, [readStartup]);
  const hotkey = status?.companion?.hotkey;
  const enabled = startup?.enabled ?? false;
  const locked = !startup?.supported || startupRead.busy || !!startupRead.error || action.busy || leaving || startup?.state === "different_installation";
  return (
    <>
      <div className="qr198 mem-section">{t("Window and startup")}</div>
      <Row k={t("Closing")}>{t("Closing the window hides it to the tray; Memory keeps running. Exit from the tray or below.")}</Row>
      <Row k={t("Quick search")}>
        {hotkey?.combo ? <span className="qr217">{hotkey.combo}</span> : "—"} {HOTKEY[hotkey?.state] ?? hotkey?.state ?? ""}
        {hotkey?.state === "conflict" && <span className="mem-muted"> {t("· start Runtime with --hotkey-key and another letter")}</span>}
      </Row>
      <div className="qr216">
        <span className="qr35" id="mem-startup-label">{t("Start at login")}</span>
        <span className="mem-actions">
          <button type="button" role="switch" aria-checked={enabled} aria-labelledby="mem-startup-label" aria-describedby="mem-startup-description"
            disabled={locked} className="qr215 mem-switch"
            style={{ border: "1px solid " + (enabled ? "#9FC2D2" : "#3A4958"), background: enabled ? "#9FC2D2" : "transparent" }}
            onClick={() => {
              if (locked || startupRead.pending.current) return;
              // The acknowledgement describes one completed change; a new
              // attempt or observation must not keep asserting it.
              setNote("");
              void action.run(async () => {
                const next = !enabled;
                setStartup(await shell.startupSet(next));
                setNote(next ? msg("Runtime will start in the tray when you sign in.") : msg("Runtime will not start at sign-in."));
              });
            }}>
            <span className="qr214" style={{ left: enabled ? "23px" : "3px", background: enabled ? "#0C1117" : "#9BA9B6" }} />
          </button>
          <span id="mem-startup-description" className="mem-muted">
            {t("Off by default. Starts only the tray; no Vault is opened.")}
            {startup?.state === "different_installation" && " " + t("Another installation owns this setting; turn it off there first.")}
            {startup && !startup.supported && " " + t("Not supported on this system.")}
          </span>
        </span>
      </div>
      <div className="mem-actions">
        <button type="button" className="mem-button" disabled={startupRead.busy || action.busy}
          onClick={() => { if (!startupRead.pending.current && !action.busy) { setNote(""); void readStartup(); } }}>{t("Read startup setting again")}</button>
      </div>
      {startupRead.busy && <p role="status" className="mem-muted">{t("Reading the startup setting…")}</p>}
      {startupRead.error && <p role="status" className="mem-muted">{startup ? t("Previous startup observation.") : t("The startup setting is still unknown.")} {t("Read the setting again before changing it. Reading does not change login startup.")}</p>}
      <ErrorBox error={startupRead.error} />
      <p role="status" aria-atomic="true" className="mem-note">{note && t(note)}</p>
      <ErrorBox error={action.error} />
      <div className="qr216">
        <span className="qr35">{t("Exit")}</span>
        <span>
          <button type="button" className="mem-button mem-danger" disabled={leaving}
            onClick={() => void leave.run(async () => { await shell.exit(); await refresh(); })}>{t("Exit Enouia Runtime")}</button>
          <span className="mem-muted"> {t("Stops model calls locally and releases the Vault first. Read saved session outcomes before sending again.")}</span>
        </span>
      </div>
      {leaving && <p role="status" className="mem-note">{t(EXITING)}</p>}
      <ErrorBox error={leave.error} />
    </>
  );
}
