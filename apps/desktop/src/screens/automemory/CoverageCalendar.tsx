// Pure invented coverage; real calendar projections remain Memory-owned.
import { useEffect, useState } from 'react';
import { COVERAGE } from './dataset';
import type { CoverageMemory } from './coverage-fixtures';
import { D0, D1, MONTHS, dayKey, dayStart, fmtDay, fmtMonth, fmtStamp, monthStart, nextMonth, toMs } from './model';
import { StateTag } from './parts';
import type { ViewProps } from './types';
import { lendMap, type MapSpec } from '../../theme/TimeMap';
import { clearViews, setWindow, useTimeView } from '../../theme/timeview';
import { dateFmt, msg, t } from '../../i18n/index.ts';
const DAY = 86400000, KEY = 'timeline-coverage';
const SPEC: MapSpec = {
  key: KEY, cells: (D1 - D0) / DAY, ticks: [],
  label: msg('Coverage time map. Bars count received material identities only. The frame follows the calendar month.'),
  bars: Array.from({length:(D1-D0)/DAY},(_,i)=>COVERAGE?.materials.filter(s=>dayKey(s.received)===dayKey(new Date(D0+i*DAY).toISOString())).length??0),
  get labels(){return MONTHS.map(m=>({at:m.a,text:m.name}));},
  step:31*DAY, unit:msg('month'),
  readout:(start,span)=>fmtMonth(dayKey(new Date(start+span/2).toISOString()).slice(0,7)),
  init:()=>({start:monthStart('2026-10'),span:31*DAY,domain:[D0,D1]}),
};
export default function CoverageCalendar({sel,select}:ViewProps){
  const view=useTimeView(KEY,SPEC.init);
  const month=dayKey(new Date(view.start+view.span/2).toISOString()).slice(0,7);
  const start=monthStart(month),end=nextMonth(month);
  const [day,setDay]=useState('2026-10-01');
  const [layers,setLayers]=useState({materials:true,staged:true,adopted:true});
  useEffect(()=>{lendMap(COVERAGE?SPEC:null);return()=>{lendMap(null);clearViews(KEY);};},[]);
  useEffect(()=>{setWindow(KEY,start,end-start,[D0,D1],view.by);},[start,end,view.seq]);
  const coverage=COVERAGE;
  if(!coverage){
    const url=new URL(location.href);url.searchParams.set('auto-dataset','coverage');url.searchParams.set('auto-workspace','time');url.searchParams.set('auto-time-view','coverage');
    return <section className="am-coverage" aria-label={t("Coverage calendar")}>
      <h2 className="am-vh">{t("Coverage calendar")}</h2>
      <p className="am-empty">{t("Coverage is unavailable in this sample. Its excerpts do not form an independent material collection, so missing material counts are not zero.")}</p>
      <a className="am-chip" data-open-coverage href={url.href}>{t("Open coverage sample")}</a>
    </section>;
  }
  const selectedDay=day.startsWith(month)?day:month+'-01';
  const dates=Array.from({length:(end-start)/DAY},(_,i)=>{
    const from=start+i*DAY,until=from+DAY,key=dayKey(new Date(from).toISOString());
    const materials=coverage.materials.filter(s=>dayKey(s.received)===key);
    const memories=coverage.memories.filter(m=>{
      const o=m.occurred;
      if(o.precision==='unknown'||o.precision==='range'&&o.end===null)return false;
      const a=o.precision==='instant'?toMs(o.at):o.precision==='day'?dayStart(o.day):o.precision==='month'?monthStart(o.month):toMs(o.start);
      const b=o.precision==='instant'?a+1:o.precision==='day'?a+DAY:o.precision==='month'?nextMonth(o.month):o.end!.length===7?nextMonth(o.end!):toMs(o.end!)+(o.end!.length===10?DAY:0);
      return a<until&&b>from;
    });
    return {key,materials,memories,staged:memories.filter(m=>m.adoption==='staged').length,adopted:memories.filter(m=>m.adoption==='adopted').length};
  });
  const picked=dates.find(d=>d.key===selectedDay)!;
  const unplaced=coverage.memories.filter(m=>m.occurred.precision==='unknown'||m.occurred.precision==='range'&&m.occurred.end===null);
  const offset=(new Date(start+8*3600000).getUTCDay()+6)%7;
  const cells=[...Array.from({length:offset},()=>null),...dates];
  while(cells.length%7)cells.push(null);
  const weekdays=Array.from({length:7},(_,i)=>dateFmt({weekday:'short',timeZone:'Asia/Shanghai'}).format(dayStart('2026-10-05')+i*DAY));
  const record=(m:CoverageMemory)=><li key={m.id}><button type="button" className="am-month-record" data-coverage-record={m.id} aria-pressed={sel===m.id} onClick={()=>select(m.id)}><span>{m.title}</span><StateTag s={m.state}/></button></li>;
  const layerLabels={materials:msg('Received materials'),staged:msg('Staged memories'),adopted:msg('Adopted memories')};
  return <section className="am-coverage" aria-label={t("Coverage calendar")}>
    <div className="am-view-head"><h2 className="am-vh">{t("Coverage calendar")} <span>{t("Coverage sample")}</span></h2>
      <p className="am-fine">{t("Invented loaded sample only · Asia/Shanghai (UTC+8). Materials use received time. Memory counts use possible occurred-time overlap and current adoption, not historical adoption events or human confirmation.")}</p>
    </div>
    <div className="am-coverage-layers" role="group" aria-label={t("Coverage layers")}>
      {(['materials','staged','adopted'] as const).map(key=><label key={key}><input type="checkbox" data-coverage-layer={key} checked={layers[key]} onChange={e=>setLayers({...layers,[key]:e.target.checked})}/><span>{t(layerLabels[key])}<small>{t(key==='materials'?'received time':'possible occurred-time overlap')}</small></span></label>)}
    </div>
    <p className="am-fine">{t("Material identities are counted once, even when several memories cite one material. A material can also have no memory. Ranges and month-only dates may overlap several days; do not add those daily memory counts.")}</p>
    <div className="am-month-layout">
      <nav className="am-month-nav" aria-label={t("Sample months")}>{MONTHS.map(m=><button key={m.key} type="button" className="am-chip" data-coverage-month={m.key} aria-label={fmtMonth(m.key)} aria-current={month===m.key?'date':undefined} onClick={()=>setWindow(KEY,monthStart(m.key),nextMonth(m.key)-monthStart(m.key),[D0,D1],'map')}>{m.name}</button>)}</nav>
      <div className="am-coverage-paper" data-coverage-shown-month={month}>
        <h3>{fmtMonth(month)}</h3>
        <table className="am-coverage-table"><caption>{t("Possible coverage by day")}<small>{t("Received materials")} · {t("received time")} / {t("Staged memories")} + {t("Adopted memories")} · {t("possible occurred-time overlap")}</small></caption>
          <thead><tr>{weekdays.map((name,i)=><th key={i} scope="col">{name}</th>)}</tr></thead>
          <tbody>{Array.from({length:cells.length/7},(_,week)=><tr key={week}>{cells.slice(week*7,week*7+7).map((d,i)=><td key={d?.key??'blank-'+i}>{d?<button type="button" data-coverage-day={d.key} data-material-count={d.materials.length} data-staged-count={d.staged} data-adopted-count={d.adopted} aria-pressed={selectedDay===d.key} onClick={()=>setDay(d.key)}
            aria-label={t('{date}. Received materials {materials}; possible staged {staged}; possible adopted {adopted}.',{date:fmtDay(dayStart(d.key)),materials:layers.materials?d.materials.length:t('hidden'),staged:layers.staged?d.staged:t('hidden'),adopted:layers.adopted?d.adopted:t('hidden')})}>
            <span className="am-coverage-date">{Number(d.key.slice(8))}</span>
            {layers.materials?<span data-band="materials">{t('Material {n}',{n:d.materials.length})}</span>:null}
            {layers.staged?<span data-band="staged">{t('Staged {n}',{n:d.staged})}</span>:null}
            {layers.adopted?<span data-band="adopted">{t('Adopted {n}',{n:d.adopted})}</span>:null}
          </button>:null}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </div>
    {!layers.materials&&!layers.staged&&!layers.adopted?<p className="am-fine">{t("All coverage layers are hidden. Turn on a layer to inspect its counts.")}</p>:null}
    <section className="am-coverage-detail" data-coverage-detail={picked.key} aria-label={fmtDay(dayStart(picked.key))}>
      <h3>{fmtDay(dayStart(picked.key))}</h3><p className="am-fine">{t("Zero means no matching record in this sample and layer. It does not mean nothing happened.")}</p>
      {layers.materials?<><h4>{t("Received materials")}</h4>{picked.materials.length?<ul>{picked.materials.map(s=><li key={s.id} data-coverage-material={s.id}><span>{s.title}</span><code>{s.id} · {s.revision}</code><span className="am-fine">{fmtStamp(s.received)}</span></li>)}</ul>:<p className="am-fine">{t("No received material in this sample day.")}</p>}</>:null}
      {layers.staged||layers.adopted?<><h4>{t("Memories with possible occurred-time overlap")}</h4><ul>{picked.memories.filter(m=>layers[m.adoption]).map(record)}</ul></>:null}
    </section>
    <section className="am-month-unknown" aria-label={t("Time not recorded")}><h3>{t("Time not recorded")} <span className="am-tag">{unplaced.length}</span></h3><p className="am-fine">{t("These memories cannot be assigned to calendar days. Their material reception dates do not fill the missing occurred time.")}</p><ul>{unplaced.filter(m=>layers[m.adoption]).map(record)}</ul></section>
  </section>;
}
