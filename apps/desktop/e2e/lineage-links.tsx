// Explicit invented links and unavailable steps, with a shared Inspector.
import {createRoot} from 'react-dom/client';
import AutoMemory from '../src/screens/automemory/AutoMemory';
import {AUTO_MEMORIES,DATASET} from '../src/screens/automemory/dataset';
import {UNKNOWN_KEY,UNKNOWN_PACKET} from '../src/screens/automemory/state-fixtures';
import {setLang,useLang,type Lang} from '../src/i18n';
const fixture=document.getElementById('fixture')!,root=createRoot(fixture),checks:{id:string;ok:boolean}[]=[];
const check=(id:string,ok:boolean)=>{checks.push({id,ok});if(!ok)throw Error(id);};
const sleep=()=>new Promise(resolve=>setTimeout(resolve,15));
async function wait(test:()=>boolean){for(let n=0;n<180;n++){if(test())return;await sleep();}throw Error('Lineage timeout');}
const view=(id:string)=>fixture.querySelector<HTMLButtonElement>(`[data-auto-view="${id}"]`)!;
const edges=()=>[...fixture.querySelectorAll('[data-lineage-edge]')].map(e=>e.getAttribute('data-lineage-edge')).join(',');
async function choose(id:string){const picker=fixture.querySelector<HTMLSelectElement>('[data-lineage-select]')!;picker.value=id;picker.dispatchEvent(new Event('change',{bubbles:true}));await wait(()=>fixture.querySelector('[data-lineage-selected]')?.getAttribute('data-lineage-selected')===id);}
try{
  document.documentElement.dataset.motion='reduced';
  function Surface(){useLang();return <AutoMemory workspace="relations"/>;}
  root.render(<Surface/>);await wait(()=>!!view('replacement'));
  const inspector=fixture.querySelector('.am-inspector');
  view('replacement').click();await wait(()=>!!fixture.querySelector('[data-lineage-mode="replacement"]'));
  if(DATASET==='source-missing'){
    check('missing_sample_has_no_invented_replacement',edges()===''&&fixture.textContent!.includes('This is not a finding about its full history.'));
    view('evidence').click();await wait(()=>!!fixture.querySelector('[data-lineage-mode="evidence"]'));
    check('missing_source_has_no_excerpt_or_receipt',!fixture.querySelector('[data-lineage-excerpt]')&&!fixture.querySelector('[data-lineage-dependency]')&&fixture.textContent!.includes('No supporting excerpts are available')&&fixture.querySelector('.am-statement')?.textContent===AUTO_MEMORIES[0].statement);
    for(const language of ['zh-Hans','ja','en']){await setLang(language as Lang);await sleep();check(`${language}_missing_source_keeps_statement`,fixture.querySelector('.am-statement')?.textContent===AUTO_MEMORIES[0].statement&&!fixture.querySelector('[data-lineage-excerpt]')&&fixture.querySelector('.am-inspector')===inspector);}
  }else{
    check('replacement_direction_is_recorded_new_to_old',edges()==='am_05:am_06'&&fixture.textContent!.includes('Its effective time is not recorded'));
    fixture.querySelector<HTMLButtonElement>('[data-link-to="am_06"] button')!.click();await wait(()=>fixture.querySelector('[data-lineage-selected]')?.getAttribute('data-lineage-selected')==='am_06');
    check('following_replacement_keeps_direction_and_inspector',edges()==='am_05:am_06'&&fixture.querySelector('.am-inspector')===inspector&&fixture.querySelector('[data-link-to="am_06"] button')?.getAttribute('aria-pressed')==='true');
    await choose('am_01');check('other_replacement_component_stays_separate',edges()==='am_01:am_02');
    await choose('am_03');check('absent_replacement_is_not_full_history_claim',edges()===''&&fixture.textContent!.includes('This is not a finding about its full history.'));
    view('evidence').click();await wait(()=>!!fixture.querySelector('[data-lineage-mode="evidence"]'));await choose('am_01');
    check('source_chain_uses_only_recorded_edges',edges()==='am_01:am_03,am_03:am_08');
    const selected=AUTO_MEMORIES.find(m=>m.id==='am_01')!;
    const excerpts=[...fixture.querySelectorAll('[data-lineage-excerpt] blockquote')];
    const deps=[...fixture.querySelectorAll('[data-lineage-dependency] code')];
    check('support_and_generation_dependencies_are_separate',excerpts.length===2&&excerpts.every((e,i)=>e.textContent===selected.support[i].excerpt)&&deps.length===1&&deps[0].textContent===selected.contextDeps[0].capsule&&!fixture.querySelector('[data-lineage-excerpt] [data-lineage-dependency]'));
    check('missing_receipts_are_not_fabricated',fixture.textContent!.includes('Formation notes are not commit receipts.')&&fixture.textContent!.includes('commit receipts remain unrepresented.'));
    const picker=fixture.querySelector<HTMLSelectElement>('[data-lineage-select]')!;picker.focus();
    for(const language of ['zh-Hans','ja','en']){
      await setLang(language as Lang);await sleep();
      check(`${language}_raw_excerpts_keys_focus_and_selection_survive`,document.activeElement===picker&&picker.value==='am_01'&&fixture.querySelector('.am-inspector')===inspector&&fixture.querySelector('.am-i-title')?.textContent==='Short answers'&&excerpts.every((e,i)=>fixture.querySelectorAll('[data-lineage-excerpt] blockquote')[i]===e&&e.textContent===selected.support[i].excerpt)&&deps[0].textContent===selected.contextDeps[0].capsule);
      if(DATASET==='unknown-result')check(`${language}_unknown_packet_and_key_not_rewritten`,fixture.querySelector('.am-unknown-result code')?.textContent===UNKNOWN_KEY&&fixture.querySelector('.am-unknown-result pre')?.textContent===UNKNOWN_PACKET&&fixture.querySelector<HTMLButtonElement>('.am-unknown-result button')!.disabled);
    }
    await choose('am_05');check('same_source_name_does_not_invent_extra_edges',edges()===''&&fixture.querySelectorAll('[data-lineage-excerpt]').length===2&&fixture.querySelectorAll('[data-lineage-dependency]').length===1);
    const link=new URL(fixture.querySelector<HTMLAnchorElement>('.am-demo-states a')!.href);
    check('demo_link_preserves_chain_view_and_workspace',link.searchParams.get('auto-view')==='evidence'&&link.searchParams.get('auto-workspace')==='relations');
  }
}catch(error){checks.push({id:String(error),ok:false});}
finally{root.unmount();document.getElementById('results')!.textContent=JSON.stringify({checks,passed:checks.every(c=>c.ok),dataset:DATASET});}
