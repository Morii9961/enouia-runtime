// ADR-039 correction journey over controlled catalog receipts. Synthetic only.
import { createRoot } from 'react-dom/client';
import { CatalogMemory } from '../src/memory/CatalogMemory';
import { setCatalogTransport } from '../src/memory/catalog';
import { status, page, stats, detail } from './fixtures/catalog.mjs';

const fixture=document.getElementById('fixture')!,root=createRoot(fixture);
const checks:{id:string;ok:boolean}[]=[],calls:any[]=[];
let corrections=true,unknownNext=false,lastPlan='';
const target={memory:{memory_id:'synthetic-memory-1',revision:1},hash:'e'.repeat(64)};
setCatalogTransport(async(_command,args)=>{
  const q=(args as any).request.query;calls.push(structuredClone(q));
  if(q.operation==='status')return {...status('open'),mode:'registered_owner_readonly',corrections};
  if(q.operation==='page')return page(q.filter.text,q.cursor);
  if(q.operation==='stats')return stats(q.selection,3);
  if(q.operation==='detail'){const d:any=detail(q.memory_id);if(d.item)d.item.formation_reason={interpretation:'clear_self_report',rule_version:'admission-rules-3',prompt_version:'chatgpt-connector-authored-1',model_version:'gpt-synthetic-1',mode:'live',note:'Synthetic ChatGPT note.',note_is_machine_annotation:true};d.history=[{memory:{...target,memory:{memory_id:q.memory_id,revision:1}},title:'t',knowledge:'attributed_statement',adoption:'adopted',interpretation:'clear_self_report',change:'initial',learned_at:'2026-11-03T00:00:00.000Z',effective_sensitivity:'private'}];d.history_count_in_scope=1;return d;}
  const envelope={schema_version:2,capability:'memory-native-read-2'};
  if(q.operation==='plan_action'){lastPlan=`op_${calls.length}`;}
  if(q.operation==='plan_action')return {...envelope,kind:'native_owner_preview',effect:'native_plan',plan:{operation_id:lastPlan},plan_hash:'a'.repeat(64),effects_hash:'b'.repeat(64),
    affected_current:[target],affected_count_in_scope:1,sensitivity:'private',original_sources_retained:true,physical_purge:false,
    proposed_correction:q.action.action==='correct'?{input:{content:q.action.assertion_text}}:null};
  if(q.operation==='confirm_action'){if(unknownNext){unknownNext=false;throw 'correction_outcome_unknown';}
    return {...envelope,kind:'native_owner_outcome',effect:'native_write',operation_id:q.operation_id,plan_hash:q.plan_hash,committed_in:'cmt_synthetic',actor:{actor_type:'owner'},action:'correct',memory_result:{memory_id:'synthetic-memory-1',revision:2},physical_purge:false};}
  if(q.operation==='action_outcome')return {...envelope,kind:'native_owner_outcome_lookup',effect:'native_read',outcome:{kind:'native_owner_outcome',operation_id:q.operation_id,plan_hash:'a'.repeat(64),committed_in:'cmt_recovered',actor:{actor_type:'owner'},action:'withdraw',memory_result:null,physical_purge:false}};
  throw new Error(`Unexpected ${q.operation}`);
});
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const text=()=>fixture.textContent??'';
async function wait(test:()=>boolean){for(let i=0;i<350;i++){if(test())return;await sleep(20);}throw new Error(`UI timeout: ${text().slice(0,1500)}`);}
const check=(id:string,ok:boolean)=>checks.push({id,ok});
const click=(label:string)=>{const b=[...fixture.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===label);if(!b||b.disabled)throw new Error(`Unavailable ${label}`);b.click();};
const ops=(op:string)=>calls.filter(c=>c.operation===op);
try{
  root.render(<CatalogMemory/>);
  await wait(()=>text().includes('Synthetic item 1'));
  click('Synthetic item 1');
  await wait(()=>text().includes('Change this record'));
  check('chatgpt_extracted_record_names_analyst_model_and_note',text().includes('Extracted by ChatGPT · gpt-synthetic-1')&&text().includes('ChatGPT note, not a fact'));
  check('registered_entry_offers_planned_changes',['Correct…','Withdraw…','Forget…','Protect','Pin'].every(l=>text().includes(l)));
  click('Correct…');
  await wait(()=>!!fixture.querySelector('section[aria-label="Change this record"] textarea'));
  const area=fixture.querySelector<HTMLTextAreaElement>('section[aria-label="Change this record"] textarea')!;
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(area,'合成纠正内容');area.dispatchEvent(new Event('input',{bubbles:true}));
  await sleep(30);click('Preview change');
  await wait(()=>text().includes('Planned change'));
  const plan=ops('plan_action').at(-1);
  check('correction_plan_sends_literal_text_and_confirmed_fields',plan.action.action==='correct'&&plan.action.assertion_text==='合成纠正内容'&&plan.action.target.hash==='e'.repeat(64)&&plan.correction.interpretation==='clear_self_report'&&plan.correction.content_lang==='en');
  check('plan_is_shown_before_any_write',ops('confirm_action').length===0&&text().includes('合成纠正内容')&&text().includes('Records affected'));
  click('Confirm and write');
  await wait(()=>text().includes('Written: correct in commit cmt_synthetic'));
  const confirm=ops('confirm_action').at(-1);
  check('confirm_sends_exact_plan_identity_once',ops('confirm_action').length===1&&confirm.operation_id===lastPlan&&confirm.plan_hash==='a'.repeat(64)&&confirm.effects_hash==='b'.repeat(64));
  click('Withdraw…');
  await wait(()=>[...fixture.querySelectorAll('button')].some(b=>b.textContent==='Preview change'));
  click('Preview change');
  await wait(()=>text().includes('Planned change'));
  unknownNext=true;click('Confirm and write');
  await wait(()=>text().includes('Check result'));
  const lost=ops('confirm_action').at(-1).operation_id;
  check('unknown_outcome_blocks_new_changes',[...fixture.querySelectorAll<HTMLButtonElement>('section[aria-label="Change this record"] .mem-actions button')].filter(b=>b.textContent==='Withdraw…'||b.textContent==='Correct…').every(b=>b.disabled));
  const confirms=ops('confirm_action').length;
  click('Check result');
  await wait(()=>text().includes('cmt_recovered'));
  check('unknown_outcome_is_looked_up_never_replayed',ops('action_outcome').at(-1).operation_id===lost&&ops('confirm_action').length===confirms);
  root.unmount();
  corrections=false;calls.length=0;
  const second=createRoot(fixture);second.render(<CatalogMemory/>);
  await wait(()=>text().includes('Synthetic item 1'));
  click('Synthetic item 1');
  await wait(()=>text().includes('Catalog record detail')&&!!fixture.querySelector('section[aria-label="Catalog record detail"] blockquote'));
  check('no_change_controls_without_native_corrections',!text().includes('Change this record'));
  second.unmount();
}catch(error){checks.push({id:String(error),ok:false});}
finally{document.getElementById('results')!.textContent=JSON.stringify({checks,passed:checks.length>0&&checks.every(c=>c.ok)});}
