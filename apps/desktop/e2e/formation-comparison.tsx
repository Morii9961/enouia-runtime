// Read-only conflict bodies and explicitly invented historical snapshots.
import {createRoot} from 'react-dom/client';
import AutoMemory from '../src/screens/automemory/AutoMemory';
import {AUTO_MEMORIES,DATASET,HISTORY} from '../src/screens/automemory/dataset';
import {UNKNOWN_KEY,UNKNOWN_PACKET} from '../src/screens/automemory/state-fixtures';
import {setLang,useLang,type Lang} from '../src/i18n';
const fixture=document.getElementById('fixture')!,root=createRoot(fixture),checks:{id:string;ok:boolean}[]=[];
const check=(id:string,ok:boolean)=>{checks.push({id,ok});if(!ok)throw Error(id);};
const sleep=()=>new Promise(resolve=>setTimeout(resolve,15));
async function wait(test:()=>boolean){for(let n=0;n<180;n++){if(test())return;await sleep();}throw Error('Comparison timeout');}
const view=(id:string)=>fixture.querySelector<HTMLButtonElement>(`[data-auto-view="${id}"]`)!;
const text=(side:string)=>fixture.querySelector(`[data-comparison-text="${side}"]`)?.textContent;
function revision(side:string,value:string){const select=fixture.querySelector<HTMLSelectElement>(`[data-revision-side="${side}"]`)!;select.value=value;select.dispatchEvent(new Event('change',{bubbles:true}));}
try{
  document.documentElement.dataset.motion='reduced';
  function Surface(){useLang();return <AutoMemory workspace="formation"/>;}
  root.render(<Surface/>);await wait(()=>!!view('conflicts'));
  const inspector=fixture.querySelector('.am-inspector');
  if(DATASET==='revisions'){
    const original=JSON.stringify(HISTORY),current=AUTO_MEMORIES[0];
    check('snapshots_are_explicit_same_id_current_body_matches',HISTORY!.length===3&&HISTORY!.every(r=>r.memoryId===current.id)&&HISTORY![2].text===current.statement&&HISTORY![2].revision===current.rev);
    view('revisions').click();await wait(()=>!!fixture.querySelector('[data-revision-side="left"]'));
    check('initial_revision_bodies_and_highlights_are_literal',text('a')===HISTORY![0].text&&text('b')===HISTORY![2].text&&fixture.querySelector('[data-comparison-text="a"] mark')?.textContent==='full'&&fixture.querySelector('[data-comparison-text="b"] mark')?.textContent==='short daily');
    check('historical_states_or_support_not_inferred',fixture.querySelectorAll('.am-comparison-side .am-state').length===0&&!fixture.querySelector('[data-conflict-excerpt]')&&fixture.textContent!.includes('No saved history is read.'));
    revision('left','r2');await wait(()=>text('a')===HISTORY![1].text);
    check('insertion_preserves_exact_whitespace_and_bodies',text('b')===HISTORY![2].text&&fixture.querySelectorAll('.am-comparison-text mark').length===1&&fixture.querySelector('[data-comparison-text="b"] mark')?.textContent==='daily ');
    const picker=fixture.querySelector<HTMLSelectElement>('[data-revision-side="left"]')!;picker.focus();
    const bodies=[...fixture.querySelectorAll('.am-comparison-text')];
    for(const language of ['zh-Hans','ja','en']){
      await setLang(language as Lang);await sleep();
      check(`${language}_revision_selection_focus_and_current_record_survive`,document.activeElement===picker&&picker.value==='r2'&&fixture.querySelector<HTMLSelectElement>('[data-revision-side="right"]')!.value==='r3'&&bodies.every((b,i)=>fixture.querySelectorAll('.am-comparison-text')[i]===b)&&text('a')===HISTORY![1].text&&text('b')===HISTORY![2].text&&fixture.querySelector('.am-statement')?.textContent===current.statement&&fixture.querySelector('.am-inspector')===inspector);
    }
    revision('left','r3');await wait(()=>fixture.querySelectorAll('.am-comparison-text mark').length===0);
    check('identical_body_does_not_create_change',text('a')===HISTORY![2].text&&text('b')===HISTORY![2].text&&fixture.textContent!.includes('No literal text difference'));
    revision('right','r1');await wait(()=>text('b')===HISTORY![0].text);
    check('reverse_comparison_does_not_revert_current_record',text('a')===HISTORY![2].text&&fixture.querySelector('.am-statement')?.textContent===current.statement&&fixture.querySelector('.am-i-id')?.textContent?.includes('r3')===true&&JSON.stringify(HISTORY)===original);
  }else{
    view('conflicts').click();await wait(()=>!!fixture.querySelector('[data-comparison-mode="conflicts"]'));
    if(DATASET==='source-missing'){
      check('unrelated_sample_does_not_invent_conflict',!fixture.querySelector('.am-comparison-side')&&!fixture.querySelector('[data-open-recorded-conflict]')&&fixture.querySelector('.am-statement')?.textContent===AUTO_MEMORIES[0].statement);
    }else{
      check('no_default_conflict_keeps_selection',!fixture.querySelector('.am-comparison-side')&&!!fixture.querySelector('[data-open-recorded-conflict]')&&fixture.querySelector('.am-i-title')?.textContent==='Vault port adapter next');
      fixture.querySelector<HTMLButtonElement>('[data-open-recorded-conflict]')!.click();await wait(()=>fixture.querySelector('.am-i-title')?.textContent==='Weekly or daily reviews?');
      const a=AUTO_MEMORIES.find(m=>m.id==='am_10')!,b=AUTO_MEMORIES.find(m=>m.id==='am_11')!;
      check('conflict_bodies_and_sources_are_original',text('a')===a.statement&&text('b')===b.statement&&[...fixture.querySelectorAll('[data-conflict-excerpt] blockquote')].map(e=>e.textContent).join('|')===[a.support[0].excerpt,b.support[0].excerpt].join('|'));
      check('both_stay_held_without_resolution_action',fixture.querySelectorAll('.am-comparison-side .am-g[data-s="conflict"]').length===2&&!fixture.querySelector('.am-comparison button')&&fixture.textContent!.includes('Reception order does not decide'));
      const picker=fixture.querySelector<HTMLSelectElement>('[data-comparison-select]')!;picker.focus();
      for(const language of ['zh-Hans','ja','en']){
        await setLang(language as Lang);await sleep();
        check(`${language}_conflict_focus_text_and_selection_survive`,document.activeElement===picker&&picker.value==='am_10'&&text('a')===a.statement&&text('b')===b.statement&&fixture.querySelector('.am-inspector')===inspector);
        if(DATASET==='unknown-result')check(`${language}_original_unknown_packet_key_kept`,fixture.querySelector('.am-unknown-result code')?.textContent===UNKNOWN_KEY&&fixture.querySelector('.am-unknown-result pre')?.textContent===UNKNOWN_PACKET&&fixture.querySelector<HTMLButtonElement>('.am-unknown-result button')!.disabled);
      }
    }
    view('revisions').click();await wait(()=>!!fixture.querySelector('[data-open-revision-sample]'));
    check('missing_history_is_not_reconstructed_from_notes',!fixture.querySelector('.am-comparison-side')&&!fixture.querySelector('[data-revision-side]')&&fixture.textContent!.includes('Previous revision bodies are unavailable'));
    const url=new URL(fixture.querySelector<HTMLAnchorElement>('[data-open-revision-sample]')!.href);
    check('revision_sample_link_keeps_exact_workspace_and_view',url.searchParams.get('auto-dataset')==='revisions'&&url.searchParams.get('auto-workspace')==='formation'&&url.searchParams.get('auto-view')==='revisions');
  }
}catch(error){checks.push({id:String(error),ok:false});}
finally{root.unmount();document.getElementById('results')!.textContent=JSON.stringify({checks,passed:checks.every(c=>c.ok),dataset:DATASET});}
