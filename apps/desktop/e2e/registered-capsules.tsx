// Memory ADR-MEM-173 Capsule save / list / delete with saving turned on, over controlled receipts. Synthetic only.
import { createRoot } from 'react-dom/client';
import { CapsuleIndex, SaveCapsule } from '../src/memory/Capsules';
import { setCatalogTransport } from '../src/memory/catalog';

const fixture=document.getElementById('fixture')!,root=createRoot(fixture);
const checks:{id:string;ok:boolean}[]=[],calls:any[]=[];
const envelope={schema_version:2,capability:'memory-native-read-2'};
const ref=(n:number)=>({memory:{memory_id:`synthetic-memory-${n}`,revision:1},hash:'e'.repeat(64)});
let capsules:any[]=[];
setCatalogTransport(async(_c,args)=>{
  const q=(args as any).request.query;calls.push(structuredClone(q));
  if(q.operation==='capsules')return {...envelope,kind:'runtime_capsules',effect:'native_read',saving_enabled:true,capsules};
  if(q.operation==='plan_capsule')return {...envelope,kind:'native_owner_preview',effect:'native_plan',plan:{operation_id:'op_c'},plan_hash:'a'.repeat(64),effects_hash:'b'.repeat(64),affected_current:[],affected_count_in_scope:0,sensitivity:'private',original_sources_retained:true,physical_purge:false,proposed_correction:null};
  if(q.operation==='confirm_action'){const p=calls.filter(c=>c.operation==='plan_capsule').at(-1);
    capsules=p.members.length?[{name:p.name,query:p.query,members:[{saved:ref(1),current:ref(1)},{saved:ref(2),current:null}]}]:[];
    return {...envelope,kind:'native_owner_outcome',effect:'native_write',operation_id:q.operation_id,plan_hash:q.plan_hash,committed_in:'cmt_c',actor:{actor_type:'owner'},action:'capsule',memory_result:null,physical_purge:false};}
  throw new Error(`Unexpected ${q.operation}`);
});
const preview:any={trace:{authorized_at:'2026-11-23T00:00:00Z',selected:[{memory:{memory_id:'synthetic-memory-1',revision:1}},{memory:{memory_id:'synthetic-memory-2',revision:1}}]},selected_targets:[ref(1),ref(2)]};
let tick=0,used='';
const render=()=>root.render(<><SaveCapsule query="pottery" preview={preview} saved={()=>{tick++;render();}}/><CapsuleIndex refresh={tick} use={q=>{used=q;}}/></>);
render();
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const text=()=>fixture.textContent??'';
async function wait(test:()=>boolean){for(let i=0;i<400;i++){if(test())return;await sleep(20);}throw new Error(`UI timeout: ${text().slice(0,1200)}`);}
const check=(id:string,ok:boolean)=>checks.push({id,ok});
const button=(label:string)=>[...fixture.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===label&&!b.disabled);
try{
  await wait(()=>text().includes('No saved Capsules.')&&!!button('Save as Capsule…'));
  button('Save as Capsule…')!.click();
  await wait(()=>text().includes('Planned Capsule: pottery'));
  const plan=calls.find(c=>c.operation==='plan_capsule');
  check('save_plans_name_cue_and_members_in_order_without_writing',plan.name==='pottery'&&plan.query==='pottery'&&plan.members.map((m:any)=>m.memory.memory_id).join()==='synthetic-memory-1,synthetic-memory-2'&&plan.members[0].hash==='e'.repeat(64)&&!calls.some(c=>c.operation==='confirm_action'));
  button('Confirm and write')!.click();
  await wait(()=>text().includes('Saved.')&&text().includes('Cue: pottery'));
  check('saved_capsule_lists_members_and_unreadable_count',text().includes('2 records')&&text().includes('1 no longer readable'));
  button('Run this cue again')!.click();
  check('run_again_uses_the_saved_cue',used==='pottery');
  button('Delete…')!.click();
  await wait(()=>text().includes('Planned: delete pottery'));
  check('delete_plans_an_empty_member_list',calls.filter(c=>c.operation==='plan_capsule').at(-1).members.length===0);
  [...fixture.querySelectorAll<HTMLButtonElement>('button')].filter(b=>b.textContent==='Confirm and write').at(-1)!.click();
  await wait(()=>text().includes('No saved Capsules.'));
  check('deleted_capsule_leaves_the_list',calls.filter(c=>c.operation==='confirm_action').length===2);
}catch(error){checks.push({id:String(error),ok:false});}
finally{root.unmount();document.getElementById('results')!.textContent=JSON.stringify({checks,passed:checks.length>0&&checks.every(c=>c.ok)});}
