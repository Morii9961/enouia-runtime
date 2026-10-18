import { useEffect, useId, useRef, useState } from "react";
import { CONFIG_APIS, buildProviderConfigDraft, emptyProviderConfigDraft, type ConfigApi, type DestinationDraft, type ProviderConfigDraft as Draft } from "./providerSettingsDraft";

const copyDraft = (text: string) => navigator.clipboard.writeText(text);
const FIELDS = [
  ["model", "Model ID", "Exact model ID"],
  ["contextWindowTokens", "Context window (tokens)", "Positive whole number"],
  ["maxOutputTokens", "Output limit (tokens)", "Smaller than context window"],
  ["verifiedAt", "Capabilities verified at (UTC)", "YYYY-MM-DDTHH:mm:ss.sssZ"],
] as const;

export function ProviderConfigDraft({ disabled = false, copy = copyDraft }: { disabled?: boolean; copy?: (text: string) => Promise<void> }) {
  const [draft, setDraft] = useState(emptyProviderConfigDraft);
  const [submitted, setSubmitted] = useState(false);
  const [generated, setGenerated] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [copyBusy, setCopyBusy] = useState(false);
  const revision = useRef(0), copying = useRef(false), mounted = useRef(false);
  const id = useId();
  const result = submitted ? buildProviderConfigDraft(draft) : null;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; revision.current += 1; }; }, []);
  const update = (change: (current: Draft) => Draft) => {
    if (disabled) return;
    revision.current += 1;
    setDraft(change); setGenerated(null); setSubmitted(false); setNotice("");
  };
  const destination = (api: ConfigApi, change: Partial<DestinationDraft>) =>
    update(current => ({ ...current, destinations: { ...current.destinations, [api]: { ...current.destinations[api], ...change } } }));
  const invalid = (field: string) => submitted && result?.ok === false && result.issues.some(issue => issue.field === field);
  return <section className="qr65 mem-stack" aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`} className="qr198">Model configuration draft</h2>
    <p className="mem-muted">Generate a settings file from values you verified. This draft stays in this window; it does not save, load or activate a model. API keys belong only in the native Set key prompt.</p>
    <form noValidate className="mem-stack" onSubmit={event => {
      event.preventDefault();
      if (disabled) return;
      revision.current += 1; setNotice(""); setSubmitted(true);
      const next = buildProviderConfigDraft(draft);
      setGenerated(next.ok ? next.json : null);
    }}>
      <fieldset disabled={disabled} className="mem-stack" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="mem-label">Providers and verified capabilities</legend>
        {CONFIG_APIS.map(api => <div key={api} className="mem-card mem-stack">
          <label className="mem-label"><input type="checkbox" checked={draft.destinations[api].enabled}
            onChange={event => destination(api, { enabled: event.target.checked })} /> Configure {api}</label>
          {draft.destinations[api].enabled && <>
            {FIELDS.map(([field, label, placeholder]) => <div key={field} className="mem-stack">
              <label className="mem-label" htmlFor={`${id}-${api}-${field}`}>{api} · {label}</label>
              <input id={`${id}-${api}-${field}`} className="mem-input" value={draft.destinations[api][field]} placeholder={placeholder}
                inputMode={field.endsWith("Tokens") ? "numeric" : undefined} aria-invalid={invalid(`${api}.${field}`)}
                autoComplete="off" spellCheck={false} onChange={event => destination(api, { [field]: event.target.value })} />
            </div>)}
            <label className="mem-label" htmlFor={`${id}-${api}-streaming`}>{api} · Streaming supported</label>
            <select id={`${id}-${api}-streaming`} className="mem-input" value={draft.destinations[api].streaming} aria-invalid={invalid(`${api}.streaming`)}
              onChange={event => destination(api, { streaming: event.target.value as DestinationDraft["streaming"] })}>
              <option value="">Choose the verified capability</option><option value="yes">Yes</option><option value="no">No</option>
            </select>
          </>}
        </div>)}
        <label className="mem-label" htmlFor={`${id}-attempts`}>Attempts per session (1–1000)</label>
        <input id={`${id}-attempts`} className="mem-input" inputMode="numeric" autoComplete="off" value={draft.maxAttemptsPerSession} aria-invalid={invalid("maxAttemptsPerSession")}
          onChange={event => update(current => ({ ...current, maxAttemptsPerSession: event.target.value }))} />
        <label className="mem-label" htmlFor={`${id}-tokens`}>Reserved token budget per session</label>
        <input id={`${id}-tokens`} className="mem-input" inputMode="numeric" autoComplete="off" value={draft.maxReservedTokensPerSession} aria-invalid={invalid("maxReservedTokensPerSession")}
          onChange={event => update(current => ({ ...current, maxReservedTokensPerSession: event.target.value }))} />
        <label className="mem-label"><input type="checkbox" checked={draft.verified} aria-invalid={invalid("verified")}
          onChange={event => update(current => ({ ...current, verified: event.target.checked }))} /> I checked these models, capabilities and limits for my API account</label>
        <p className="mem-muted">Session token budgets are estimates, not spending caps. No model capability, API access or price is inferred from a subscription.</p>
        <button type="submit" className="mem-button">Generate settings draft</button>
      </fieldset>
    </form>
    {result?.ok === false && <div role="alert" className="mem-error"><ul className="mem-list">{result.issues.map(issue => <li key={issue.field}>{issue.text}</li>)}</ul></div>}
    {generated && <>
      <label className="mem-label" htmlFor={`${id}-json`}>Draft memory-providers.json</label>
      <textarea id={`${id}-json`} className="mem-input mem-mono" rows={16} readOnly value={generated} autoComplete="off" spellCheck={false} />
      <button type="button" className="mem-button" disabled={disabled || copyBusy} onClick={async () => {
        if (disabled || copying.current) return;
        const current = revision.current;
        copying.current = true; setCopyBusy(true); setNotice("");
        try { await copy(generated); if (mounted.current && revision.current === current) setNotice("Draft copied. It has not been saved or loaded."); }
        catch { if (mounted.current && revision.current === current) setNotice("Copy failed. Select and copy the draft text, or try again."); }
        finally { copying.current = false; if (mounted.current) setCopyBusy(false); }
      }}>Copy settings draft</button>
      <p className="mem-muted">Save the draft as <span className="mem-mono">%APPDATA%\com.enouia.runtime\memory-providers.json</span>. In Sessions, choose Reload settings, then set the key and review a grant. Reloading does not send a request.</p>
    </>}
    {notice && <p role="status" className="mem-muted">{notice}</p>}
  </section>;
}
