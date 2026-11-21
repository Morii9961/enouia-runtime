// ADR-039: native corrections on the registered library. Every action is
// planned by Core first (nothing written), shown in full, and committed only
// when Morii clicks Confirm on that exact plan. An unknown publication is
// looked up by its original operation, never planned or confirmed again.
import { useEffect, useState } from "react";
import { CATALOG_FILTER, catalogAction, catalogView, type CatalogDetail, type CorrectionFields, type FacetGroup, type OwnerAction, type OwnerOutcome, type OwnerPreview, type TargetRef, type ThemeMembers } from "./catalog";
import { describe } from "./client";
import { recordTimeText, word } from "./catalogWords";
import { msg, t } from "../i18n";

type Kind = "correct" | "withdraw" | "forget" | "protect" | "pin" | "theme_rename" | "theme_pin" | "theme_dissolve" | "entity_merge" | "entity_split";
const LABELS: Record<Kind, string> = {
  correct: msg("Correct…"), withdraw: msg("Withdraw…"), forget: msg("Forget…"), protect: msg("Protect"), pin: msg("Pin"),
  theme_rename: msg("Rename theme…"), theme_pin: msg("Pin theme"), theme_dissolve: msg("Dissolve theme…"),
  entity_merge: msg("Merge entity…"), entity_split: msg("Split entity…"),
};
const SENSITIVITIES = ["public", "normal", "private", "highly_sensitive"];
const INTERPRETATIONS = ["clear_self_report", "inference", "ambiguous", "conflicting"];
const NEW_SOURCE = "src_00000000-0000-4000-8000-000000000000"; // Core replaces it with a fresh native ID.

