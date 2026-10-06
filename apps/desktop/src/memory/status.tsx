// Memory status shared by the connected surfaces: one serial poll of
// `workspace_status`, the header badge, the Home and Settings panels, and the
// gate that keeps Vault-dependent surfaces closed until a Vault is open.
import { createContext, useContext, useState, type ReactNode } from "react";
import { call, pick, type J } from "./client";
import { useAction, useMemoryStatus, type Failure } from "./hooks";
import { ErrorBox, Tag, when } from "./ui";
import VaultAdmissionNotice from '../shell/VaultAdmissionNotice';

type StatusValue = { status: J; error: Failure; refresh: () => Promise<void> };
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

const VAULT: Record<string, string> = { open: "Vault open", locked: "Vault locked", none: "No Vault open" };

export function vaultLabel(status: J): string {
  if (!status) return "Memory status unknown";
  return VAULT[status.vault?.state] ?? String(status.vault?.state);
}

/** Waiting for, or unable to read, the Memory status. */
export function StatusPending() {
  const { error } = useStatus();
  return (
    <p role="status" className="mem-muted">
      {error ? "Memory status could not be read. It is retried every few seconds." : "Reading the Memory status…"}
    </p>
  );
}

/** Header badge: what this window is connected to, stated plainly. */
export function MemoryBadge() {
  const { status, error } = useStatus();
  const open = status?.vault?.state === "open";
  const text = status ? `Memory · ${vaultLabel(status)}` : error ? "Memory status unavailable" : "Memory · checking…";
  return (
    <div className="qr224" role="status" title="Memory, Context and Sessions use the pinned Enouia Memory Core. Activity and the Runtime Inspector show fictional examples.">
      <span className="qr223" style={{ background: open ? "var(--ok)" : "var(--pending)" }} />
      {text}
      <span className="qr4">·</span>
      Activity &amp; Inspector demo
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
  const { status, refresh } = useStatus();
  const [phrase, setPhrase] = useState("");
  const action = useAction();
  const v = status?.vault ?? {};
  const after = (f: () => Promise<unknown>) => void action.run(async () => { await f(); await refresh(); });
  return (
    <div className="mem-card">
      <VaultAdmissionNotice />
      <h2 className="mem-h2">{v.state === "locked" ? `Vault locked · ${v.rootName}` : "No Vault open"}</h2>
      <p className="mem-muted">
        Memory opens only a folder you choose here. Nothing is remembered between runs, and no default location is created.
      </p>
      <div className="mem-actions">
        {v.state === "locked" && (
          <button type="button" className="mem-button mem-primary" disabled={action.busy} onClick={() => after(() => call("vault_unlock"))}>Unlock</button>
        )}
        <button type="button" className="mem-button" disabled={action.busy}
          onClick={() => after(async () => { const p = await pick("vault_root"); if (p) await call("vault_open", { rootToken: p.token }); })}>
          Open an existing Vault…
        </button>
      </div>
      <label className="mem-label" htmlFor="mem-create-phrase">
        New Vault in an empty folder. Type <code>create new vault</code> to confirm.
      </label>
      <div className="mem-actions">
        <input id="mem-create-phrase" className="mem-input" value={phrase} onChange={(e) => setPhrase(e.target.value)} autoComplete="off" spellCheck={false} />
        <button type="button" className="mem-button" disabled={phrase !== "create new vault" || action.busy}
          onClick={() => after(async () => { const p = await pick("vault_root"); if (p) await call("vault_create", { rootToken: p.token, confirmPhrase: phrase }); })}>
          Create Vault…
        </button>
      </div>
      <p className="mem-muted">A Vault cannot sit inside a Git working tree, a sync folder such as OneDrive, Program Files or Windows, and it needs a local NTFS or ReFS disk.</p>
      <ErrorBox error={action.error} />
    </div>
  );
}

/** Children render only while a Vault is open; otherwise the connect card. */
export function VaultGate({ children }: { children: ReactNode }) {
  const { status, error } = useStatus();
  if (!status) {
    return <div className="mem-gate"><ErrorBox error={error} /><StatusPending /></div>;
  }
  if (status.vault?.state !== "open") return <div className="mem-gate"><VaultConnect /></div>;
  return <>{children}</>;
}

/** Home in the native shell: real Memory status and plain routes. */
export function ConnectedHome({ nav, ring }: { nav: J; ring: ReactNode }) {
  const { status } = useStatus();
  const v = status?.vault;
  const open = v?.state === "open";
  const pending: number | null = status?.pendingCandidates ?? null;
  const reviewLine = !status
    ? "Memory status unknown"
    : v?.state === "locked"
      ? "Vault locked · unlock it in Memory Vault"
      : !open
        ? "Open or create a Vault to begin"
        : pending == null
          ? "Review queue could not be read"
          : pending
            ? `${pending} candidate${pending === 1 ? "" : "s"} waiting for your review`
            : "Nothing waiting for review";
  return (
    <section data-screen-label="Home" className="qr17">
      <div className="qr16">
        <VaultAdmissionNotice />
        <div className="qr8">
          {ring}
          <div className="qr7">
            <div className="qr1">Enouia Runtime</div>
            <h1 className="qr2">I'm here.</h1>
            <div className="qr6">
              <span className="qr3" style={{ background: open ? "var(--ok)" : "var(--pending)" }} />
              <span>{vaultLabel(status)}{v?.rootName ? ` · ${v.rootName}` : ""}</span>
              <span className="qr4">·</span>
              <span>Local Mock responses</span>
              <span className="qr4">·</span>
              <span className="qr5">Activity shows fictional examples</span>
            </div>
          </div>
        </div>
        <div className="qr13">
          <button onClick={nav.memory.go} className="qr12" type="button">
            <span className="qr9">Memory Vault</span>
            <span className="qr10">{reviewLine}</span>
            <span className="qr11">{open ? `#${v.headSequence}` : v?.state ?? "—"}</span>
          </button>
          <button onClick={nav.sessions.go} className="qr12" type="button">
            <span className="qr9">Sessions</span>
            <span className="qr10">Continue a conversation with approved memories</span>
            <span className="qr11">local mock</span>
          </button>
          <button onClick={nav.context.go} className="qr12" type="button">
            <span className="qr9">Context</span>
            <span className="qr10">Preview what a question would carry, and why</span>
            <span className="qr11">inspect</span>
          </button>
          <button onClick={nav.activity.go} className="qr12" type="button">
            <span className="qr9">Activity</span>
            <span className="qr10">Fictional event examples · the producer runs on its own schedule</span>
            <span className="qr11">demo</span>
          </button>
        </div>
        {open && (
          <div className="qr15">
            <div className="qr9">Last commit</div>
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
  const { status } = useStatus();
  const v = status?.vault ?? {};
  return (
    <div className="qr65">
      <div className="qr198">Memory Vault</div>
      <Row k="State">{vaultLabel(status)}</Row>
      <Row k="Folder">{v.rootName ?? "—"}</Row>
      {v.state === "open" && (
        <>
          <Row k="Health">{v.health}</Row>
          <Row k="Last commit"><span className="qr217">#{v.headSequence} · {when(v.lastCommitAt)}</span></Row>
          <Row k="Owner-only access">{v.ownerOnlyAcl == null ? "unknown" : v.ownerOnlyAcl ? "yes" : <Tag tone="warn">no</Tag>}</Row>
          <Row k="Free space">{v.freeBytes != null ? `${(v.freeBytes / 2 ** 30).toFixed(1)} GiB` : "unknown"}</Row>
        </>
      )}
      <Row k="Components"><ComponentList status={status} /></Row>
      <div className="qr216">
        <span className="qr35">Manage</span>
        <span><button type="button" className="mem-link" onClick={openMemory}>Open the Memory Vault surface</button></span>
      </div>
    </div>
  );
}
