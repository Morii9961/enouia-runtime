// R5 A1/A2: side-by-side comparisons on real data. Revision comparison reads
// Core's structural revision diff; conflict comparison shows the held pair.
// Highlighted spans are literal text differences only: nothing here judges
// meaning, picks a winner or changes a record.
import { useEffect, useState } from "react";
import { CATALOG_FILTER, catalogView, type CatalogItem, type RevisionDiff } from "./catalog";
import { useLatestRead } from "./hooks";
import { ErrorBox } from "./ui";
import { word } from "./catalogWords";
import { t } from "../i18n";

/** Mark the middle between the longest equal prefix and suffix (code points). */
function Marked({ text, other }: { text: string; other: string }) {
  const a = Array.from(text), b = Array.from(other);
  let prefix = 0, suffix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  while (suffix < a.length - prefix && suffix < b.length - prefix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix++;
  const middle = a.slice(prefix, a.length - suffix).join("");
  return <>{a.slice(0, prefix).join("")}{middle ? <mark>{middle}</mark> : null}{a.slice(a.length - suffix).join("")}</>;
}
const shown = (value: unknown) => value == null ? "—" : typeof value === "string" ? value : JSON.stringify(value);

export function RevisionCompare({ memoryId, revisions }: { memoryId: string; revisions: number[] }) {
  const sorted = [...revisions].sort((x, y) => x - y);
  const [before, setBefore] = useState(sorted[sorted.length - 2]);
  const [after, setAfter] = useState(sorted[sorted.length - 1]);
  const [diff, setDiff] = useState<RevisionDiff | null>(null);
  const reads = useLatestRead();
  useEffect(() => {
    setDiff(null);
    if (before === after) return;
    void reads.run(() => catalogView({ operation: "revision_diff", filter: CATALOG_FILTER, memory_id: memoryId, before, after }), setDiff);
  }, [memoryId, before, after, reads.run]);
  return <section className="mem-stack" aria-label={t("Revision comparison")} aria-busy={reads.busy}>
    <h4>{t("Revision comparison")}</h4>
    <p className="mem-row-meta">{t("Fields that differ between two saved revisions. Highlighted spans are literal text differences; they do not judge meaning.")}</p>
    <div className="mem-actions">
      <label className="mem-label">{t("Earlier")} <select className="mem-input" value={before} onChange={e => setBefore(Number(e.target.value))}>{sorted.map(r => <option key={r} value={r}>r{r}</option>)}</select></label>
      <label className="mem-label">{t("Later")} <select className="mem-input" value={after} onChange={e => setAfter(Number(e.target.value))}>{sorted.map(r => <option key={r} value={r}>r{r}</option>)}</select></label>
    </div>
    {before === after && <p className="mem-row-meta">{t("Choose two different revisions.")}</p>}
    {reads.busy && <p role="status">{t("Reading revisions…")}</p>}
    <ErrorBox error={reads.error} />
    {diff && (!diff.before ? <p role="status">{t("One of these revisions is no longer available in the current scope.")}</p> :
      diff.fields.length === 0 ? <p role="status">{t("No field differs between these revisions.")}</p> :
      <table className="mem-table" data-revision-diff>
        <thead><tr><th>{t("Field")}</th><th>r{diff.before.memory.revision}</th><th>r{diff.after!.memory.revision}</th></tr></thead>
        <tbody>{diff.fields.map(f => <tr key={f.field}>
          <td>{word(f.field)}</td>
          <td className="mem-content">{typeof f.before === "string" && typeof f.after === "string" ? <Marked text={f.before} other={f.after} /> : shown(f.before)}</td>
          <td className="mem-content">{typeof f.before === "string" && typeof f.after === "string" ? <Marked text={f.after} other={f.before} /> : shown(f.after)}</td>
        </tr>)}</tbody>
      </table>)}
  </section>;
}

export function ConflictCompare({ items, open }: { items: CatalogItem[]; open: (memoryId: string) => void }) {
  if (items.length < 2) return null;
  const [a, b] = items;
  return <section className="mem-stack" aria-label={t("Conflict comparison")}>
    <h4>{t("Conflict comparison")}</h4>
    <p className="mem-row-meta">{t("Both statements stay held. When each was learned does not decide which one is true.")}</p>
    <div className="mem-compare" data-conflict-compare>{[a, b].map((item, index) => <article key={item.base.memory.memory_id} className="mem-card mem-stack">
      <strong>{t(index === 0 ? "Statement A" : "Statement B")}</strong>
      <span className="mem-row-meta mem-content">{item.base.memory.memory_id} · r{item.base.memory.revision}</span>
      <span className="mem-content">{item.title}</span>
      <p className="mem-content"><Marked text={item.base.content} other={(index === 0 ? b : a).base.content} /></p>
      <span className="mem-row-meta">{word(item.base.knowledge)} · {word(item.base.adoption)}</span>
      <button type="button" className="mem-link" onClick={() => open(item.base.memory.memory_id)}>{t("Read this record")}</button>
    </article>)}</div>
    {items.length > 2 && <p className="mem-row-meta">{t("{n} more records are in this group.", { n: items.length - 2 })}</p>}
  </section>;
}
