// Memory ADR-MEM-172 identity decisions in People and places over controlled receipts. Synthetic only.
import { createRoot } from 'react-dom/client';
import { RegisteredPeople } from '../src/memory/People';
import { MemoryStatusProvider } from '../src/memory/status';
import { setTransport } from '../src/memory/client';
import { setCatalogTransport } from '../src/memory/catalog';
import { status } from './fixtures/catalog.mjs';

const fixture=document.getElementById('fixture')!,root=createRoot(fixture);
const checks:{id:string;ok:boolean}[]=[],calls:any[]=[];
const envelope={schema_version:2,capability:'memory-native-read-2'};
let confirmed=false;
const rec=(n:number)=>({entity_id:`ent_${n}`,resolved_entity_id:`ent_${n}`,display_name:'Aiko',memories:1,opted_out:false});
const groups=()=>({...envelope,kind:'runtime_entity_identities',effect:'native_read',total_groups:2,complete:true,groups:[
  {basis:confirmed?'confirmed':'same_name',entity_type:'person',name:'Aiko',records:[rec(1),rec(2)]},
  {basis:'single',entity_type:'person',name:'Ren',records:[{...rec(3),display_name:'Ren'}]}]});
setTransport(async(command)=>{
  if(command==='shell_status')return {vaultChanging:false,memoryEntry:'registered_owner_readonly'};
  if(command==='memory_call')return {kind:'memory_page',result:{vault:{state:'none'},pendingCandidates:0,components:[],companion:{exiting:false}}};
  throw new Error(`Unexpected ${command}`);
});
setCatalogTransport(async(_c,args)=>{
  const q=(args as any).request.query;calls.push(structuredClone(q));
  if(q.operation==='status')return {...status('open'),mode:'registered_owner_readonly',corrections:true};
  if(q.operation==='entity_identities')return groups();
  if(q.operation==='plan_action')return {...envelope,kind:'native_owner_preview',effect:'native_plan',plan:{operation_id:'op_1'},plan_hash:'a'.repeat(64),effects_hash:'b'.repeat(64),affected_current:[],affected_count_in_scope:2,sensitivity:'private',original_sources_retained:true,physical_purge:false,proposed_correction:null};
  if(q.operation==='confirm_action'){confirmed=true;return {...envelope,kind:'native_owner_outcome',effect:'native_write',operation_id:q.operation_id,plan_hash:q.plan_hash,committed_in:'cmt_1',actor:{actor_type:'owner'},action:'entity_identity',memory_result:null,physical_purge:false};}
  throw new Error(`Unexpected ${q.operation}`);
});
root.render(<MemoryStatusProvider><RegisteredPeople/></MemoryStatusProvider>);
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const text=()=>fixture.textContent??'';
async function wait(test:()=>boolean){for(let i=0;i<400;i++){if(test())return;await sleep(20);}throw new Error(`UI timeout: ${text().slice(0,1200)}`);}
const check=(id:string,ok:boolean)=>checks.push({id,ok});
const buttons=(label:string)=>[...fixture.querySelectorAll<HTMLButtonElement>('button')].filter(b=>b.textContent?.trim()===label);
const plans=()=>calls.filter(c=>c.operation==='plan_action');
try{
  await wait(()=>text().includes('Linked by the same name · not confirmed'));
  check('same_name_group_is_marked_unconfirmed_and_single_offers_merge',text().includes('Single card')&&buttons('Merge into…').length===1&&buttons('Confirm they are the same…').length===1);
  buttons('Confirm they are the same…')[0].click();
  await wait(()=>text().includes('Planned decision: Aiko: the same one'));
  const same=plans()[0].action;
  check('confirm_plans_same_for_every_card_and_writes_nothing_yet',same.action==='entity_identity'&&same.same===true&&same.entities.join()==='ent_1,ent_2'&&!calls.some(c=>c.operation==='confirm_action'));
  buttons('Confirm and write')[0].click();
  await wait(()=>text().includes('Confirmed as one')&&buttons('Not the same…').length===2&&!buttons('Not the same…')[1].disabled);
  check('confirmed_group_reads_again',calls.filter(c=>c.operation==='confirm_action').length===1);
  buttons('Not the same…')[1].click();
  await wait(()=>text().includes('Planned decision: Aiko is not the same'));
  const apart=plans()[1].action;
  check('not_the_same_puts_the_separated_card_first',apart.same===false&&apart.entities.join()==='ent_2,ent_1');
  buttons('Cancel')[0].click();
  await wait(()=>!buttons('Merge into…')[0].disabled);
  buttons('Merge into…')[0].click();
  await wait(()=>text().includes('Merge Ren into…'));
  [...fixture.querySelectorAll<HTMLButtonElement>('section[aria-label="Merge into another group"] button')].find(b=>b.textContent==='Aiko')!.click();
  await wait(()=>text().includes('Planned decision: Merge Ren into Aiko'));
  const merge=plans()[2].action;
  check('merge_plans_same_with_a_card_of_the_target',merge.same===true&&merge.entities.join()==='ent_3,ent_1');
}catch(error){checks.push({id:String(error),ok:false});}
finally{root.unmount();document.getElementById('results')!.textContent=JSON.stringify({checks,passed:checks.length>0&&checks.every(c=>c.ok)});}
