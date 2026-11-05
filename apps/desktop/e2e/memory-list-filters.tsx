// One loaded synthetic sample in both layouts. No native reads or writes.
import {createRoot} from 'react-dom/client';
import AutoMemory from '../src/screens/automemory/AutoMemory';
import {AUTO_MEMORIES} from '../src/screens/automemory/dataset';
import {setLang,useLang,type Lang} from '../src/i18n';
const fixture=document.getElementById('fixture')!,root=createRoot(fixture),checks:{id:string;ok:boolean}[]=[];
const check=(id:string,ok:boolean)=>{checks.push({id,ok});if(!ok)throw Error(id);};
const sleep=()=>new Promise(resolve=>setTimeout(resolve,15));
async function wait(test:()=>boolean){for(let i=0;i<180;i++){if(test())return;await sleep();}throw Error('Memory list timeout: '+ids()+' query='+input()?.value);}
const records=()=>[...fixture.querySelectorAll<HTMLButtonElement>('[data-memory-record]')];
const ids=()=>records().map(b=>b.dataset.memoryRecord).join(',');
const layout=(value:string)=>fixture.querySelector<HTMLButtonElement>(`[data-grid-layout="${value}"]`)!;
const input=()=>fixture.querySelector<HTMLInputElement>('[data-memory-filter="text"]')!;
function query(value:string){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input(),value);input().dispatchEvent(new Event('input',{bubbles:true}));}
function filter(name:string,value:string){const select=fixture.querySelector<HTMLSelectElement>(`[data-memory-filter="${name}"]`)!;select.value=value;select.dispatchEvent(new Event('change',{bubbles:true}));}
try{
  document.documentElement.dataset.motion='reduced';
  function Surface(){useLang();return <AutoMemory workspace="memories"/>;}
  root.render(<Surface/>);await wait(()=>records().length===15);
  const originalOrder=ids(),inspector=fixture.querySelector('.am-inspector');
  check('default_cards_keep_received_order',layout('grid').getAttribute('aria-pressed')==='true'&&originalOrder.startsWith('am_11,am_10,am_14,am_09,'));
  const nodes=records();layout('list').click();await wait(()=>!!fixture.querySelector('.am-slips[data-layout="list"]'));
  check('list_retains_order_and_record_nodes',ids()===originalOrder&&records().every((b,i)=>b===nodes[i])&&fixture.querySelector('.am-inspector')===inspector);
  records()[0].focus();records()[0].dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));
  await wait(()=>fixture.querySelector('.am-i-title')?.textContent===AUTO_MEMORIES.find(m=>m.id==='am_10')!.title);
  check('list_arrow_moves_focus_and_shared_selection',document.activeElement===records()[1]&&records()[1].getAttribute('aria-pressed')==='true');
  records()[1].dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true,cancelable:true}));await wait(()=>fixture.querySelector('.am-i-title')?.textContent===AUTO_MEMORIES.find(m=>m.id==='am_11')!.title);
  check('list_arrow_up_keeps_original_direction',document.activeElement===records()[0]);
  input().focus();query('short');await wait(()=>records().length===3);
  check('literal_search_keeps_all_three_matching_raw_records',ids()==='am_11,am_01,am_13');
  filter('state','adopted');filter('theme','style');fixture.querySelector<HTMLButtonElement>('[data-memory-kind="preference"]')!.click();await sleep();
  check('filters_intersect_without_borrowing_other_records',ids()==='am_01'&&input().value==='short');
  check('filtering_keeps_hidden_selection_explained',fixture.querySelector('.am-i-title')?.textContent===AUTO_MEMORIES.find(m=>m.id==='am_11')!.title&&fixture.textContent!.includes('The selected memory is outside these filters.'));
  records()[0].click();await wait(()=>fixture.querySelector('.am-i-title')?.textContent==='Short answers');
  const selected=records()[0];layout('grid').click();await wait(()=>layout('grid').getAttribute('aria-pressed')==='true');
  check('layout_switch_keeps_filters_selection_and_record',ids()==='am_01'&&records()[0]===selected&&selected.getAttribute('aria-pressed')==='true'&&input().value==='short');
  layout('list').click();input().focus();const field=input();
  for(const language of ['zh-Hans','ja','en']){
    await setLang(language as Lang);await sleep();
    check(`${language}_language_keeps_filters_focus_raw_text_and_selection`,input()===field&&field.value==='short'&&document.activeElement===field&&ids()==='am_01'&&records()[0]===selected&&fixture.querySelector('.am-inspector')===inspector&&fixture.querySelector('.am-statement')?.textContent===AUTO_MEMORIES.find(m=>m.id==='am_01')!.statement&&fixture.querySelector<HTMLSelectElement>('[data-memory-filter="state"]')!.value==='adopted'&&fixture.querySelector<HTMLSelectElement>('[data-memory-filter="theme"]')!.value==='style');
  }
  query('no-match-from-fixture');await wait(()=>records().length===0);
  check('no_match_keeps_inspector_and_clear_action',fixture.textContent!.includes('No matching record in the loaded sample.')&&fixture.querySelector('.am-i-title')?.textContent==='Short answers'&&!fixture.querySelector<HTMLButtonElement>('[data-clear-memory-filters]')!.disabled);
  fixture.querySelector<HTMLButtonElement>('[data-clear-memory-filters]')!.click();await wait(()=>records().length===15);
  check('clear_resets_all_filters_but_keeps_layout_and_selection',ids()===originalOrder&&input().value===''&&layout('list').getAttribute('aria-pressed')==='true'&&fixture.querySelector<HTMLSelectElement>('[data-memory-filter="state"]')!.value==='all'&&fixture.querySelector<HTMLSelectElement>('[data-memory-filter="theme"]')!.value==='all'&&fixture.querySelector('[data-memory-kind="all"]')?.getAttribute('aria-pressed')==='true'&&fixture.querySelector('.am-i-title')?.textContent==='Short answers');
  filter('state','adopted');filter('theme','style');await wait(()=>records().length===2);
  check('state_and_suggested_theme_intersection_is_loaded_scope',ids()==='am_03,am_01');
}catch(error){checks.push({id:String(error),ok:false});}
finally{root.unmount();document.getElementById('results')!.textContent=JSON.stringify({checks,passed:checks.every(c=>c.ok)});}
