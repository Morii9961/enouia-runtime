// Memory ADR-MEM-158: the ChatGPT connector writes through Memory's remote
// service, never through Runtime. Runtime only reads the capture windows that
// service opened and states plainly when nothing has connected yet.
import { useCallback, useEffect, useState } from "react";
import { catalogConnector, type ConnectorStatus as Status } from "./catalog";
import { describe } from "./client";
import { recordTimeText, word } from "./catalogWords";
import { t } from "../i18n";

const day = (at: string) => recordTimeText({ from: at, until: null, precision: "day", bound: "within", tz: null, basis: "source_time" });

export function ConnectorStatus() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const read = useCallback(async () => {
    setBusy(true); setError(null);
    try { setStatus(await catalogConnector()); }
    catch (cause) { setStatus(null); setError(describe(cause)); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void read(); }, [read]);
  return <section className="mem-stack mem-v2" aria-label={t("ChatGPT connector")} aria-busy={busy}>
    <div className="qr216"><span className="qr35">{t("ChatGPT connector")}</span><span className="mem-stack">
      {status && (status.windows.length === 0
        ? <span role="status">{t("Not connected: no capture window has been opened in this library yet.")}</span>
        : <span role="status">{t("{n} capture windows opened by the connector", { n: status.windows.length })}</span>)}
      <span className="mem-muted">{t("The connector runs in Memory's remote service, which is not deployed yet; connecting it waits for the new domain. Runtime only reads what it has written.")}</span>
      {status?.windows.map(w => <span key={w.policy_id} className="mem-row-meta">
        {t("Until {date} · up to {max} · {forms} · {unused} of {reserved} source slots left", { date: day(w.valid_until), max: word(w.max_sensitivity), forms: w.allowed_forms.map(word).join(" / "), unused: w.unused_sources, reserved: w.reserved_sources })}
      </span>)}
      {error && <span role="alert">{error}</span>}
      <span><button type="button" className="mem-link" disabled={busy} onClick={() => void read()}>{t("Read connector status again")}</button></span>
    </span></div>
  </section>;
}