export function CorrectionPanel({ detail, entities }: { detail: CatalogDetail; entities: FacetGroup["values"] }) {
  const item = detail.item!;
  const evidence = detail.fields?.evidence ?? [];
  const target: TargetRef | undefined = detail.history?.find(h => h.memory.memory.revision === item.base.memory.revision)?.memory;
  const theme = item.base.dimensions.kind === "theme";
  const mine = item.entities ?? [];
  const [kind, setKind] = useState<Kind | null>(null);
  const [text, setText] = useState(item.base.content);
  const [fields, setFields] = useState<CorrectionFields>({ title: item.title, content_lang: item.content_lang, sensitivity: item.effective_sensitivity ?? "private", interpretation: "clear_self_report" });
  const [reason, setReason] = useState("");
  const [name, setName] = useState(item.title);
  const [fromEntity, setFromEntity] = useState(mine[0]?.entity_id ?? "");
  const [intoEntity, setIntoEntity] = useState("");
  const [quotes, setQuotes] = useState<number[]>([]);
  const [members, setMembers] = useState<ThemeMembers | null>(null);
  const [preview, setPreview] = useState<OwnerPreview | null>(null);
  const [outcome, setOutcome] = useState<OwnerOutcome | null>(null);
  const [unknown, setUnknown] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!theme) return;
    void catalogView({ operation: "theme_members", filter: CATALOG_FILTER, theme: item.base.memory.memory_id, cursor: null, limit: 100 }).then(setMembers, cause => setError(describe(cause)));
  }, [theme, item.base.memory.memory_id]);
  if (!target) return null;
  const choose = (next: Kind) => { setKind(next); setPreview(null); setOutcome(null); setError(null); };
  const action = (): OwnerAction | null => {
    const memberRefs = members?.items.map(m => m.memory) ?? [];
    switch (kind) {
      case "correct": return text.trim() ? { action: "correct", target, source_id: NEW_SOURCE, assertion_text: text } : null;
      case "withdraw": return { action: "withdraw", target, reason: reason.trim() || null };
      case "forget": return { action: "forget", target, impact_preview_hash: "0".repeat(64) };
      case "protect": case "pin": return { action: "attention", target, annotation: kind, until: null };
      case "theme_rename": return name.trim() ? { action: "theme_rename", theme: target, name, members: memberRefs } : null;
      case "theme_pin": case "theme_dissolve": return { action: kind, theme: target, members: memberRefs };
      case "entity_merge": return fromEntity && intoEntity && fromEntity !== intoEntity ? { action: "entity_merge", from_entity: fromEntity, into_entity: intoEntity, reason: reason.trim() || null } : null;
      case "entity_split": return fromEntity && intoEntity && fromEntity !== intoEntity && quotes.length ? { action: "entity_split", from_entity: fromEntity, into_entity: intoEntity, evidence: quotes.map(i => evidence[i]), reason: reason.trim() || null } : null;
      default: return null;
    }
  };
  const plan = async () => {
    const next = action();
    if (!next || busy) return;
    setBusy(true); setError(null); setPreview(null);
    try { setPreview(await catalogAction({ operation: "plan_action", action: next, correction: kind === "correct" ? fields : null })); }
    catch (cause) { setError(describe(cause)); }
    finally { setBusy(false); }
  };
  const confirm = async () => {
    if (!preview || busy) return;
    setBusy(true); setError(null);
    try {
      setOutcome(await catalogAction({ operation: "confirm_action", operation_id: preview.plan.operation_id, plan_hash: preview.plan_hash, effects_hash: preview.effects_hash }));
      setPreview(null);
    } catch (cause) {
      if (cause === "correction_outcome_unknown") setUnknown(preview.plan.operation_id);
      setPreview(null); setError(describe(cause));
    } finally { setBusy(false); }
  };
  const lookup = async () => {
    if (!unknown || busy) return;
    setBusy(true); setError(null);
    try { const found = await catalogAction({ operation: "action_outcome", operation_id: unknown }); if (found.outcome) { setOutcome(found.outcome); setUnknown(null); } else setError(t("No committed result was found for this operation yet.")); }
    catch (cause) { setError(describe(cause)); }
    finally { setBusy(false); }
  };
  const kinds: Kind[] = theme ? ["theme_rename", "theme_pin", "theme_dissolve", "withdraw"] :
    ["correct", "withdraw", "forget", "protect", "pin", ...(entities.length > 1 && mine.length ? ["entity_merge", "entity_split"] as Kind[] : [])];
  const label = (id: string) => entities.find(e => e.value === id)?.label ?? t("Unnamed entity");
  return <section className="mem-stack" aria-label={t("Change this record")} aria-busy={busy}>
    <h4>{t("Change this record")}</h4>
    <p className="mem-row-meta">{t("Each change is planned first and written only after you confirm the plan below. Original sources are kept; nothing is physically deleted.")}</p>
    <div className="mem-actions">{kinds.map(k => <button key={k} type="button" className="mem-button" aria-pressed={kind === k} disabled={busy || !!unknown} onClick={() => choose(k)}>{t(LABELS[k])}</button>)}</div>
    {kind && !preview && !outcome && <form className="mem-stack" onSubmit={event => { event.preventDefault(); void plan(); }}>
      {kind === "correct" && <>
        <label className="mem-label">{t("What is true instead")} <textarea className="mem-input" rows={4} maxLength={16384} value={text} onChange={e => setText(e.target.value)} /></label>
        <label className="mem-label">{t("Title")} <input className="mem-input" maxLength={60} value={fields.title} onChange={e => setFields({ ...fields, title: e.target.value })} /></label>
        <label className="mem-label">{t("Language")} <input className="mem-input" value={fields.content_lang} onChange={e => setFields({ ...fields, content_lang: e.target.value })} /></label>
        <label className="mem-label">{t("Sensitivity")} <select className="mem-input" value={fields.sensitivity} onChange={e => setFields({ ...fields, sensitivity: e.target.value })}>{SENSITIVITIES.map(s => <option key={s} value={s}>{word(s)}</option>)}</select></label>
        <label className="mem-label">{t("Interpretation")} <select className="mem-input" value={fields.interpretation} onChange={e => setFields({ ...fields, interpretation: e.target.value })}>{INTERPRETATIONS.map(s => <option key={s} value={s}>{word(s)}</option>)}</select></label>
        <p className="mem-row-meta">{t("The corrected record keeps this record's kind; its event and validity times start as not recorded.")}</p>
      </>}
      {(kind === "withdraw" || kind === "entity_merge" || kind === "entity_split") && <label className="mem-label">{t("Reason (optional)")} <input className="mem-input" maxLength={500} value={reason} onChange={e => setReason(e.target.value)} /></label>}
      {kind === "forget" && <p role="note" className="mem-content">{t("Forget stops this record and everything derived from it from being read. The original sources stay in the library.")}</p>}
      {kind === "theme_rename" && <label className="mem-label">{t("New theme name")} <input className="mem-input" maxLength={60} value={name} onChange={e => setName(e.target.value)} /></label>}
      {(kind === "entity_merge" || kind === "entity_split") && <>
        <label className="mem-label">{t("From entity")} <select className="mem-input" value={fromEntity} onChange={e => setFromEntity(e.target.value)}>{mine.map(e => <option key={e.entity_id} value={e.entity_id}>{label(e.entity_id)}</option>)}</select></label>
        <label className="mem-label">{t("Into entity")} <select className="mem-input" value={intoEntity} onChange={e => setIntoEntity(e.target.value)}><option value="">—</option>{entities.filter(e => e.value !== fromEntity).map(e => <option key={e.value} value={e.value}>{e.label}</option>)}</select></label>
      </>}
      {kind === "entity_split" && <fieldset className="mem-stack"><legend className="mem-label">{t("Quotes that refer to the other entity")}</legend>
        {evidence.map((q, i) => <label key={i} className="mem-content"><input type="checkbox" checked={quotes.includes(i)} onChange={e => setQuotes(e.target.checked ? [...quotes, i] : quotes.filter(n => n !== i))} /> {q.quote}</label>)}</fieldset>}
      <div className="mem-actions"><button className="mem-button" disabled={busy || !action()}>{t("Preview change")}</button><button type="button" className="mem-link" onClick={() => setKind(null)}>{t("Cancel")}</button></div>
    </form>}
    {busy && <p role="status">{t(preview ? "Writing the confirmed change…" : "Planning the change…")}</p>}
    {error && <p role="alert">{error}</p>}
    {preview && <section className="mem-card mem-stack" aria-label={t("Planned change")}>
      <h5>{t("Planned change: {action}", { action: t(LABELS[kind!]) })}</h5>
      <dl className="mem-facts">
        <dt>{t("Records affected")}</dt><dd>{preview.affected_count_in_scope}</dd>
        <dt>{t("Sensitivity")}</dt><dd>{word(preview.sensitivity)}</dd>
        <dt>{t("Original sources")}</dt><dd>{t(preview.original_sources_retained ? "kept" : "not kept")}</dd>
        <dt>{t("Physical deletion")}</dt><dd>{t("none")}</dd>
        {preview.plan.expires_at && <><dt>{t("Plan expires")}</dt><dd>{recordTimeText({ from: preview.plan.expires_at, until: null, precision: "minute", bound: "within", tz: null, basis: "source_time" })}</dd></>}
        {preview.proposed_correction?.input?.content && <><dt>{t("New content")}</dt><dd className="mem-content">{preview.proposed_correction.input.content}</dd></>}
      </dl>
      <div className="mem-actions"><button type="button" className="mem-button mem-danger" disabled={busy} onClick={() => void confirm()}>{t("Confirm and write")}</button>
        <button type="button" className="mem-link" disabled={busy} onClick={() => setPreview(null)}>{t("Cancel")}</button></div>
    </section>}
    {unknown && <div className="mem-stack"><p role="alert">{t("The write may or may not have been committed. Check its result; do not repeat the change.")}</p>
      <button type="button" className="mem-button" disabled={busy} onClick={() => void lookup()}>{t("Check result")}</button></div>}
    {outcome && <p role="status" className="mem-content">{t("Written: {action} in commit {commit}. The list reloads with the new library state.", { action: outcome.action, commit: outcome.committed_in })}</p>}
  </section>;
}
