// Only recorded links and already loaded fictional excerpts. No inferred receipt or read.
import { AUTO_MEMORIES, RELATIONS } from './dataset';
import { byId, fmtStamp } from './model';
import { Ref, StateTag } from './parts';
import type { ViewProps } from './types';
import { t } from '../../i18n/index.ts';

export default function Lineage({sel,select,mode}:ViewProps & {mode:'replacement'|'evidence'}){
  const memory=byId.get(sel)!;
  const edges=RELATIONS.filter(r=>r.type===(mode==='replacement'?'supersedes':'source'));
  const connected=new Set([sel]);
  // Expand only this finite loaded component. Each displayed edge remains an
  // explicit fixture edge; reachability never manufactures another relation.
  let changed=true;
  while(changed){
    changed=false;
    for(const edge of edges){
      if(!connected.has(edge.from)&&!connected.has(edge.to))continue;
      if(!connected.has(edge.from)){connected.add(edge.from);changed=true;}
      if(!connected.has(edge.to)){connected.add(edge.to);changed=true;}
    }
  }
  const shown=edges.filter(r=>connected.has(r.from)&&connected.has(r.to));
  return <section className="am-lineage" data-lineage-mode={mode} aria-label={t(mode==='replacement'?'Replacement chain':'Evidence chain')}>
    <div className="am-view-head"><h2 className="am-vh">{t(mode==='replacement'?'Replacement chain':'Evidence chain')}</h2>
      <p className="am-fine">{t("Only explicit links and excerpts in the loaded invented sample are shown. Missing links, source locators and commit receipts remain unrepresented.")}</p>
    </div>
    <label className="am-select-filter am-lineage-picker"><span className="am-lbl">{t("Selected memory")}</span><select data-lineage-select value={sel} onChange={e=>select(e.currentTarget.value)}>{AUTO_MEMORIES.map(m=><option key={m.id} value={m.id}>{m.title}</option>)}</select></label>
    <article className="am-lineage-memory" data-lineage-selected={memory.id}>
      <code>{memory.id} · {memory.rev}</code><h3>{memory.title}</h3><StateTag s={memory.state}/>
    </article>
    {mode==='evidence'?<>
      <section className="am-lineage-section" aria-label={t("Support")}>
        <h3>{t("Supporting excerpts")}</h3>
        <p className="am-fine">{t("Source names and revisions are invented display text. Repeated excerpts are not independent corroboration. Formation notes are not commit receipts.")}</p>
        {memory.support.length?<ul className="am-evidence">{memory.support.map((source,i)=><li key={i} data-lineage-excerpt>
          <p className="am-ev-src"><span>{source.source}</span><span className="am-role">{source.role}</span><code>{source.rev}</code></p>
          <blockquote>{source.excerpt}</blockquote><p className="am-evid-time"><b>{t("Received")}</b> {fmtStamp(source.received)}</p>
        </li>)}</ul>:<p className="am-none">{t("No supporting excerpts are available in this sample. The retained statement remains readable; choose another demo state to inspect excerpts.")}</p>}
      </section>
      <section className="am-lineage-section" aria-label={t("Context dependencies")}>
        <h3>{t("Context dependencies")} <span className="am-tag">{t("not support")}</span></h3>
        <p className="am-fine">{t("What was in the model’s context when this formed. It is not evidence for the statement.")}</p>
        {memory.contextDeps.length?<ul className="am-evidence am-deps">{memory.contextDeps.map((dependency,i)=><li key={i} data-lineage-dependency><code>{dependency.capsule}</code><p>{dependency.note}</p></li>)}</ul>:<p className="am-none">{t("None recorded.")}</p>}
      </section>
    </>:null}
    <section className="am-lineage-section" aria-label={t(mode==='replacement'?'Recorded replacement links':'Recorded shared-source links')}>
      <h3>{t(mode==='replacement'?'Recorded replacement links':'Recorded shared-source links')}</h3>
      <p className="am-fine">{t(mode==='replacement'?'A replacement link does not establish current truth. Its effective time is not recorded in this preview.':'Shared-source links are recorded in the sample. They do not add support or establish a cause. The same source name is not used to invent a link.')}</p>
      {shown.length?<ul className="am-lineage-links">{shown.map(edge=><li key={edge.from+':'+edge.to} data-lineage-edge={edge.from+':'+edge.to}>
        <div data-link-from={edge.from}><span className="am-lbl">{t(mode==='replacement'?'Replacing memory':'Linked memory')}</span><Ref m={byId.get(edge.from)!} selected={edge.from===sel} onSelect={select}/></div>
        <span className="am-lineage-direction">{t(mode==='replacement'?'replaced':'same source revision')}</span>
        <div data-link-to={edge.to}><span className="am-lbl">{t(mode==='replacement'?'Replaced memory':'Linked memory')}</span><Ref m={byId.get(edge.to)!} selected={edge.to===sel} onSelect={select}/></div>
      </li>)}</ul>:<p className="am-none">{t("No link of this kind is recorded for the selected memory in the loaded sample. This is not a finding about its full history.")}</p>}
    </section>
  </section>;
}
