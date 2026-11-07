import { useCallback, useEffect, useRef, useState } from "react";
import { CATALOG_FILTER, catalogRead, catalogSelectionKey, catalogScopeKey, type CatalogCursor, type CatalogPage, type CatalogStats, type CatalogStatus } from "./catalog";
import { describe } from "./client";
import { useLatestRead } from "./hooks";
import { ErrorBox, Tag, shortId } from "./ui";
import { t } from "../i18n";

export function CatalogMemory({ read = catalogRead }: { read?: typeof catalogRead }) {
  const [status, setStatus] = useState<CatalogStatus | null>(null);
  const [page, setPage] = useState<CatalogPage | null>(null);
  const [stats, setStats] = useState<CatalogStats | null>(null);
  const [draft, setDraft] = useState("");
  const [filter, setFilter] = useState(CATALOG_FILTER);
  const [observationError, setObservationError] = useState<{ cause: unknown } | null>(null);
  const reads = useLatestRead();
  const observedScope = useRef<string | null>(null);
  const epoch = useRef(0);
  const controlling = useRef(false);
  const clear = useCallback(() => { reads.clear(); setPage(null); setStats(null); }, [reads.clear]);
  const load = useCallback((cursor: CatalogCursor | null = null) => {
    setPage(null); setStats(null);
    return reads.run(async () => {
      const next = await read({ operation: "page", filter, cursor, limit: 2 });
      const counts = await read({ operation: "stats", filter, selection: next.selection });
      if (catalogScopeKey(next.selection) !== observedScope.current || catalogSelectionKey(next.selection) !== catalogSelectionKey(counts.selection) || counts.matched_in_scope !== next.matched_in_scope) throw "catalog_response_unsupported";
      return { next, counts };
    }, ({ next, counts }) => { setPage(next); setStats(counts); }, () => { setPage(null); setStats(null); });
  }, [read, filter, reads.run]);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const current = epoch.current;
      try {
        if (controlling.current) return;
        const next = await read({ operation: "status" });
        if (stopped || controlling.current || current !== epoch.current) return;
        setStatus(next); setObservationError(null);
        const scope = next.state === "open" && next.selection ? catalogScopeKey(next.selection) : null;
        if (scope === null) { observedScope.current = null; clear(); }
        else if (scope !== observedScope.current) { clear(); observedScope.current = scope; await load(); }
      } catch (cause) {
        if (!stopped && !controlling.current && current === epoch.current) {
          setStatus(null); setObservationError({ cause });
          if (cause !== "catalog_busy") { observedScope.current = null; clear(); }
        }
      } finally { if (!stopped) timer = setTimeout(poll, 1500); }
    };
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [read, load, clear]);
  const control = async (operation: "lock" | "unlock") => {
    if (controlling.current) return;
    controlling.current = true; epoch.current += 1; observedScope.current = null;
    clear(); setStatus(null);
    try { await reads.run(() => read({ operation }), setStatus); }
    finally { controlling.current = false; epoch.current += 1; }
  };
  const open = status?.state === "open";
  return <>
    <div className="qr45" aria-busy={reads.busy}>
      <div className="qr31"><h2 className="qr29">{t("Segmented synthetic catalog")}</h2><Tag tone="warn">{t("Isolated synthetic read-2")}</Tag></div>
      <div className="qr44 mem-pad">
        <p className="mem-content">{t("This library contains fixed fictional records. It does not open an Owner Vault or run continuous formation.")}</p>
        {observationError && <p role="alert">{describe(observationError.cause)}</p>}
        <ErrorBox error={reads.error} />
        <p role="status">{status ? t("Library: {state}", { state: status.state }) : observationError ? t("Library state is unknown.") : t("Reading library state…")}</p>
        {open && reads.busy && <p role="status">{t("Reading catalog page and statistics…")}</p>}
        {status?.state === "disabled" && <p className="mem-content">{t("No segmented synthetic library is enabled in this session.")}</p>}
        {status?.state === "failed" && <p className="mem-content">{t("The synthetic library is unavailable. Start a new synthetic session to recover.")}</p>}
          <form className="mem-stack" role="search" onSubmit={event => { event.preventDefault(); if (!open || reads.pending.current) return; epoch.current += 1; observedScope.current = null; clear(); setFilter({ ...CATALOG_FILTER, text: draft }); }}>
            <label className="mem-label">{t("Literal catalog search")} <input className="mem-input" value={draft} maxLength={512} autoComplete="off" onChange={event => setDraft(event.target.value)} /></label>
            <button className="mem-button" disabled={!open || reads.busy}>{t("Search catalog")}</button>
          </form>
        {open && <button className="mem-button" disabled={reads.busy} onClick={() => void load()}>{t("Refresh catalog")}</button>}
        {(open || status?.state === "locked") && <button className="mem-button" disabled={reads.busy} onClick={() => void control(open ? "lock" : "unlock")}>{t(open ? "Lock synthetic library" : "Unlock synthetic library")}</button>}
        {open && page && stats && <>
          <p className="mem-content">{t("{shown} shown · {matched} matching authorized records", { shown: page.items.length, matched: stats.matched_in_scope })}</p>
          <p className="mem-content">{t("Counts cover currently authorized machine revisions for this selection.")}</p>
          <p className="mem-content">{t("{unknown} records have unknown event dates in this filter scope.", { unknown: page.unknown_time_in_scope })}</p>
          <p className="mem-content">{t("State observed at {time}", { time: page.authorized_at })}</p>
          <ul className="mem-list">{page.items.map(item => <li key={`${item.base.memory.memory_id}:${item.base.memory.revision}`}>
            <h3 className="mem-content">{item.title}</h3><p className="mem-content">{item.base.content}</p>
            <p className="mem-content">{t("{kind} · {knowledge} · System {adoption} · validity {validity} · attention {attention}", { kind: item.base.dimensions.kind, knowledge: item.base.knowledge, adoption: item.base.adoption, validity: item.base.validity, attention: item.base.attention })}</p>
            <p className="mem-row-meta">{shortId(item.base.memory.memory_id)} · r{item.base.memory.revision} · {item.content_lang}</p>
          </li>)}</ul>
          {page.items.length === 0 && !page.next && <p className="mem-content">{t(filter.text ? "No authorized record matches this search. Search with an empty field to see the whole catalog." : "This synthetic catalog has no records in the current authorized scope.")}</p>}
          {page.next && <button className="mem-button" disabled={reads.busy} onClick={() => void load(page.next)}>{t("Next catalog page")}</button>}
        </>}
      </div>
    </div>
    <aside className="qr88" aria-label={t("Automatic Memory Inspector")}><div className="qr79"><p className="mem-content">{t(open && page && stats ? "Page statistics were read for the same selection." : "No catalog page is currently observed.")}</p><p className="mem-content">{t("System formation preserves what the synthetic subject said. It is not independent verification or Owner confirmation.")}</p></div></aside>
  </>;
}
