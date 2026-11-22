// ADR-042 (D2) Agent request queue in Settings over controlled receipts. Synthetic only.
import { createRoot } from 'react-dom/client';
import { AgentRequestsPanel } from '../src/memory/Agents';
import { setCatalogTransport } from '../src/memory/catalog';
import { detail } from './fixtures/catalog.mjs';

const fixture=document.getElementById('fixture')!,root=createRoot(fixture);
const checks:{id:string;ok:boolean}[]=[],calls:any[]=[];
const envelope={schema_version:2,capability:'memory-native-read-2'};
const ref=(id:string)=>({memory:{memory_id:id,revision:1},hash:'e'.repeat(64)});
const evidence=(quote:string)=>({reference:{source_id:'src_synthetic',source_revision:1,object_hash:'f'.repeat(64)},quote,speaker:'user',start:0,end:quote.length});
const items=[
  {kind:'correction',key:'k1',request_id:'req_1',agent:'Claude Code',target:ref('synthetic-memory-1'),evidence:evidence('Synthetic quote one.'),text:'Synthetic proposed correction.',committed_in:'cmt_1',pending:true,ignored:false},
  {kind:'forget',key:'k2',request_id:'req_2',agent:null,target:ref('synthetic-memory-2'),evidence:evidence('Synthetic quote two.'),text:'Synthetic forget reason.',committed_in:'cmt_2',pending:true,ignored:false}];
const queue=(effect='native_read')=>({...envelope,kind:'runtime_agent_requests',effect,items:structuredClone(items)});
setCatalogTransport(async(_c,args)=>{
  const q=(args as any).request.query;calls.push(structuredClone(q));
  if(q.operation==='agent_requests')return queue();
  if(q.operation==='agent_request_ignore'){items.find(i=>i.key===q.key)!.ignored=q.ignored;return queue('local_write');}
  if(q.operation==='detail'){const d:any=detail(q.memory_id);d.history=[{memory:ref(q.memory_id),title:'t',knowledge:'attributed_statement',adoption:'adopted',interpretation:'clear_self_report',change:'initial',learned_at:'2026-11-03T00:00:00.000Z',effective_sensitivity:'private'}];d.history_count_in_scope=1;return d;}
  if(q.operation==='plan_action')return {...envelope,kind:'native_owner_preview',effect:'native_plan',plan:{operation_id:'op_1'},plan_hash:'a'.repeat(64),effects_hash:'b'.repeat(64),
    affected_current:[q.action.target],affected_count_in_scope:1,sensitivity:'private',original_sources_retained:true,physical_purge:false,proposed_correction:{input:{content:q.action.assertion_text}}};
  if(q.operation==='confirm_action'){items[0].pending=false;
    return {...envelope,kind:'native_owner_outcome',effect:'native_write',operation_id:q.operation_id,plan_hash:q.plan_hash,committed_in:'cmt_synthetic',actor:{actor_type:'owner'},action:'correct',memory_result:{memory_id:'synthetic-memory-1',revision:2},physical_purge:false};}
  throw new Error(`Unexpected ${q.operation}`);
});
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const text=()=>fixture.textContent??'';
async function wait(test:()=>boolean){for(let i=0;i<350;i++){if(test())return;await sleep(20);}throw new Error(`UI timeout: ${text().slice(0,1500)}`);}
const check=(id:string,ok:boolean)=>checks.push({id,ok});
const buttons=(label:string)=>[...fixture.querySelectorAll<HTMLButtonElement>('button')].filter(b=>b.textContent?.trim()===label);
const click=(label:string,index=0)=>{const b=buttons(label)[index];if(!b||b.disabled)throw new Error(`Unavailable ${label}`);b.click();};
const ops=(op:string)=>calls.filter(c=>c.operation===op);
try{
  root.render(<AgentRequestsPanel/>);
  await wait(()=>text().includes('2 waiting · 0 ignored · 0 resolved'));
  check('queue_shows_cited_words_and_unchecked_proposals',text().includes('Claude Code: Correction request')&&text().includes('Unnamed Agent: Forget request')&&
    text().includes('Synthetic quote one.')&&text().includes('Its proposed correction (not checked)')&&text().includes('Synthetic forget reason.'));
  click('Ignore',1);
  await wait(()=>text().includes('1 waiting · 1 ignored'));
  check('ignore_is_a_local_mark_only',ops('agent_request_ignore').length===1&&ops('agent_request_ignore')[0].key==='k2'&&ops('agent_request_ignore')[0].ignored===true&&!ops('plan_action').length);
  click('Review…');
  await wait(()=>text().includes('Change this record')&&!!fixture.querySelector('textarea'));
  check('review_opens_one_prefilled_correction',fixture.querySelector('textarea')!.value==='Synthetic proposed correction.'&&!buttons('Withdraw…').length&&buttons('Correct…').length===1&&!ops('plan_action').length);
  click('Preview change');
  await wait(()=>text().includes('Planned change'));
  const plan=ops('plan_action')[0];
  check('preview_plans_the_proposal_and_writes_nothing',plan.action.action==='correct'&&plan.action.assertion_text==='Synthetic proposed correction.'&&plan.action.target.memory.memory_id==='synthetic-memory-1'&&!ops('confirm_action').length);
  click('Confirm and write');
  await wait(()=>text().includes('Written. The request is resolved')&&text().includes('0 waiting · 1 ignored · 1 resolved'));
  check('confirm_writes_once_and_resolves_the_request',ops('confirm_action').length===1);
  click('Show ignored');
  await wait(()=>buttons('Return to queue').length===1);
  click('Return to queue');
  await wait(()=>text().includes('1 waiting · 0 ignored · 1 resolved'));
  check('ignored_request_can_return_to_the_queue',ops('agent_request_ignore')[1].ignored===false);
}catch(error){checks.push({id:String(error),ok:false});}
finally{root.unmount();document.getElementById('results')!.textContent=JSON.stringify({checks,passed:checks.length>0&&checks.every(c=>c.ok)});}
