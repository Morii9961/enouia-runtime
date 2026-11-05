// Fixed loaded-sample hypothesis subset, never an approval queue.
import {createRoot} from 'react-dom/client';
import AutoMemory from '../src/screens/automemory/AutoMemory';
import {AUTO_MEMORIES,DATASET} from '../src/screens/automemory/dataset';
import {UNKNOWN_KEY,UNKNOWN_PACKET} from '../src/screens/automemory/state-fixtures';
import {setLang,useLang,type Lang} from '../src/i18n';
const fixture=document.getElementById('fixture')!,root=createRoot(fixture),checks:{id:string;ok:boolean}[]=[];
const check=(id:string,ok:boolean)=>{checks.push({id,ok});if(!ok)throw Error(id);};
const sleep=()=>new Promise(resolve=>setTimeout(resolve,15));
async function wait(test:()=>boolean){for(let n=0;n<180;n++){if(test())return;await sleep();}throw Error('Hypothesis timeout');}
const records=()=>[...fixture.querySelectorAll<HTMLButtonElement>('[data-memory-record]')];
const input=()=>fixture.querySelector<HTMLInputElement>('[data-memory-filter="text"]')!;
function query(value:string){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input(),value);input().dispatchEvent(new Event('input',{bubbles:true}));}
try{
  document.documentElement.dataset.motion='reduced';
  function Surface(){useLang();return <AutoMemory workspace="formation"/>;}
  root.render(<Surface/>);await wait(()=>!!fixture.querySelector('[data-auto-view="hypotheses"]'));
  const inspector=fixture.querySelector('.am-inspector'),before=fixture.querySelector('.am-i-title')?.textContent;
  fixture.querySelector<HTMLButtonElement>('[data-auto-view="hypotheses"]')!.click();
  await wait(()=>fixture.querySelector('.am')?.getAttribute('data-view')==='hypotheses');
  const expected=AUTO_MEMORIES.filter(m=>m.state==='held');
  if(DATASET==='empty'){
    check('empty_does_not_invent_a_hypothesis',!records().length&&!fixture.querySelector('.am-i-title')&&!!fixture.querySelector('#am-inspector .am-empty'));
  }else{
    await wait(()=>!!fixture.querySelector('[data-memory-subset="hypotheses"]'));
    check('fixed_subset_excludes_unformed_conflict_and_adopted',records().length===expected.length&&records().every(b=>expected.some(m=>m.id===b.dataset.memoryRecord))&&!fixture.querySelector('[data-memory-filter="state"]')&&!fixture.querySelector('[data-memory-filter="theme"]')&&!fixture.querySelector('[data-grid-layout]'));
    check('entering_subset_keeps_shared_selection',fixture.querySelector('.am-inspector')===inspector&&fixture.querySelector('.am-i-title')?.textContent===before&&fixture.textContent!.includes('not an approval queue'));
    if(expected.length){
      check('list_defaults_to_reading_and_retains_model_reasons',fixture.querySelector('.am-slips')?.getAttribute('data-layout')==='list'&&records().every(b=>b.querySelector('.am-held-reason span')?.textContent===expected.find(m=>m.id===b.dataset.memoryRecord)!.why));
      const first=records()[0];first.click();await wait(()=>first.getAttribute('aria-pressed')==='true');
      const chosen=AUTO_MEMORIES.find(m=>m.id===first.dataset.memoryRecord)!;
      check('inspect_is_only_shared_selection',fixture.querySelector('.am-statement')?.textContent===chosen.statement&&fixture.querySelectorAll('.am-opt:not(:disabled)').length===0);
      input().focus();const field=input();
      for(const language of ['zh-Hans','ja','en']){
        await setLang(language as Lang);await sleep();
        check(`${language}_focus_scope_reason_and_selection_survive`,document.activeElement===field&&input()===field&&records().length===expected.length&&records()[0]===first&&fixture.querySelector('.am-statement')?.textContent===chosen.statement&&first.querySelector('.am-held-reason span')?.textContent===chosen.why);
        if(DATASET==='unknown-result')check(`${language}_packet_and_key_kept`,fixture.querySelector('.am-unknown-result code')?.textContent===UNKNOWN_KEY&&fixture.querySelector('.am-unknown-result pre')?.textContent===UNKNOWN_PACKET&&fixture.querySelector<HTMLButtonElement>('.am-unknown-result button')!.disabled);
      }
      query('no-match-from-fixture');await wait(()=>records().length===0);
      check('no_match_is_scoped_and_keeps_inspector',fixture.textContent!.includes('Clear filters to see all loaded hypotheses.')&&fixture.querySelector('.am-statement')?.textContent===chosen.statement);
      fixture.querySelector<HTMLButtonElement>('[data-clear-memory-filters]')!.click();await wait(()=>records().length===expected.length);
      check('clear_never_escapes_fixed_subset',records().every(b=>expected.some(m=>m.id===b.dataset.memoryRecord))&&input().value===''&&fixture.querySelector('.am-statement')?.textContent===chosen.statement&&fixture.querySelector('.am-slips')?.getAttribute('data-layout')==='list');
    }else{
      check('zero_hypotheses_is_explicit_not_a_queue',records().length===0&&fixture.textContent!.includes('No record marked Held as hypothesis')&&fixture.querySelector('.am-i-title')?.textContent===before);
    }
  }
}catch(error){checks.push({id:String(error),ok:false});}
finally{root.unmount();document.getElementById('results')!.textContent=JSON.stringify({checks,passed:checks.every(c=>c.ok),dataset:DATASET});}
