// Memory ADR-MEM-171/172: people and places named in memories. Each mention is
// a card; cards with the same type and name are linked automatically as a
// suggestion. Morii decides: the same one, not the same, or merge into another.
// Every decision is planned by Core first and written only after confirmation.
import { useCallback, useEffect, useState } from "react";
import { catalogAction, catalogIdentities, type EntityIdentities, type OwnerPreview } from "./catalog";
import { describe } from "./client";
import { Open } from "./RegisteredViews";
import { word } from "./catalogWords";
import { msg, t } from "../i18n";

const BASIS: Record<string, string> = { confirmed: msg("Confirmed as one"), same_name: msg("Linked by the same name · not confirmed"), single: msg("Single card") };
type Decision = { label: string; entities: string[]; same: boolean };

export function RegisteredPeople() {
  return <Open title={t("People and places")}>{() => <PeopleView />}</Open>;
}
function PeopleView() {
  const [data, setData] = useState<EntityIdentities | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [preview, setPreview] = useState<OwnerPreview | null>(null);
  const [mergeFrom, setMergeFrom] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async (work: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await work(); } catch (cause) { setError(describe(cause)); } finally { setBusy(false); }
  }, []);
  const load = useCallback(() => run(async () => setData(await catalogIdentities(200))), [run]);
  useEffect(() => { void load(); }, [load]);
  const plan = (next: Decision) => run(async () => {
    setNotice(null); setDecision(next); setMergeFrom(null);
    setPreview(await catalogAction({ operation: "plan_action", action: { action: "entity_identity", entities: next.entities, same: next.same, reason: null }, correction: null }));
  });
  const confirm = () => preview && run(async () => {
    await catalogAction({ operation: "confirm_action", operation_id: preview.plan.operation_id, plan_hash: preview.plan_hash, effects_hash: preview.effects_hash });
    setPreview(null); setDecision(null); setNotice(t("Written. The groups below are read again."));
    setData(await catalogIdentities(200));
  });
  const groups = data?.groups ?? [];
  const from = mergeFrom ? groups.flatMap(g => g.records).find(r => r.entity_id === mergeFrom) : null;
  const fromType = mergeFrom ? groups.find(g => g.records.some(r => r.entity_id === mergeFrom))?.entity_type : null;
  return <div className="qr45" aria-busy={busy}><div className="qr44 mem-pad mem-stack mem-v2">
    <h2 className="qr29">{t("People and places")}</h2>
    <p className="mem-row-meta">{t("Every mention of a person or place is its own card. Cards with the same type and name are linked automatically as a suggestion; you decide whether they are the same one. Each decision is planned first and written only after you confirm it, and can be changed later.")}</p>
    <button type="button" className="mem-button" disabled={busy} onClick={() => void load()}>{t("Read again")}</button>
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {data && <p className="mem-content">{t("{n} groups.", { n: data.total_groups })}{data.complete ? "" : ` ${t("Only the first groups are shown.")}`}</p>}
    {data && groups.length === 0 && <p className="mem-content">{t("No people or places are named in this library yet.")}</p>}
    {preview && decision && <section className="mem-card mem-stack" aria-label={t("Planned decision")}>
      <strong>{t("Planned decision: {decision}", { decision: decision.label })}</strong>
      <span className="mem-row-meta">{t("{n} cards · records affected {affected} · original sources kept", { n: decision.entities.length, affected: preview.affected_count_in_scope })}</span>
      <span className="mem-actions"><button type="button" className="mem-button mem-danger" disabled={busy} onClick={() => void confirm()}>{t("Confirm and write")}</button>
        <button type="button" className="mem-link" disabled={busy} onClick={() => { setPreview(null); setDecision(null); }}>{t("Cancel")}</button></span>
    </section>}
    {from && <section className="mem-card mem-stack" aria-label={t("Merge into another group")}>
      <strong>{t("Merge {name} into…", { name: from.display_name })}</strong>
      <ul className="mem-list">{groups.filter(g => g.entity_type === fromType && !g.records.some(r => r.entity_id === mergeFrom)).map(g => <li key={g.records[0].entity_id}>
        <button type="button" className="mem-link" disabled={busy || !!preview} onClick={() => void plan({ label: t("Merge {name} into {target}", { name: from.display_name, target: g.name }), entities: [from.entity_id, g.records[0].entity_id], same: true })}>{g.name}</button>
        <span className="mem-row-meta"> · {t(BASIS[g.basis] ?? g.basis)} · {t("{n} cards", { n: g.records.length })}</span></li>)}</ul>
      <button type="button" className="mem-link" onClick={() => setMergeFrom(null)}>{t("Cancel")}</button>
    </section>}
    <ul className="mem-list" data-identity-groups>{groups.map(g => <li key={g.records[0]?.entity_id ?? g.name} className="mem-stack" data-basis={g.basis}>
      <strong>{g.name} <span className="mem-row-meta">· {word(g.entity_type)} · {t(BASIS[g.basis] ?? g.basis)}</span></strong>
      <ul className="mem-list">{g.records.map(r => <li key={r.entity_id}>
        <span className="mem-content">{r.display_name}</span>
        <span className="mem-row-meta"> · {t("{n} memories", { n: r.memories })}{r.opted_out ? ` · ${t("kept separate")}` : ""} · <code>{r.entity_id}</code></span>
        {g.records.length > 1 && <button type="button" className="mem-link" disabled={busy || !!preview} onClick={() => void plan({ label: t("{name} is not the same", { name: r.display_name }), entities: [r.entity_id, g.records.find(o => o.entity_id !== r.entity_id)!.entity_id], same: false })}>{t("Not the same…")}</button>}
        {g.basis === "single" && <button type="button" className="mem-link" disabled={busy || !!preview} onClick={() => setMergeFrom(r.entity_id)}>{t("Merge into…")}</button>}
      </li>)}</ul>
      {g.basis === "same_name" && g.records.length > 1 && <span className="mem-actions"><button type="button" className="mem-button" disabled={busy || !!preview}
        onClick={() => void plan({ label: t("{name}: the same one", { name: g.name }), entities: g.records.map(r => r.entity_id), same: true })}>{t("Confirm they are the same…")}</button></span>}
    </li>)}</ul>
  </div></div>;
}
