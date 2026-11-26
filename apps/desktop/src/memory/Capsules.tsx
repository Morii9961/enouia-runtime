// Memory ADR-MEM-173: saved recall previews (Capsules). Saving is off until
// Morii turns it on in Settings; each save or delete is planned by Core and
// written only on confirmation. Scores and reasons are not stored: running a
// Capsule again re-runs the recall preview with its cue.
import { useCallback, useEffect, useState } from "react";
import { catalogAction, catalogCapsulePlan, catalogCapsules, type OwnerPreview, type RecallPreview, type SavedCapsules, type TargetRef } from "./catalog";
import { describe } from "./client";
import { t } from "../i18n";

function usePlanConfirm(after: () => void) {
  const [preview, setPreview] = useState<OwnerPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const act = async (work: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await work(); } catch (cause) { setError(describe(cause)); } finally { setBusy(false); }
  };
  const plan = (name: string, query: string, members: TargetRef[]) =>
    act(async () => setPreview(await catalogCapsulePlan(name, query, members)));
  const confirm = () => preview && act(async () => {
    await catalogAction({ operation: "confirm_action", operation_id: preview.plan.operation_id, plan_hash: preview.plan_hash, effects_hash: preview.effects_hash });
    setPreview(null); after();
  });
  return { preview, setPreview, busy, error, plan, confirm };
}

export function SaveCapsule({ query, preview, saved }: { query: string; preview: RecallPreview; saved: () => void }) {
  const [name, setName] = useState(Array.from(query.trim()).slice(0, 40).join("") || t("Recall preview"));
  const [done, setDone] = useState(false);
  const flow = usePlanConfirm(() => { setDone(true); saved(); });
  // Memory ADR-MEM-175: full references, in the same order as the trace.
  const members = preview.selected_targets;
  return <section className="mem-stack" aria-label={t("Save as Capsule")}>
    <label className="mem-label">{t("Capsule name")} <input className="mem-input" maxLength={60} value={name} onChange={e => { setName(e.target.value); setDone(false); }} /></label>
    {!flow.preview && <button type="button" className="mem-button" disabled={flow.busy || !name.trim() || members.length === 0}
      onClick={() => void flow.plan(name.trim(), query, members)}>{t("Save as Capsule…")}</button>}
    {flow.preview && <span className="mem-card mem-stack" aria-label={t("Planned Capsule")}>
      <strong>{t("Planned Capsule: {name}", { name })}</strong>
      <span className="mem-row-meta">{t("{n} records in this order. Saving again under the same name replaces it.", { n: members.length })}</span>
      <span className="mem-actions"><button type="button" className="mem-button mem-danger" disabled={flow.busy} onClick={() => void flow.confirm()}>{t("Confirm and write")}</button>
        <button type="button" className="mem-link" disabled={flow.busy} onClick={() => flow.setPreview(null)}>{t("Cancel")}</button></span>
    </span>}
    {done && <p role="status">{t("Saved.")}</p>}
    {flow.error && <p role="alert">{flow.error}</p>}
  </section>;
}

export function CapsuleIndex({ use, refresh }: { use: (query: string) => void; refresh: number }) {
  const [data, setData] = useState<SavedCapsules | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => { catalogCapsules().then(setData, cause => setError(describe(cause))); }, []);
  useEffect(() => { load(); }, [load, refresh]);
  const flow = usePlanConfirm(load);
  const [removing, setRemoving] = useState<string | null>(null);
  return <section className="mem-stack" aria-label={t("Saved Capsules")}>
    <h3>{t("Saved Capsules")}</h3>
    {error && <p role="alert">{error}</p>}
    {data && !data.saving_enabled && <p className="mem-row-meta">{t("Saving Capsules is off. You can turn it on in Settings; until then nothing is saved.")}</p>}
    {data && data.capsules.length === 0 && <p className="mem-content">{t("No saved Capsules.")}</p>}
    <ul className="mem-list" data-capsules>{data?.capsules.map(c => {
      const gone = c.members.filter(m => !m.current).length;
      return <li key={c.name} className="mem-stack">
        <strong>{c.name}</strong>
        <span className="mem-row-meta mem-content">{t("Cue: {query}", { query: c.query || "—" })}</span>
        <span className="mem-row-meta">{t("{n} records", { n: c.members.length })}{gone ? ` · ${t("{n} no longer readable", { n: gone })}` : ""}</span>
        <span className="mem-actions">
          <button type="button" className="mem-link" onClick={() => use(c.query)}>{t("Run this cue again")}</button>
          {data.saving_enabled && <button type="button" className="mem-link" disabled={flow.busy || !!flow.preview} onClick={() => { setRemoving(c.name); void flow.plan(c.name, c.query, []); }}>{t("Delete…")}</button>}
        </span>
        {flow.preview && removing === c.name && <span className="mem-card mem-stack">
          <strong>{t("Planned: delete {name}", { name: c.name })}</strong>
          <span className="mem-actions"><button type="button" className="mem-button mem-danger" disabled={flow.busy} onClick={() => void flow.confirm()}>{t("Confirm and write")}</button>
            <button type="button" className="mem-link" disabled={flow.busy} onClick={() => flow.setPreview(null)}>{t("Cancel")}</button></span>
        </span>}
      </li>;
    })}</ul>
    {flow.error && <p role="alert">{flow.error}</p>}
  </section>;
}

export function CapsuleSavingSetting() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { catalogCapsules().then(d => setEnabled(d.saving_enabled), cause => setError(describe(cause))); }, []);
  const set = (next: boolean) => catalogCapsules(next).then(d => setEnabled(d.saving_enabled), cause => setError(describe(cause)));
  return <div className="qr216"><span className="qr35">{t("Saved Capsules")}</span><span className="mem-stack mem-v2">
    <span className="mem-muted">{t("Off by default. When on, a recall preview can be saved as a named Capsule after you confirm its plan. Saving writes to the library.")}</span>
    {enabled !== null && <span className="mem-actions" role="group" aria-label={t("Saving Capsules")}>
      <button type="button" className="mem-button" aria-pressed={!enabled} onClick={() => void set(false)}>{t("Off")}</button>
      <button type="button" className="mem-button" aria-pressed={enabled} onClick={() => void set(true)}>{t("On")}</button></span>}
    {error && <span role="alert">{error}</span>}
  </span></div>;
}
