// Read-only invented recall cards: same case, raw reasons, no action.
import {createRoot} from 'react-dom/client';
import AutoMemory from '../src/screens/automemory/AutoMemory';
import {AUTO_MEMORIES,DATASET,RECALL_CASES} from '../src/screens/automemory/dataset';
import {UNKNOWN_KEY,UNKNOWN_PACKET} from '../src/screens/automemory/state-fixtures';
import {setLang,useLang,type Lang} from '../src/i18n';
const fixture=document.getElementById('fixture')!,root=createRoot(fixture),checks:{id:string;ok:boolean}[]=[];
const check=(id:string,ok:boolean)=>{checks.push({id,ok});if(!ok)throw Error(id);};
const sleep=()=>new Promise(resolve=>setTimeout(resolve,15));
async function wait(test:()=>boolean){for(let n=0;n<180;n++){if(test())return;await sleep();}throw Error('Recall cards timeout');}
const view=(id:string)=>fixture.querySelector<HTMLButtonElement>(`[data-auto-view="${id}"]`)!;
try{
  document.documentElement.dataset.motion='reduced';
  function Surface(){useLang();return <AutoMemory workspace="recall"/>;}
  const original=JSON.stringify([AUTO_MEMORIES,RECALL_CASES]);
  root.render(<Surface/>);await wait(()=>!!view('suggestions'));
  const inspector=fixture.querySelector('.am-inspector'),before=fixture.querySelector('.am-statement')?.textContent;
  view('suggestions').click();await wait(()=>fixture.querySelector('.am')?.getAttribute('data-view')==='suggestions');
  if(!AUTO_MEMORIES.length){
    check('empty_sample_does_not_invent_case_or_memory',!fixture.querySelector('.am-cases')&&!fixture.querySelector('.am-suggestion-card')&&!fixture.querySelector('.am-statement'));
  }else if(!RECALL_CASES.length){
    check('no_complete_case_does_not_invent_feed',!fixture.querySelector('.am-cases')&&!fixture.querySelector('.am-suggestion-card')&&fixture.textContent!.includes('No recall case belongs to this sample.')&&fixture.querySelector('.am-statement')?.textContent===before);
  }else{
    check('cards_are_explicit_case_reading_not_live_feed',fixture.querySelectorAll('.am-cases button').length===RECALL_CASES.length&&fixture.textContent!.includes('not a live suggestion feed')&&fixture.textContent!.includes('no action is recorded'));
    for(const [index,c] of RECALL_CASES.entries()){
      fixture.querySelectorAll<HTMLButtonElement>('.am-cases button')[index].click();await wait(()=>fixture.querySelector('[data-recall-case]')?.getAttribute('data-recall-case')===c.id);
      const all=[...c.included,...c.excluded],cards=()=>[...fixture.querySelectorAll<HTMLElement>('.am-suggestion-card')];
      check(`${c.id}_exact_membership_reasons_and_raw_statements`,cards().map(e=>e.dataset.suggestionMemory).join()===all.map(e=>e.id).join()&&cards().every((e,i)=>e.querySelector('[data-suggestion-reason]')!.textContent===all[i].reason&&e.querySelector('.am-suggestion-statement')!.textContent===AUTO_MEMORIES.find(m=>m.id===all[i].id)!.statement)&&fixture.querySelector('.am-moment')!.textContent!.includes(c.moment));
      check(`${c.id}_exclusions_are_not_reclassified_as_fading`,fixture.querySelectorAll('[data-suggestion-group="included"] .am-suggestion-card').length===c.included.length&&fixture.querySelectorAll('[data-suggestion-group="excluded"] .am-suggestion-card').length===c.excluded.length&&cards().every(e=>e.querySelector('.am-state .am-g')?.getAttribute('data-s')===AUTO_MEMORIES.find(m=>m.id===e.dataset.suggestionMemory)!.state));
      const chosen=all[all.length-1],record=AUTO_MEMORIES.find(m=>m.id===chosen.id)!;
      const ref=fixture.querySelector<HTMLButtonElement>(`[data-suggestion-memory="${chosen.id}"] .am-ref`)!;ref.click();await wait(()=>fixture.querySelector('.am-statement')?.textContent===record.statement);ref.focus();
      const nodes=cards();
      for(const language of ['zh-Hans','ja','en']){
        await setLang(language as Lang);await sleep();
        check(`${c.id}_${language}_keeps_case_focus_original_reason_and_inspector`,document.activeElement===ref&&fixture.querySelector('.am-inspector')===inspector&&fixture.querySelector('.am-statement')?.textContent===record.statement&&nodes.every((node,i)=>cards()[i]===node&&node.querySelector('[data-suggestion-reason]')!.textContent===all[i].reason)&&fixture.querySelector('[data-recall-case]')?.getAttribute('data-recall-case')===c.id);
        if(DATASET==='unknown-result')check(`${c.id}_${language}_original_unknown_packet_and_key`,fixture.querySelector('.am-unknown-result pre')?.textContent===UNKNOWN_PACKET&&fixture.querySelector('.am-unknown-result code')?.textContent===UNKNOWN_KEY&&fixture.querySelector<HTMLButtonElement>('.am-unknown-result button')!.disabled);
      }
      const controls=[...fixture.querySelectorAll<HTMLButtonElement>('.am-suggestion-card .am-opt')];controls.forEach(b=>b.click());
      check(`${c.id}_reminder_and_dismissal_never_change_records`,controls.length===all.length*2&&controls.every(b=>b.disabled)&&JSON.stringify([AUTO_MEMORIES,RECALL_CASES])===original&&fixture.querySelector('.am-statement')?.textContent===record.statement);
      view('recall').click();await wait(()=>!!fixture.querySelector('.am-steps'));
      check(`${c.id}_pipeline_retains_same_case_and_budget`,fixture.querySelectorAll('.am-cases button')[index].getAttribute('aria-pressed')==='true'&&fixture.querySelector('.am-rank tbody')!.textContent!.includes(c.included[0].reason)&&fixture.querySelector('.am-budget')!.getAttribute('aria-label')!.includes(String(c.budget.used))&&fixture.querySelector('.am-statement')?.textContent===record.statement);
      view('suggestions').click();await wait(()=>!!fixture.querySelector('[data-recall-case]'));
      check(`${c.id}_return_to_cards_preserves_case_and_selection`,fixture.querySelector('[data-recall-case]')?.getAttribute('data-recall-case')===c.id&&fixture.querySelector<HTMLButtonElement>(`[data-suggestion-memory="${chosen.id}"] .am-ref`)?.getAttribute('aria-pressed')==='true');
    }
  }
  const link=fixture.querySelector<HTMLAnchorElement>('.am-demo-states a')!,url=new URL(link.href);
  check('demo_link_preserves_recall_workspace_and_cards',url.searchParams.get('auto-workspace')==='recall'&&url.searchParams.get('auto-view')==='suggestions');
}catch(error){checks.push({id:String(error),ok:false});}
finally{root.unmount();document.getElementById('results')!.textContent=JSON.stringify({checks,passed:checks.every(c=>c.ok),dataset:DATASET});}
