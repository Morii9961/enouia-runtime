import React from "react";
import type { DemoView } from "../App";
import type { WorkspaceId } from "./automemory/types";

import { msg, t } from '../i18n/index.ts';
// The preview is a separate chunk: it only loads when someone opens it, which keeps the main script small.
const AutoMemory = React.lazy(() => import("./automemory/AutoMemory"));

const WORKSPACES: { id: WorkspaceId; label: string }[] = [
  { id: 'memories', label: msg('Memories') }, { id: 'time', label: msg('Time') },
  { id: 'relations', label: msg('Connections') }, { id: 'formation', label: msg('Formation') },
  { id: 'recall', label: msg('Recall') },
];

const demoParams = new URLSearchParams(globalThis.location?.search);
const initialWorkspace = WORKSPACES.find(w => w.id === demoParams.get('auto-workspace'))?.id ?? 'memories';

export default function Memory({ view }: { view: DemoView }) {
  // Browser demo only: a synthetic design preview of automatic memory. Local state, nothing stored.
  const [workspace, setWorkspace] = React.useState<WorkspaceId>(initialWorkspace);
  const [memoryView, setMemoryView] = React.useState<'vault' | 'grid'>(demoParams.has('auto-dataset') ? 'grid' : 'vault');
  const preview = workspace !== 'memories' || memoryView === 'grid';
  const { act, colCount, colTitle, collections, copyLabel, draft, editing, groups, hasNotice, noSel, notEditing, notice, onDraft, onQuery, q, sel, timelineEmpty } = view;
  return (
<section data-screen-label="Memory Vault" className="memory-region">
  <nav className="am-views memory-workspace-nav" aria-label={t("Memory workspaces")}>
    {WORKSPACES.map(w => <button key={w.id} type="button" className="am-view" data-memory-workspace={w.id}
      aria-current={workspace === w.id ? 'page' : undefined} onClick={() => setWorkspace(w.id)}><span className="am-vn">{t(w.label)}</span></button>)}
  </nav>
  {workspace === 'memories' ? <div className="am-views memory-view-nav" role="group" aria-label={t("Memory workspace views")}>
    <button type="button" className="am-view" data-memory-view="grid" aria-pressed={memoryView === 'grid'} onClick={() => setMemoryView('grid')}><span className="am-vn">{t("Memory grid")}</span></button>
    <button type="button" className="am-view" data-memory-view="vault" aria-pressed={memoryView === 'vault'} onClick={() => setMemoryView('vault')}><span className="am-vn">{t("Vault list · owner review compatibility")}</span></button>
  </div> : null}
  <div className="memory-region-body">
  {preview ? <React.Suspense fallback={<section className="am-loading" aria-busy="true"><p>{t("Loading the synthetic preview…")}</p></section>}><AutoMemory workspace={workspace} /></React.Suspense> : (
<section className="qr89">
<aside className="qr28">
<div className="qr20">
<h1 className="qr18">
{t("Memory Vault")}
</h1>
<div className="qr19">
{t("What I keep, and why.")}
</div>
</div>
<label className="qr22">
<svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ stroke: 'var(--ink-2)' }} strokeWidth="1.2">
<circle cx="6" cy="6" r="4.2">

</circle>
<path d="M9.2 9.2L12.5 12.5">

</path>
</svg>
<input value={q} onChange={onQuery} placeholder={t("Literal search")} aria-label={t("Search memories")} className="qr21" />
</label>
{collections.map((grp, grpIndex) => <React.Fragment key={grpIndex}>
<div className="qr27">
<div className="qr23">
{grp.label}
</div>
{grp.items.map((c, cIndex) => <React.Fragment key={c.key}>
<button onClick={c.onClick} aria-pressed={c.active} className="qr26" type="button">
<span className="qr24">
{c.label}
</span>
<span className="qr25" data-waiting={c.key === 'candidates' && c.count > 0 ? 'true' : undefined}>
{c.count}
</span>
</button>
</React.Fragment>)}
</div>
</React.Fragment>)}
</aside>
<div className="qr45">
<div className="qr31">
<div className="qr29">
{colTitle}
</div>
<div className="qr19">
{colCount}
</div>
<div className="qr30">

</div>
<div className="qr19">
{t("Newest first · ↑ ↓ to move")}
</div>
</div>
<div className="qr44">
{timelineEmpty ? <>
<div className="qr32">
{q ? t("Nothing here matches. No reading on this strip for that text.") : t("No records here yet.")}
</div>
</> : null}
{groups.map((g, gIndex) => <React.Fragment key={g.key}>
<div>
<div className="qr33">
{g.label}
</div>
{g.items.map((m, mIndex) => <React.Fragment key={m.key}>
<button onClick={m.onClick} aria-pressed={m.selected} className="qr43" data-status={m.status} type="button">
<span className="qr34">
{m.time}
</span>
<span className="qr42">
<span className="qr38">
<span>
{m.kindLabel}
</span>
{m.hasProject ? <>
<span className="qr35">
· {m.projectName}
</span>
</> : null}
{m.showStatus ? <>
<span className="qr37" data-status={m.status}>
{m.statusLabel}
</span>
</> : null}
</span>
<span className="qr39">
{m.content}
</span>
<span className="qr41">
<span>
{m.sourceLabel}
</span>
<span className="qr25">
{m.sourceRef}
</span>
{m.hasConf ? <>
<span className="qr25">
{t("conf {n}", { n: m.conf })}
</span>
</> : null}
{m.showId ? <>
<span className="qr40">
{m.idShort}
</span>
</> : null}
</span>
</span>
</button>
</React.Fragment>)}
</div>
</React.Fragment>)}
</div>
</div>
<aside aria-label={t("Memory Inspector")} className="qr88">
{noSel ? <>
<div className="qr46">
{t("Select a memory to see where it came from.")}
</div>
</> : null}
{sel ? <>
<div className="qr79">
<div className="qr54">
<div className="qr50">
<span className="qr48" data-status={sel.status}>
{sel.statusLabel}
</span>
<span className="qr9">
{sel.kindLabel}
</span>
<div className="qr30">

</div>
<button onClick={sel.copy} className="qr49" type="button">
{copyLabel}
</button>
</div>
<div className="qr51">
{sel.id}
</div>
{notEditing ? <>
<div className="qr52">
{sel.content}
</div>
</> : null}
{editing ? <>
<textarea value={draft} onChange={onDraft} aria-label={t("Memory content")} rows={5} className="qr53">

</textarea>
<div className="qr19">
{sel.editHint}
</div>
</> : null}
</div>
{sel.hasDecisions ? <>
<div className="qr15">
<div className="qr55">
{t("Decisions")}
</div>
{sel.decisions.map((d, dIndex) => <React.Fragment key={dIndex}>
<div className="qr57">
<span className="qr56">
—
</span>
<span>
{d}
</span>
</div>
</React.Fragment>)}
</div>
</> : null}
{sel.isCheckpoint ? <>
<div className="qr15">
<div className="qr55">
{t('Last state')} · {sel.coveredText}
</div>
<div className="qr58">
{sel.lastState}
</div>
</div>
</> : null}
{sel.hasLoops ? <>
<div className="qr15">
<div className="qr55">
{t("Open loops")}
</div>
{sel.openLoops.map((o, oIndex) => <React.Fragment key={oIndex}>
<div className="qr57">
<span className="qr59">

</span>
<span>
{o}
</span>
</div>
</React.Fragment>)}
</div>
</> : null}
<div className="qr66">
<div className="qr55">
{t("Why I remember this")}
</div>
<div className="qr60">
{sel.why}
</div>
<div className="qr65">
{sel.provRows.map((r, rIndex) => <React.Fragment key={r.k}>
<div className="qr64">
<span className="qr35">
{r.k}
</span>
{r.isPlain ? <>
<span className="qr61">
{r.v}
</span>
</> : null}
{r.isMono ? <>
<span className="qr62">
{r.v}
</span>
</> : null}
{r.isLink ? <>
<button onClick={r.onClick} className="qr63" type="button">
{r.v}
</button>
</> : null}
</div>
</React.Fragment>)}
</div>
</div>
<div className="qr66">
<div className="qr55">
{t("Record")}
</div>
<div className="qr65">
{sel.recRows.map((r, rIndex) => <React.Fragment key={r.k}>
<div className="qr64">
<span className="qr35">
{r.k}
</span>
{r.isPlain ? <>
<span className="qr61">
{r.v}
</span>
</> : null}
{r.isMono ? <>
<span className="qr62">
{r.v}
</span>
</> : null}
{r.isLink ? <>
<button onClick={r.onClick} className="qr63" type="button">
{r.v}
</button>
</> : null}
</div>
</React.Fragment>)}
{sel.hasConf ? <>
<div className="qr70">
<span className="qr35">
{t("Confidence")}
</span>
<span className="qr50">
<span className="qr67">
{sel.conf}
</span>
<span className="qr69">
<span className="qr68" style={{"width": sel.confPct}}>

</span>
</span>
</span>
</div>
</> : null}
</div>
</div>
<div className="qr66">
<div className="qr55">
{t("Lineage")}
</div>
{sel.lineRows.map((r, rIndex) => <React.Fragment key={r.k}>
<div className="qr64">
<span className="qr35">
{r.k}
</span>
{r.isPlain ? <>
<span className="qr35">
{r.v}
</span>
</> : null}
{r.isLink ? <>
<button onClick={r.onClick} className="qr73" type="button">
<span className="qr71">
{r.v}
</span>
<span className="qr72">
{r.sub}
</span>
</button>
</> : null}
</div>
</React.Fragment>)}
<div className="qr75">
{t("Related")}{' '}
<span className="qr74">
{t("· shared project or tag")}
</span>
</div>
{sel.noRelated ? <>
<div className="qr76">
{t("No related records.")}
</div>
</> : null}
<div className="qr65">
{sel.related.map((rl, rlIndex) => <React.Fragment key={rl.key}>
<button onClick={rl.onClick} className="qr78" type="button">
<span className="qr77">
{rl.text}
</span>
<span className="qr19">
{rl.why}
</span>
</button>
</React.Fragment>)}
</div>
</div>
</div>
<div className="qr87">
{hasNotice ? <>
<div role="status" className="qr80">
{notice}
</div>
</> : null}
<div className="qr86">
{act.promote ? <>
<button onClick={act.onPromote} className="qr81" type="button">
{act.promoteLabel}
</button>
</> : null}
{act.edit ? <>
<button onClick={act.onEdit} className="qr82" type="button">
{act.editLabel}
</button>
</> : null}
{act.save ? <>
<button onClick={act.onSave} className="qr83" type="button">
{act.saveLabel}
</button>
<button onClick={act.onCancel} className="qr84" type="button">
{t("Cancel")}
</button>
</> : null}
{act.none ? <>
<div className="qr85">
{t("Superseded records are kept, never deleted.")}
</div>
</> : null}
</div>
<div className="qr40">
{t("Demo changes stay in this window · reload resets")}
</div>
</div>
</> : null}
</aside>
</section>
  )}
  </div>
</section>
  );
}
