// Read-only invented statements. No conflict resolution or historical Core reads.
import {useState} from 'react';
import {AUTO_MEMORIES,HISTORY} from './dataset';
import {byId,fmtStamp} from './model';
import {StateTag,OccurredLine} from './parts';
import type {AutoMemory} from './fixture';
import type {ViewProps} from './types';
import {t} from '../../i18n/index.ts';

export default function Comparison({sel,select,mode}:ViewProps & {mode:'conflicts'|'revisions'}){
  const selected=byId.get(sel)!;
  const [leftRevision,setLeftRevision]=useState('r1');
  const [rightRevision,setRightRevision]=useState('r3');
  const history=HISTORY?.filter(r=>r.memoryId===sel)??[];
  const left=history.find(r=>r.revision===leftRevision)??history[0];
  const right=history.find(r=>r.revision===rightRevision)??history[history.length-1];
  const partner=selected.conflictsWith?byId.get(selected.conflictsWith):undefined;
  const recordedConflict=AUTO_MEMORIES.find(m=>m.conflictsWith&&byId.has(m.conflictsWith));
  const rows:{memory:AutoMemory;revision:string;text:string;recorded:string|null}[]=mode==='conflicts'?
    partner?[{memory:selected,revision:selected.rev,text:selected.statement,recorded:null},{memory:partner,revision:partner.rev,text:partner.statement,recorded:null}]:[]:
    left&&right?[{memory:selected,revision:left.revision,text:left.text,recorded:left.recorded},{memory:selected,revision:right.revision,text:right.text,recorded:right.recorded}]:[];
  // Highlight the middle between equal Unicode-code-point prefix and suffix.
  // Entire raw bodies remain in the DOM, including whitespace and punctuation.
  const a=Array.from(rows[0]?.text??''),b=Array.from(rows[1]?.text??'');
  let prefix=0,suffix=0;
  while(prefix<a.length&&prefix<b.length&&a[prefix]===b[prefix])prefix++;
  while(suffix<a.length-prefix&&suffix<b.length-prefix&&a[a.length-1-suffix]===b[b.length-1-suffix])suffix++;
  const equal=rows.length===2&&rows[0].text===rows[1].text;
  const url=new URL(location.href);url.searchParams.set('auto-dataset','revisions');url.searchParams.set('auto-workspace','formation');url.searchParams.set('auto-view','revisions');
  return <section className="am-comparison" data-comparison-mode={mode} aria-label={t(mode==='conflicts'?'Conflict comparison':'Revision comparison')}>
    <div className="am-view-head"><h2 className="am-vh">{t(mode==='conflicts'?'Conflict comparison':'Revision comparison')}</h2>
      <p className="am-fine">{t("Read-only invented comparison. Highlighted spans contain literal text differences; they do not judge meaning, choose a winner or change a record.")}</p>
    </div>
    <label className="am-select-filter am-lineage-picker"><span className="am-lbl">{t("Selected memory")}</span><select data-comparison-select value={sel} onChange={e=>select(e.currentTarget.value)}>{AUTO_MEMORIES.map(m=><option key={m.id} value={m.id}>{m.title}</option>)}</select></label>
    {mode==='conflicts'?<p className="am-fine">{t("Recorded conflicts remain held. Reception order does not decide which statement is currently true.")}</p>:<p className="am-fine">{t("Only explicitly provided revision bodies can be compared. Formation notes and replacement links are not old revision bodies or commit receipts. The Inspector keeps the current selected sample record.")}</p>}
    {mode==='revisions'&&rows.length===2?<div className="am-revision-pickers">
      <label className="am-select-filter"><span className="am-lbl">{t("Left revision")}</span><select data-revision-side="left" value={left.revision} onChange={e=>setLeftRevision(e.currentTarget.value)}>{history.map(r=><option key={r.revision} value={r.revision}>{r.revision}</option>)}</select></label>
      <label className="am-select-filter"><span className="am-lbl">{t("Right revision")}</span><select data-revision-side="right" value={right.revision} onChange={e=>setRightRevision(e.currentTarget.value)}>{history.map(r=><option key={r.revision} value={r.revision}>{r.revision}</option>)}</select></label>
      <p className="am-fine">{t("These historical bodies and times are invented for this sample. No saved history is read.")}</p>
    </div>:null}
    {rows.length===2?<>
      {equal?<p className="am-fine" role="status">{t("No literal text difference in this comparison.")}</p>:null}
      <div className="am-comparison-columns">{rows.map((row,index)=>{
        const chars=index===0?a:b;
        const head=chars.slice(0,prefix).join(''),changed=chars.slice(prefix,chars.length-suffix).join(''),tail=suffix?chars.slice(chars.length-suffix).join(''):'';
        return <article key={index} className="am-comparison-side" data-comparison-side={index===0?'a':'b'}>
          <h3>{mode==='conflicts'?t(index===0?'Statement A':'Statement B'):t('Revision {revision}',{revision:row.revision})}</h3>
          <code>{row.memory.id} · {row.revision}</code>
          {mode==='conflicts'?<><h4>{row.memory.title}</h4><StateTag s={row.memory.state}/></>:<p className="am-fine">{t("Sample revision time")} · {fmtStamp(row.recorded!)}</p>}
          <p className="am-comparison-text" data-comparison-text={index===0?'a':'b'}>{head}{changed?<mark>{changed}</mark>:null}{tail}</p>
          {mode==='conflicts'?<>
            <OccurredLine m={row.memory}/><p className="am-fine">{t("Received")} · {fmtStamp(row.memory.received)}</p>
            <h4>{t("Model’s explanation")}</h4><p className="am-fine">{row.memory.why}</p>
            <h4>{t("Supporting excerpts")}</h4>
            {row.memory.support.length?<ul className="am-evidence">{row.memory.support.map((source,i)=><li key={i} data-conflict-excerpt>
              <p className="am-ev-src"><span>{source.source}</span><span className="am-role">{source.role}</span><code>{source.rev}</code></p><blockquote>{source.excerpt}</blockquote>
            </li>)}</ul>:<p className="am-none">{t("No support recorded.")}</p>}
            {row.memory.contextDeps.length?<><h4>{t("Context dependencies")} · {t("not support")}</h4><ul className="am-evidence am-deps">{row.memory.contextDeps.map((dependency,i)=><li key={i}><code>{dependency.capsule}</code><p>{dependency.note}</p></li>)}</ul></>:null}
          </>:null}
        </article>;
      })}</div>
    </>:mode==='conflicts'?<div className="am-comparison-empty">
      <p className="am-empty">{t(selected.conflictsWith?'The conflict partner is outside this loaded sample. Keep its original ID; no resolution is inferred.':'No conflict partner is recorded for this memory in the loaded sample. Select a recorded pair or another demo state.')}</p>
      {selected.conflictsWith?<code>{selected.conflictsWith}</code>:null}
      {recordedConflict?<button type="button" className="am-chip" data-open-recorded-conflict onClick={()=>select(recordedConflict.id)}>{t("Inspect recorded conflict")}</button>:null}
    </div>:<div className="am-comparison-empty">
      <p className="am-empty">{t("Previous revision bodies are unavailable in this sample. The current statement is retained; it is not used to reconstruct an old body.")}</p>
      <a className="am-chip" data-open-revision-sample href={url.href}>{t("Open revision sample")}</a>
    </div>}
  </section>;
}
