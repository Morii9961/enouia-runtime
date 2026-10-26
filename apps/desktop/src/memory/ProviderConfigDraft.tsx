import { useEffect, useId, useRef, useState } from "react";
import { CONFIG_APIS, buildProviderConfigDraft, emptyProviderConfigDraft, type ConfigApi, type DestinationDraft, type ProviderConfigDraft as Draft } from "./providerSettingsDraft";
import { describe, providerSaveDraft } from "./client";

import { msg, t, tj } from '../i18n/index.ts';
const copyDraft = (text: string) => navigator.clipboard.writeText(text);
const FIELDS = [
  ["model", msg("Model ID"), msg("Exact model ID")],
  ["contextWindowTokens", msg("Context window (tokens)"), msg("Positive whole number")],
  ["maxOutputTokens", msg("Output limit (tokens)"), msg("Smaller than context window")],
  ["verifiedAt", msg("Capabilities verified at (UTC)"), "YYYY-MM-DDTHH:mm:ss.sssZ"],
] as const;

export function ProviderConfigDraft({ disabled = false, copy = copyDraft, save = providerSaveDraft }: { disabled?: boolean; copy?: (text: string) => Promise<void>; save?: typeof providerSaveDraft }) {
  const [draft, setDraft] = useState(emptyProviderConfigDraft);
  const [submitted, setSubmitted] = useState(false);
  const [generated, setGenerated] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [copyBusy, setCopyBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const saving = useRef(false);
  const focusReturn = useRef<HTMLElement | null>(null);
  const revision = useRef(0), copying = useRef(false), mounted = useRef(false);
  const id = useId();
  const result = submitted ? buildProviderConfigDraft(draft) : null;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; revision.current += 1; }; }, []);
  useEffect(() => {
    if (copyBusy || saveBusy || !focusReturn.current) return;
    const trigger = focusReturn.current;
    focusReturn.current = null;
    if (trigger.isConnected && (document.activeElement === document.body || document.activeElement === trigger)) trigger.focus();
  }, [copyBusy, saveBusy]);
  const update = (change: (current: Draft) => Draft) => {
    if (disabled || saving.current) return;
    revision.current += 1;
    setDraft(change); setGenerated(null); setSubmitted(false); setNotice("");
  };
  const destination = (api: ConfigApi, change: Partial<DestinationDraft>) =>
    update(current => ({ ...current, destinations: { ...current.destinations, [api]: { ...current.destinations[api], ...change } } }));
  const invalid = (field: string) => submitted && result?.ok === false && result.issues.some(issue => issue.field === field);
  return <section className="qr65 mem-stack" aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`} className="qr198">{t("Model configuration draft")}</h2>
    <p className="mem-muted">{t("Generate a settings file from values you verified. Generating and copying do not save the file, reload settings or activate a model. Save settings draft opens a native file dialog. API keys belong only in the native Set key prompt.")}</p>
    <form noValidate className="mem-stack" onSubmit={event => {
      event.preventDefault();
      if (disabled || saving.current) return;
      revision.current += 1; setNotice(""); setSubmitted(true);
      const next = buildProviderConfigDraft(draft);
      setGenerated(next.ok ? next.json : null);
    }}>
      <fieldset disabled={disabled || saveBusy} className="mem-stack" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="mem-label">{t("Providers and verified capabilities")}</legend>
        {CONFIG_APIS.map(api => <div key={api} className="mem-card mem-stack">
          <label className="mem-label"><input type="checkbox" checked={draft.destinations[api].enabled}
            onChange={event => destination(api, { enabled: event.target.checked })} /> {t("Configure {api}", { api })}</label>
          {draft.destinations[api].enabled && <>
            {FIELDS.map(([field, label, placeholder]) => <div key={field} className="mem-stack">
              <label className="mem-label" htmlFor={`${id}-${api}-${field}`}>{api} · {t(label)}</label>
              <input id={`${id}-${api}-${field}`} className="mem-input" value={draft.destinations[api][field]} placeholder={placeholder.startsWith("YYYY") ? placeholder : t(placeholder)}
                inputMode={field.endsWith("Tokens") ? "numeric" : undefined} aria-invalid={invalid(`${api}.${field}`)}
                autoComplete="off" spellCheck={false} onChange={event => destination(api, { [field]: event.target.value })} />
            </div>)}
            <label className="mem-label" htmlFor={`${id}-${api}-streaming`}>{api} · Streaming supported</label>
            <select id={`${id}-${api}-streaming`} className="mem-input" value={draft.destinations[api].streaming} aria-invalid={invalid(`${api}.streaming`)}
              onChange={event => destination(api, { streaming: event.target.value as DestinationDraft["streaming"] })}>
              <option value="">{t("Choose the verified capability")}</option><option value="yes">{t("Yes")}</option><option value="no">{t("No")}</option>
            </select>
          </>}
        </div>)}
        <label className="mem-label" htmlFor={`${id}-attempts`}>Attempts per session (1–1000)</label>
        <input id={`${id}-attempts`} className="mem-input" inputMode="numeric" autoComplete="off" value={draft.maxAttemptsPerSession} aria-invalid={invalid("maxAttemptsPerSession")}
          onChange={event => update(current => ({ ...current, maxAttemptsPerSession: event.target.value }))} />
        <label className="mem-label" htmlFor={`${id}-tokens`}>{t("Reserved token budget per session")}</label>
        <input id={`${id}-tokens`} className="mem-input" inputMode="numeric" autoComplete="off" value={draft.maxReservedTokensPerSession} aria-invalid={invalid("maxReservedTokensPerSession")}
          onChange={event => update(current => ({ ...current, maxReservedTokensPerSession: event.target.value }))} />
        <label className="mem-label"><input type="checkbox" checked={draft.verified} aria-invalid={invalid("verified")}
          onChange={event => update(current => ({ ...current, verified: event.target.checked }))} /> {t("I checked these models, capabilities and limits for my API account")}</label>
        <p className="mem-muted">{t("Session token budgets are estimates, not spending caps. No model capability, API access or price is inferred from a subscription.")}</p>
        <button type="submit" className="mem-button">{t("Generate settings draft")}</button>
      </fieldset>
    </form>
    {result?.ok === false && <div role="alert" className="mem-error"><ul className="mem-list">{result.issues.map(issue => <li key={issue.field}>{issue.text}</li>)}</ul></div>}
    {generated && <>
      <label className="mem-label" htmlFor={`${id}-json`}>{t("Draft memory-providers.json")}</label>
      <textarea id={`${id}-json`} className="mem-input mem-mono" rows={16} readOnly value={generated} autoComplete="off" spellCheck={false} />
      <button type="button" className="mem-button" disabled={disabled || copyBusy || saveBusy} onClick={async (event) => {
        if (disabled || copying.current || saving.current) return;
        focusReturn.current = document.activeElement === event.currentTarget ? event.currentTarget : null;
        const current = revision.current;
        copying.current = true; setCopyBusy(true); setNotice("");
        try { await copy(generated); if (mounted.current && revision.current === current) setNotice(t("Draft copied. Copying does not save or reload settings.")); }
        catch { if (mounted.current && revision.current === current) setNotice(t("Copy failed. Select and copy the draft text, or try again.")); }
        finally { copying.current = false; if (mounted.current) setCopyBusy(false); }
      }}>{t("Copy settings draft")}</button>
      <button type="button" className="mem-button" disabled={disabled || saveBusy || copyBusy} onClick={async (event) => {
        if (disabled || copying.current || saving.current) return;
        focusReturn.current = document.activeElement === event.currentTarget ? event.currentTarget : null;
        const current = revision.current;
        saving.current = true; setSaveBusy(true); setNotice("");
        try {
          const result = await save(generated);
          if (mounted.current && revision.current === current) setNotice("cancelled" in result
            ? t("Save cancelled. The draft is kept; no settings were reloaded.")
            : t("Settings draft saved. The running Core has not reloaded it."));
        } catch (error) {
          if (mounted.current && revision.current === current) setNotice(t("Save result is not confirmed. {v0}. Check the selected file before saving again.", { v0: describe(error) }));
        } finally { saving.current = false; if (mounted.current) setSaveBusy(false); }
      }}>{t("Save settings draft…")}</button>
      <p className="mem-muted">{tj("Save as {path}. Saving does not reload the running Core; Runtime reads the file on next start or explicit Reload settings in Sessions. Set the key and review a grant separately. Reloading does not send a request.", { path: <span className="mem-mono">%APPDATA%\com.enouia.runtime\memory-providers.json</span> })}</p>
    </>}
    {notice && <p role="status" className="mem-muted">{notice}</p>}
  </section>;
}
