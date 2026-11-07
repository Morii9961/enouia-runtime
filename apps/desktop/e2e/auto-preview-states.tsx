// Browser-design components in the DOM model; no native IPC or acceptance proof.
import { createRoot } from 'react-dom/client';
import AutoMemory from '../src/screens/automemory/AutoMemory';
import { AUTO_MEMORIES, DATASET, RELATIONS, RECALL_CASES, STREAM } from '../src/screens/automemory/dataset';
import { UNKNOWN_KEY, UNKNOWN_PACKET } from '../src/screens/automemory/state-fixtures';
import { AUTO_MEMORIES as ORIGINAL } from '../src/screens/automemory/fixture';
import { setLang, useLang, type Lang } from '../src/i18n';
const fixture = document.getElementById('fixture')!;
const root = createRoot(fixture);
const checks: {id:string;ok:boolean}[]=[];
const check=(id:string,ok:boolean)=>checks.push({id,ok});
const sleep=()=>new Promise(resolve=>setTimeout(resolve,15));
async function wait(test:()=>boolean){for(let i=0;i<200;i++){if(test())return;await sleep();}throw Error('Preview timeout');}
try {
  document.documentElement.dataset.motion='reduced';
  function Surface(){useLang();return <AutoMemory onExit={()=>undefined}/>;}
  root.render(<Surface/>);
  await wait(()=>!!fixture.querySelector('[data-auto-view]'));
  check('original_15_records_retained',ORIGINAL.length===15&&!ORIGINAL.some(m=>m.occurred.precision==='range'&&m.occurred.end===null));
  const ids=new Set(AUTO_MEMORIES.map(m=>m.id));
  check('references_belong_to_selected_sample',RELATIONS.every(r=>ids.has(r.from)&&ids.has(r.to))&&STREAM.every(e=>ids.has(e.id))&&RECALL_CASES.every(c=>[...c.included,...c.excluded].every(m=>ids.has(m.id))));
  for(const language of ['en','zh-Hans','ja']){
    await setLang(language as Lang);
    if(DATASET==='unknown-result')check(`${language}_original_unknown_packet_and_key_retained`,fixture.querySelector('.am-unknown-result pre')?.textContent===UNKNOWN_PACKET&&fixture.querySelector('.am-unknown-result code')?.textContent===UNKNOWN_KEY&&fixture.querySelector<HTMLButtonElement>('.am-unknown-result button')?.disabled===true);
    for(const view of ['formation','grid','timeline','stars','replacement','evidence','recall','starmap']){
      fixture.querySelector<HTMLButtonElement>(`[data-auto-view="${view}"]`)!.click();
      await wait(()=>fixture.querySelector('[data-view]')?.getAttribute('data-view')===view);
      check(`${language}_${view}_renders`,!!fixture.querySelector('#am-main')&&!!fixture.querySelector('.am-note'));
      if(DATASET==='empty')check(`${language}_${view}_empty_has_no_record_or_generated_map`,!fixture.querySelector('.am-i-title')&&!fixture.querySelector('.sm-canvas')&&!!fixture.querySelector('#am-inspector .am-empty'));
      else if(view!=='starmap')check(`${language}_${view}_selection_is_in_sample`,AUTO_MEMORIES.some(m=>m.title===fixture.querySelector('.am-i-title')?.textContent));
      else if(DATASET!=='original')check(`${language}_state_does_not_open_unrelated_generated_sample`,!fixture.querySelector('.sm-canvas'));
    }
  }
  await setLang('en');
  fixture.querySelector<HTMLButtonElement>('[data-auto-view="timeline"]')!.click();
  await wait(()=>fixture.querySelector('[data-view]')?.getAttribute('data-view')==='timeline');
  if(DATASET==='held')check('nothing_adopted_or_offered',AUTO_MEMORIES.length>0&&AUTO_MEMORIES.every(m=>['received','held'].includes(m.state)&&m.known===null&&m.surfacing==='not offered')&&RECALL_CASES.length===0);
  if(DATASET==='open-ended'){fixture.querySelector<HTMLButtonElement>('[data-time-view="lanes"]')!.click();await wait(()=>!!fixture.querySelector('.am-mk[data-open]'));}
  if(DATASET==='open-ended')check('open_end_is_readable_without_fabricated_end',fixture.textContent!.includes('range · end open')&&AUTO_MEMORIES.some(m=>m.occurred.precision==='range'&&m.occurred.end===null)&&!fixture.textContent!.includes('NaN')&&!fixture.querySelector('.am-lag')&&!!fixture.querySelector('.am-mk[data-open]'));
  if(DATASET==='source-missing')check('missing_source_keeps_statement_without_excerpt',!!fixture.querySelector('.am-statement')&&AUTO_MEMORIES[0].support.length===0);
  if(DATASET==='read-only')check('read_only_controls_stay_disabled',[...fixture.querySelectorAll<HTMLButtonElement>('.am-opt')].every(b=>b.disabled));
} catch(error){checks.push({id:String(error),ok:false});}
finally{root.unmount();document.getElementById('results')!.textContent=JSON.stringify({checks,passed:checks.every(c=>c.ok),dataset:DATASET});}
