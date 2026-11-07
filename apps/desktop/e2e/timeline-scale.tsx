// Synthetic time-window scale and calendar boundaries; no native projection or writes.
import {createRoot} from 'react-dom/client';
import App from '../src/App';
import {AUTO_MEMORIES,DATASET} from '../src/screens/automemory/dataset';
import {UNKNOWN_KEY,UNKNOWN_PACKET} from '../src/screens/automemory/state-fixtures';
import {D0,D1,dayStart} from '../src/screens/automemory/model';
import {peekView,setWindow} from '../src/theme/timeview';
import {setLang,useLang,type Lang} from '../src/i18n';
const fixture=document.getElementById('fixture')!,root=createRoot(fixture),checks:{id:string;ok:boolean}[]=[];
const DAY=86400000,original=JSON.stringify(AUTO_MEMORIES);
const check=(id:string,ok:boolean)=>{checks.push({id,ok});if(!ok)throw Error(id);};
const sleep=()=>new Promise(resolve=>setTimeout(resolve,15));
async function wait(test:()=>boolean){for(let n=0;n<220;n++){if(test())return;await sleep();}throw Error('Timeline scale timeout');}
const scale=(id:string)=>fixture.querySelector<HTMLButtonElement>(`[data-time-scale="${id}"]`)!;
const view=()=>peekView('timeline')!;
const press=(key:string)=>{const map=fixture.querySelector<HTMLElement>('.tm-map')!;map.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));};
try{
  document.documentElement.dataset.motion='reduced';await setLang('en');
  function Surface(){useLang();return <App memoryConnected={false} startPage="memory" breathing={false}/>;}
  root.render(<Surface/>);await wait(()=>!!fixture.querySelector('[data-memory-workspace="time"]'));
  fixture.querySelector<HTMLButtonElement>('[data-memory-workspace="time"]')!.click();await wait(()=>!!fixture.querySelector('.am'));
  if(!AUTO_MEMORIES.length){check('empty_sample_does_not_create_scale_or_markers',!scale('day')&&!fixture.querySelector('.am-mk')&&!fixture.querySelector('.am-i-title'));}
  else{
    await wait(()=>!!fixture.querySelector('[data-time-view="lanes"]'));fixture.querySelector<HTMLButtonElement>('[data-time-view="lanes"]')!.click();await wait(()=>!!scale('day')&&!!view()&&fixture.querySelector('.tm-map')?.getAttribute('aria-label')?.includes('visible time window')===true);
    const inspector=fixture.querySelector('.am-inspector'),statement=fixture.querySelector('.am-statement')!.textContent;
    const markers=[...fixture.querySelectorAll('.am-mk')],shapes=markers.map(e=>[e.getAttribute('data-shape'),e.getAttribute('data-soft-a'),e.getAttribute('data-soft-b'),e.getAttribute('data-open')].join('|')),unknown=[...fixture.querySelectorAll('.am-unknown .am-ref')];
    check('six_week_default_retained',view().span===42*DAY&&scale('six-weeks').getAttribute('aria-pressed')==='true');
    const defaultWidth=parseFloat(fixture.querySelector<HTMLElement>('.am-pan')!.style.width);
    setWindow('timeline',dayStart('2026-08-31'),42*DAY,[D0,D1],'map');await sleep();scale('day').click();await wait(()=>view().span===DAY);
    check('day_anchors_to_current_shanghai_day_not_selection',view().start===dayStart('2026-08-31')&&fixture.querySelector('.am-statement')!.textContent===statement);
    check('day_really_scales_the_paper_and_clock_labels',parseFloat(fixture.querySelector<HTMLElement>('.am-pan')!.style.width)>defaultWidth*40&&[...fixture.querySelectorAll('[data-clock-tick]')].map(e=>e.textContent).join()==='00:00,06:00,12:00,18:00');
    scale('week').click();await wait(()=>view().span===7*DAY);
    check('seven_days_is_exact_and_keeps_anchor',view().start===dayStart('2026-08-31')&&!fixture.querySelector('[data-clock-tick]'));
    scale('month').click();await wait(()=>view().start===dayStart('2026-08-01')&&view().span===31*DAY);
    check('calendar_month_is_not_fixed_thirty_days',scale('month').getAttribute('aria-pressed')==='true'&&view().span===31*DAY);
    press('ArrowRight');await wait(()=>view().start===dayStart('2026-09-01')&&view().span===30*DAY);
    check('map_next_reaches_shorter_september',view().start===dayStart('2026-09-01')&&view().span===30*DAY);
    press('ArrowLeft');await wait(()=>view().start===dayStart('2026-08-01')&&view().span===31*DAY);
    check('map_previous_does_not_skip_a_month',view().start===dayStart('2026-08-01'));
    press('End');await wait(()=>view().start===dayStart('2026-10-01')&&view().span===31*DAY);
    check('domain_end_keeps_complete_october',view().start+view().span===D1);
    press('Home');await wait(()=>view().start===D0&&view().span===31*DAY);
    check('domain_start_keeps_complete_july',view().start===D0);
    const start=view().start,span=view().span,button=scale('month');button.focus();
    for(const language of ['zh-Hans','ja','en']){await setLang(language as Lang);await sleep();check(`${language}_scale_focus_selection_nodes_and_original_precision_survive`,document.activeElement===button&&scale('month')===button&&view().start===start&&view().span===span&&fixture.querySelector('.am-inspector')===inspector&&fixture.querySelector('.am-statement')!.textContent===statement&&markers.every((e,i)=>fixture.querySelectorAll('.am-mk')[i]===e&&[e.getAttribute('data-shape'),e.getAttribute('data-soft-a'),e.getAttribute('data-soft-b'),e.getAttribute('data-open')].join('|')===shapes[i])&&unknown.every((e,i)=>fixture.querySelectorAll('.am-unknown .am-ref')[i]===e));
      if(DATASET==='unknown-result')check(`${language}_unknown_packet_key_and_disabled_lookup_stay`,fixture.querySelector('.am-unknown-result pre')!.textContent===UNKNOWN_PACKET&&fixture.querySelector('.am-unknown-result code')!.textContent===UNKNOWN_KEY&&fixture.querySelector<HTMLButtonElement>('.am-unknown-result button')!.disabled);
    }
    scale('six-weeks').click();await wait(()=>view().span===42*DAY);
    check('six_weeks_restores_scale_without_changing_data',view().start===D0&&JSON.stringify(AUTO_MEMORIES)===original&&fixture.querySelector('.am-statement')!.textContent===statement);
  }
}catch(error){checks.push({id:String(error),ok:false});}
finally{root.unmount();document.getElementById('results')!.textContent=JSON.stringify({checks,passed:checks.every(c=>c.ok),dataset:DATASET});}
