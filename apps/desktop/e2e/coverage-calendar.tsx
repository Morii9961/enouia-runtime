// Synthetic material/adoption boundaries in the DOM model, never native evidence.
import { createRoot } from 'react-dom/client';
import AutoMemory from '../src/screens/automemory/AutoMemory';
import { COVERAGE, DATASET } from '../src/screens/automemory/dataset';
import { setLang, useLang, type Lang } from '../src/i18n';
import { useLentMap } from '../src/theme/TimeMap';
import { dayStart } from '../src/screens/automemory/model';
import { panTo, peekView } from '../src/theme/timeview';
const fixture=document.getElementById('fixture')!,root=createRoot(fixture),checks:{id:string;ok:boolean}[]=[];
const check=(id:string,ok:boolean)=>{checks.push({id,ok});if(!ok)throw Error(id);};
const sleep=()=>new Promise(resolve=>setTimeout(resolve,15));
async function wait(test:()=>boolean){for(let i=0;i<200;i++){if(test())return;await sleep();}throw Error('Coverage timeout');}
const day=(key:string)=>fixture.querySelector<HTMLButtonElement>(`[data-coverage-day="${key}"]`)!;
const layer=(key:string)=>fixture.querySelector<HTMLInputElement>(`[data-coverage-layer="${key}"]`)!;
try{
  document.documentElement.dataset.motion='reduced';
  function Surface(){useLang();const map=useLentMap();return <><AutoMemory workspace="time"/><output data-map={map?.key}/></>;}
  root.render(<Surface/>);await wait(()=>!!fixture.querySelector('[data-time-view="coverage"]'));
  fixture.querySelector<HTMLButtonElement>('[data-time-view="coverage"]')!.click();
  if(DATASET!=='coverage'){
    await wait(()=>!!fixture.querySelector('[data-open-coverage]')&&!fixture.querySelector('output')?.getAttribute('data-map'));
    check('missing_material_collection_has_no_zero_calendar',!COVERAGE&&!fixture.querySelector('.am-coverage-table')&&fixture.textContent!.includes('missing material counts are not zero'));
    const href=new URL(fixture.querySelector<HTMLAnchorElement>('[data-open-coverage]')!.href);
    check('explicit_sample_link_opens_coverage_not_a_different_view',href.searchParams.get('auto-dataset')==='coverage'&&href.searchParams.get('auto-workspace')==='time'&&href.searchParams.get('auto-time-view')==='coverage');
    for(const language of ['zh-Hans','ja','en']){await setLang(language as Lang);await sleep();check(`${language}_unavailable_stays_unavailable`,!!fixture.querySelector('[data-open-coverage]')&&!fixture.querySelector('.am-coverage-table'));}
  }else{
    await wait(()=>!!day('2026-10-01')&&fixture.querySelector('output')?.getAttribute('data-map')==='timeline-coverage');
    check('independent_materials_and_current_adoption_fixture',COVERAGE!.materials.length===3&&COVERAGE!.memories.length===4&&COVERAGE!.memories.every(m=>m.sourceIds.every(id=>COVERAGE!.materials.some(s=>s.id===id)))&&COVERAGE!.memories.filter(m=>m.sourceIds.includes('demo_material_01')).length===2);
    check('material_without_memory_is_counted',day('2026-10-05').dataset.materialCount==='1'&&!COVERAGE!.memories.some(m=>m.sourceIds.includes('demo_material_03')));
    check('material_is_not_memory_count',day('2026-10-01').dataset.materialCount==='1'&&day('2026-10-01').dataset.adoptedCount==='1'&&day('2026-10-01').dataset.stagedCount==='0');
    check('adopted_month_means_possible_overlap_not_adoption_events',day('2026-10-02').dataset.adoptedCount==='1'&&day('2026-10-02').dataset.materialCount==='0'&&day('2026-10-31').dataset.adoptedCount==='1'&&fixture.textContent!.includes('not historical adoption events or human confirmation'));
    check('range_possible_overlap_has_exclusive_day_boundaries',day('2026-10-02').dataset.stagedCount==='0'&&day('2026-10-03').dataset.stagedCount==='1'&&day('2026-10-05').dataset.stagedCount==='1'&&day('2026-10-06').dataset.stagedCount==='0');
    check('unknown_does_not_use_material_received_date',!!fixture.querySelector('.am-month-unknown [data-coverage-record="demo_coverage_02"]')&&![...fixture.querySelectorAll('[data-coverage-day]')].some(e=>Number((e as HTMLElement).dataset.stagedCount)>1));
    fixture.querySelector<HTMLButtonElement>('[data-coverage-month="2026-09"]')!.click();await wait(()=>!!day('2026-09-30'));
    check('shanghai_midnight_and_shared_source_count_once',day('2026-09-29').dataset.materialCount==='0'&&day('2026-09-30').dataset.materialCount==='1'&&day('2026-09-30').dataset.adoptedCount==='1');
    day('2026-09-30').click();await wait(()=>!!fixture.querySelector('[data-coverage-material="demo_material_01"]'));
    const material=fixture.querySelector('[data-coverage-material="demo_material_01"]')!,raw=material.textContent;
    check('raw_material_identity_revision_and_received_time_retained',raw!.includes('demo_material_01 · r1')&&raw!.includes('00:02'));
    fixture.querySelector<HTMLButtonElement>('.am-coverage-detail [data-coverage-record="demo_coverage_01"]')!.click();await wait(()=>fixture.querySelector('.am-i-title')?.textContent==='Invented desk moved');
    check('calendar_memory_uses_shared_inspector',fixture.querySelector('.am-i-title')?.textContent==='Invented desk moved');
    layer('staged').click();layer('staged').focus();await wait(()=>!fixture.querySelector('[data-band="staged"]'));
    const focused=layer('staged'),inspector=fixture.querySelector('.am-inspector');
    for(const language of ['zh-Hans','ja','en']){
      await setLang(language as Lang);await sleep();
      check(`${language}_layer_day_focus_and_identity_survive`,layer('staged')===focused&&!focused.checked&&document.activeElement===focused&&fixture.querySelector('[data-coverage-detail]')?.getAttribute('data-coverage-detail')==='2026-09-30'&&fixture.querySelector('.am-inspector')===inspector&&fixture.querySelector('.am-i-title')?.textContent==='Invented desk moved'&&fixture.querySelector('[data-coverage-material="demo_material_01"]')===material&&material.textContent!.includes('demo_material_01 · r1'));
    }
    check('layers_hide_counts_and_accessible_values',!fixture.querySelector('[data-band="staged"]')&&day('2026-09-30').getAttribute('aria-label')!.includes('hidden'));
    layer('materials').click();layer('adopted').click();await wait(()=>!fixture.querySelector('[data-band]'));
    check('all_hidden_does_not_mean_zero',fixture.textContent!.includes('All coverage layers are hidden.')&&!fixture.querySelector('[data-coverage-material]')&&!fixture.querySelector('.am-coverage [data-coverage-record]'));
    layer('materials').click();panTo('timeline-coverage',dayStart('2026-10-10'));await wait(()=>!!day('2026-10-01'));
    check('map_keeps_layer_and_selection',layer('materials').checked&&!layer('adopted').checked&&peekView('timeline-coverage')?.span===31*86400000&&fixture.querySelector('.am-i-title')?.textContent==='Invented desk moved');
    day('2026-10-02').click();await wait(()=>!!fixture.querySelector('[data-coverage-detail="2026-10-02"]'));
    check('zero_day_explains_scope',fixture.textContent!.includes('It does not mean nothing happened.')&&fixture.textContent!.includes('No received material in this sample day.'));
  }
}catch(error){checks.push({id:String(error),ok:false});}
finally{root.unmount();document.getElementById('results')!.textContent=JSON.stringify({checks,passed:checks.every(c=>c.ok),dataset:DATASET});}
