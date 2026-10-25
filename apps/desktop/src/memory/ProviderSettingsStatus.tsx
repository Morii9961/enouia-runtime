// Host-loaded setup only. Reading does not inspect the draft/file, and an
// explicit reload always reobserves the host even if its reply was lost.
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { describe, providerReload, providerSetup } from "./client";
import { when } from "./ui";

type Setup = { state: "absent" | "ready" } | { state: "invalid"; rule: string };
type Observation = { setup: Setup; at: string };

function checked(value: unknown): Setup {
  if (value && typeof value === "object" && !Array.isArray(value)
    && Object.hasOwn(value, "state") && Object.hasOwn(value, "file")
    && "file" in value && value.file === "memory-providers.json" && "state" in value) {
    if (value.state === "absent" || value.state === "ready") return { state: value.state };
    if (value.state === "invalid" && Object.hasOwn(value, "rule") && "rule" in value && typeof value.rule === "string" && value.rule.length > 0)
      return { state: "invalid", rule: value.rule };
  }
  throw new Error("Unrecognized native setup observation");
}

export function ProviderSettingsStatus({ disabled = false, setup = providerSetup, reload = providerReload }: {
  disabled?: boolean; setup?: typeof providerSetup; reload?: typeof providerReload;
}) {
  const [observation, setObservation] = useState<Observation | null>(null);
  const [busy, setBusy] = useState<"read" | "reload" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadError, setReloadError] = useState<string | null>(null);
  const generation = useRef(0), pending = useRef(false);
  const focusReturn = useRef<HTMLButtonElement | null>(null);
  const id = useId();
  const read = useCallback(async (kind: "read" | "reload") => {
    if (disabled || pending.current) return;
    const current = ++generation.current;
    pending.current = true;
    setBusy(kind); setObservation(null); setError(null); setReloadError(null);
    try {
      if (kind === "reload") {
        try { await reload(); }
        catch (error) {
          if (current === generation.current) setReloadError(`Reload was not acknowledged. ${describe(error)}. The loaded state is read separately below.`);
        }
      }
      if (current !== generation.current) return;
      const value = checked(await setup());
      if (current === generation.current) setObservation({ setup: value, at: new Date().toISOString() });
    } catch (error) {
      if (current === generation.current) setError(`Loaded model settings are unknown. ${describe(error)}. Read the state again before reloading.`);
    } finally {
      if (current === generation.current) { pending.current = false; setBusy(null); }
    }
  }, [disabled, setup, reload]);
  useEffect(() => {
    if (disabled) { setObservation(null); setBusy(null); setError(null); setReloadError(null); focusReturn.current = null; }
    else void read("read");
    return () => { generation.current += 1; pending.current = false; };
  }, [disabled, read]);
  useEffect(() => {
    if (busy || disabled || !focusReturn.current) return;
    const trigger = focusReturn.current; focusReturn.current = null;
    if (trigger.isConnected && (document.activeElement === document.body || document.activeElement === trigger)) trigger.focus();
  }, [busy, disabled]);
  const state = observation?.setup;
  const act = (kind: "read" | "reload", trigger: HTMLButtonElement) => {
    if (disabled || pending.current || (kind === "reload" && !observation)) return;
    focusReturn.current = document.activeElement === trigger ? trigger : null;
    void read(kind);
  };
  return <section className="qr65 mem-stack" aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`} className="qr198">Loaded model settings</h2>
    <p className="mem-muted">This is the running host's last observed setup. Generating or saving a draft does not change it. Reload model settings explicitly reads the fixed configuration file and adopts or disables that setup.</p>
    <p role="status" className="mem-muted">{disabled ? "Runtime is exiting; settings changes are unavailable."
      : busy === "reload" ? "Reloading and reading loaded model settings…"
      : busy ? "Reading loaded model settings…"
      : state?.state === "ready" ? "Settings loaded. Key access, grants and requests are separate steps in Sessions."
      : state?.state === "absent" ? "External providers are off: no settings file was loaded."
      : state?.state === "invalid" ? `Settings refused; external providers are off. ${describe(state.rule)}.`
      : "Loaded model settings are unknown."}</p>
    {observation && !disabled && <p className="mem-muted">Observed {when(observation.at)}</p>}
    {error && <p role="alert" className="mem-error">{error}</p>}
    {reloadError && <p role="alert" className="mem-error">{reloadError}</p>}
    <div className="mem-actions">
      <button type="button" className="mem-button" disabled={disabled || busy != null}
        onClick={event => act("read", event.currentTarget)}>Read loaded settings again</button>
      <button type="button" className="mem-button" disabled={disabled || busy != null || !observation}
        onClick={event => act("reload", event.currentTarget)}>Reload model settings</button>
    </div>
    <p className="mem-muted">Only <span className="mem-mono">%APPDATA%\com.enouia.runtime\memory-providers.json</span> is read. A rejected or missing file turns providers off after the Core accepts the change; a running call can refuse it and keep the previous setup. Reloading does not send a request, enter a key or approve a grant.</p>
  </section>;
}
