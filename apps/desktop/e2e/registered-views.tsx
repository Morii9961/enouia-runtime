// Registered read-only workspaces over controlled catalog receipts. Synthetic
// documents only: no OS, native IPC or personal library.
import { createRoot } from 'react-dom/client';
import { MemoryStatusProvider, ConnectedHome } from '../src/memory/status';
import MemorySurface from '../src/memory/MemorySurface';
import SessionsSurface from '../src/memory/SessionsSurface';
import ContextSurface from '../src/memory/ContextSurface';
import RuntimeSurface from '../src/runtime/RuntimeSurface';
import { setTransport } from '../src/memory/client';
import { setCatalogTransport } from '../src/memory/catalog';
import { setLang, type Lang } from '../src/i18n';
import { envelope, selection, status, page, stats, detail, source } from './fixtures/catalog.mjs';

const fixture=document.getElementById('fixture')!,root=createRoot(fixture);
const checks:{id:string;ok:boolean}[]=[],calls:string[]=[];
let state='open';
const header={selection,algorithm:'synthetic',version:2,parameters_hash:'e'.repeat(64),permission_hash:'f'.repeat(64),authorized_at:selection.evaluated_at,scope:'authorized_current_dependencies',matched_inputs:3,included_inputs:3,complete_in_scope:true,limits:[]};
const node=(n:number)=>({memory:{memory:{memory_id:`synthetic-memory-${n}`,revision:1},hash:'e'.repeat(64)},title:n===2?'调试偏好':`Synthetic item ${n}`,form:'preference',knowledge:'attributed_statement',adoption:'adopted',validity:'unspecified',attention:'active',event_time:{from:null,until:null,precision:'unknown',bound:'within',tz:null,basis:'unknown'},entities:[],themes:[]});
const time={from:'2026-03-01T00:00:00Z',until:null,precision:'month',bound:'within',tz:'Asia/Shanghai',basis:'stated'};
setTransport(async(command,args)=>{
  calls.push(command==='memory_call'?(args as any).request.command:command);
  if(command==='shell_status')return {vaultChanging:false,memoryEntry:'registered_owner_readonly'};
  if(command==='shell_lifecycle_status')return {closing:false};
  if(command==='startup_status')return {supported:false,enabled:false};
  if(command==='memory_call')return {kind:'memory_page',result:{vault:{state:'none'},pendingCandidates:0,components:[],companion:{exiting:false}}};
  throw new Error(`Unexpected command ${command}`);
});
setCatalogTransport(async(_command,args)=>{
  const q=(args as any).request.query;calls.push(`catalog:${q.operation}`);
  if(q.operation==='status'){const r:any={...status(state),mode:'registered_owner_readonly'};if(state==='open'){r.recall_limits={max_items:8,max_bytes:16384};r.corrections=true;}return r;}
  if(state!=='open')throw 'catalog_locked';
  if(q.operation==='page'){const p:any=page(q.filter.text,q.cursor);p.items=p.items.slice(0,q.filter.time_window?1:q.limit);return p;}
  if(q.operation==='stats')return {...stats(q.selection,3),groups:[{axis:'adoption',count_scope:'matched',values:[{value:'adopted',label:'adopted',count:2},{value:'staged',label:'staged',count:1}],total_values:2}]};
  if(q.operation==='detail'){const d:any=detail(q.memory_id);if(q.memory_id==='synthetic-memory-1'&&d.item){d.item.base.memory.revision=2;
    d.history=[1,2].map(r=>({memory:{memory:{memory_id:q.memory_id,revision:r},hash:'e'.repeat(64)},title:'t',knowledge:'attributed_statement',adoption:'adopted',interpretation:'clear_self_report',change:r===1?'initial':'correction',learned_at:'2026-11-03T00:00:00.000Z',effective_sensitivity:'private'}));d.history_count_in_scope=2;}return d;}
  if(q.operation==='revision_diff')return {...envelope,kind:'memory_revision_diff',header,before:{memory:{memory_id:q.memory_id,revision:q.before},hash:'e'.repeat(64)},after:{memory:{memory_id:q.memory_id,revision:q.after},hash:'e'.repeat(64)},
    fields:[{field:'content',before:'I made a blue pottery cup.',after:'I made a green pottery cup.'}],structural_only:true};
  if(q.operation==='source')return source(q.start,q.limit);
  if(q.operation==='time_buckets')return {...envelope,kind:'memory_time_buckets',header,query:q.query,interval_rule:'possible',material_scope:'authorized',unknown_time_in_scope:2,
    buckets:[{local_start:'2026-02-01',from:'2026-01-31T16:00:00Z',until:'2026-02-28T16:00:00Z',possible_records:0,staged:0,adopted:0,captured_material:0},
      {local_start:'2026-03-01',from:'2026-02-28T16:00:00Z',until:'2026-03-31T16:00:00Z',possible_records:1,staged:0,adopted:1,captured_material:2}]};
  if(q.operation==='graph'){const more=!!q.cursor;return {...envelope,kind:'memory_graph_page',header,nodes:more?[node(3)]:[node(1),node(2)],
    edges:more?[{from:'synthetic-memory-1',to:'synthetic-memory-3',relation:'same_conversation',class:'recorded_relation',witness:'w',score_milli:null}]:[{from:'synthetic-memory-1',to:'synthetic-memory-2',relation:'lexical_neighbor',class:'algorithm_suggestion',witness:'shared_terms:alps,hiking',score_milli:420}],
    edge_coverage:[{relation:'same_conversation',candidates:1,retained:1},{relation:'lexical_neighbor',candidates:1,retained:1}],semantic_neighbors_available:false,next:more?null:{opaque:1}};}
  if(q.operation==='neighbors')return {...envelope,kind:'native_memory_neighbors',header,selected:null,matched_in_scope:1,next:null,
    items:[{other:{memory:{memory:{memory_id:'synthetic-memory-3',revision:1},hash:'e'.repeat(64)},title:'Synthetic item 3',knowledge:'attributed_statement',adoption:'adopted',interpretation:'clear_self_report',change:'new',learned_at:selection.evaluated_at,effective_sensitivity:'private'},relations:[{relation:'same_conversation',class:'recorded_relation',direction:'both',witnesses:[],witness_count_in_scope:1,witnesses_complete:true}]}]};
  if(q.operation==='review_suggestions')return {...envelope,kind:'memory_review_suggestions',header,query:q.query,total_in_horizon:1,
    items:[{memory:node(1).memory,title:'Synthetic item 1',attention:'fading',due:'2026-12-01T00:00:00Z',reasons:['archives_soon'],archives_at:'2026-12-01T00:00:00Z',valid_until:null}]};
  if(q.operation==='attention_schedule')return {...envelope,kind:'memory_attention_schedule',header,query:q.query,fade_after_days:30,archive_after_days:180,protected_in_scope:1,
    events:[{memory:node(3).memory,title:'Synthetic item 3',transition:'fading',at:'2026-12-10T00:00:00Z',past:false}],next:null};
  if(q.operation==='activity')return {...envelope,kind:'memory_activity_page',header,matched_in_scope:1,complete_in_scope:true,next:null,time_derived_events_available:false,
    items:[{event_id:'a'.repeat(64),event_kind:'formation',memory:{memory_id:'synthetic-memory-1',revision:1},source:null,title:'Synthetic item 1',change:'new',knowledge:'attributed_statement',adoption:'adopted',effective_sensitivity:'private',formation_reason:null,proof:{commit_id:'c',commit_hash:'d'.repeat(64),actor:{actor_type:'system'},written_at:'2026-11-03T00:00:00Z'},receipt:null}]};
  if(q.operation==='conflicts'){const pair=[1,2].map(n=>{const d:any=detail(`synthetic-memory-${n}`);return d.item;}).filter(Boolean);
    return {...envelope,kind:'memory_conflict_group',header,selected:null,basis:'qualified',counter_evidence:[],matched_in_scope:pair.length,items:pair,next:null};}
  if(q.operation==='conversations')return {...envelope,kind:'native_conversation_page',header,matched_in_scope:4,next:null,
    items:[{conversation:{conversation_id:'ses_synthetic',platform:'synthetic',account_scope:'chatgpt-connector-synthetic',title:'Synthetic conversation',started_at:time,ended_at:time,original_conversation_id:null},visible_captured_turns:1,visible_captured_sources:1,effective_sensitivity:'private',platform_complete_not_claimed:true}]};
  if(q.operation==='conversation_detail')return {...envelope,kind:'native_conversation_detail',header,conversation:{conversation_id:'ses_synthetic',platform:'synthetic',title:'Synthetic conversation',started_at:time,ended_at:time,original_conversation_id:null},
    visible_captured_turns:1,visible_captured_sources:1,next:null,platform_complete_not_claimed:true,
    turns:[{turn:{turn_id:'turn_1',sequence:1,source:{source_id:'synthetic-source',source_revision:1}},source_record:{reference:{source_id:'synthetic-source',source_revision:1},speaker:'user',source_kind:'export_message'},fields:{}}]};
  if(q.operation==='recall_preview'){recalls.push(q.query);return {...envelope,kind:'native_recall_preview',complete_in_scope:true,rendered_context:'Synthetic rendered context',
    trace:{algorithm:'attention-rank-1',snapshot:selection.snapshot,profile_hash:'a'.repeat(64),at:q.query.at,authorized_at:selection.evaluated_at,considered:3,rendered_bytes:120,
      selected:[{memory:{memory_id:'synthetic-memory-2',revision:1},attention:'active',score:900,reasons:['lexical']}],excluded:[[{memory_id:'synthetic-memory-1',revision:1},'no_cue']]},
    trace_coverage:{excluded_in_scope:2,excluded_returned:1,complete:true,reason_counts:{no_cue:2}},
    items:[{base:{memory:{memory_id:'synthetic-memory-2',revision:1},content:'合成示例'},record:{fields:{title:'调试偏好'}}}]};}
  if(q.operation==='connector_status')return {...envelope,kind:'runtime_connector_status',effect:'native_read',windows:[]};
  throw new Error(`Unexpected catalog query ${q.operation}`);
});
const recalls:any[]=[];
const nav=Object.fromEntries(['memory','context','sessions'].map(name=>[name,{go:()=>{}}]));
root.render(<MemoryStatusProvider><ConnectedHome nav={nav} ring={null}/><MemorySurface/><SessionsSurface inspect={()=>{}}/><ContextSurface capsuleId={null}/><RuntimeSurface/></MemoryStatusProvider>);
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const text=()=>fixture.textContent??'';
const within=(label:string)=>fixture.querySelector(`[data-screen-label="${label}"]`)?.textContent??'';
async function wait(test:()=>boolean){for(let i=0;i<400;i++){if(test())return;await sleep(20);}throw new Error(`UI timeout: ${text().slice(0,2000)}`);}
const check=(id:string,ok:boolean)=>checks.push({id,ok});
const buttons=()=>[...fixture.querySelectorAll<HTMLButtonElement>('button')];
const click=(label:string,scope:Element=fixture)=>{const b=[...scope.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===label||b.getAttribute('aria-label')===label);if(!b)throw new Error(`Missing ${label}`);b.click();};
try{
  await wait(()=>within('Home').includes('3 records · 2 adopted · 1 staged'));
  check('home_reads_registered_totals_latest_event_and_conversations',within('Home').includes('Latest: Synthetic item 1')&&within('Home').includes('4 captured conversations')&&!within('Home').includes('Read saved Capsules'));
  await wait(()=>within('Runtime Inspector').includes('Authorized records'));
  await wait(()=>within('Runtime Inspector').includes('Not connected'));
  check('connector_is_shown_as_not_connected_not_faked',within('Runtime Inspector').includes('not deployed yet')&&calls.includes('catalog:connector_status'));
  check('inspector_reads_snapshot_and_counts',within('Runtime Inspector').includes('synthetic-commit')&&within('Runtime Inspector').includes('memory-native-read-2'));
  const memory=fixture.querySelector('[data-screen-label="Memory Vault"]')!;
  click('Time',memory.querySelector('.qr28')!);
  await wait(()=>!!memory.querySelector('.mem-time-cell'));
  check('time_grid_shows_only_dated_months_and_unknown_count',memory.querySelectorAll('.mem-time-cell').length===1&&memory.textContent!.includes('2 records have no recorded time on this axis.'));
  memory.querySelector<HTMLButtonElement>('.mem-time-cell')!.click();
  await wait(()=>memory.textContent!.includes('Records in 2026-03'));
  await wait(()=>memory.textContent!.includes('1 shown'));
  const windowed=calls.filter(c=>c==='catalog:page').length;
  check('month_choice_reads_records_with_core_time_window',windowed>0&&memory.textContent!.includes('Synthetic item 1'));
  click('Connections',memory.querySelector('.qr28')!);
  await wait(()=>memory.textContent!.includes('3 records and 2 relations loaded.'));
  check('most_connected_records_are_named_by_title',[...memory.querySelectorAll('.qr44 .mem-list button')].map(b=>b.textContent).includes('Synthetic item 3')&&![...memory.querySelectorAll('.qr44 .mem-list button')].some(b=>b.textContent?.startsWith('synthetic-memory')));
  check('graph_reads_every_core_chunk_and_states_semantic_gap',calls.filter(c=>c==='catalog:graph').length>=2&&memory.textContent!.includes('Semantic neighbours are not available yet.'));
  check('shared_word_suggestions_name_terms_and_stay_suggestions',memory.textContent!.includes('Shared-word suggestions')&&memory.textContent!.includes('shared: alps, hiking · score 0.42')&&memory.textContent!.includes('not a recorded or semantic relation'));
  click('Synthetic item 1',memory);
  await wait(()=>memory.textContent!.includes('1 connected records'));
  check('neighbors_name_recorded_relation',memory.textContent!.includes('Same conversation · Recorded relation'));
  click('Formation',memory.querySelector('.qr28')!);
  await wait(()=>memory.textContent!.includes('1 of 1 events shown'));
  click('Synthetic item 1',memory);
  await wait(()=>!!memory.querySelector('[data-conflict-compare]'));
  check('formation_event_opens_detail_and_conflict_group',memory.textContent!.includes('Catalog record detail')&&memory.textContent!.includes('Fading and archiving by time are not recorded as events yet.'));
  await wait(()=>!!memory.querySelector('[data-revision-diff] mark')&&!!memory.querySelector('[data-conflict-compare]'));
  check('revision_diff_marks_literal_change_side_by_side',calls.includes('catalog:revision_diff')&&[...memory.querySelectorAll('[data-revision-diff] mark')].map(m=>m.textContent).join('|')==='blue|green');
  check('conflict_pair_shown_side_by_side_without_resolution',memory.querySelector('[data-conflict-compare]')!.textContent!.includes('Statement A')&&memory.querySelector('[data-conflict-compare]')!.textContent!.includes('Statement B')&&!memory.textContent!.includes('Resolve'));
  click('Held hypotheses',memory);
  await wait(()=>memory.textContent!.includes('held hypotheses shown'));
  check('held_hypotheses_read_by_knowledge_filter',memory.textContent!.includes('Keeping one is not confirming it.'));
  click('Worth a look',memory.querySelector('.qr28')!);
  await wait(()=>memory.textContent!.includes('1 of 1 records worth a look in the next 30 days.')&&memory.textContent!.includes('Starts fading'));
  check('review_suggestions_are_time_based_and_derived',memory.textContent!.includes('Archived soon')&&memory.textContent!.includes('They say nothing about whether a record is right')&&
    memory.textContent!.includes('These moments are derived, not recorded. 1 protected records never fade.')&&memory.textContent!.includes('Synthetic item 3'));
  click('Synthetic item 1',memory);
  await wait(()=>memory.textContent!.includes('Catalog record detail'));
  check('review_suggestion_opens_its_record',true);
  click('Recall',memory.querySelector('.qr28')!);
  await wait(()=>!!memory.querySelector('.qr44 form input'));
  const cue=memory.querySelector<HTMLInputElement>('.qr44 form input')!;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(cue,'调试');cue.dispatchEvent(new Event('input',{bubbles:true}));
  await sleep(30);memory.querySelector('.qr44 form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
  await wait(()=>memory.textContent!.includes('3 considered · 1 selected · 2 excluded · 120 bytes'));
  check('recall_preview_uses_entry_limits_and_lists_core_selection',recalls.at(-1)?.limit===8&&recalls.at(-1)?.max_bytes===16384&&recalls.at(-1)?.text==='调试'&&memory.textContent!.includes('调试偏好')&&memory.textContent!.includes('Matched words')&&memory.textContent!.includes('No cue match · 2'));
  check('recall_preview_states_nothing_is_written',memory.textContent!.includes('no Capsule is saved')&&!memory.textContent!.includes('Synthetic preview'));
  const context=fixture.querySelector('[data-screen-label="Context Surface"]')!;
  check('context_offers_the_same_preview_not_saved_capsules',!!context.querySelector('form input')&&context.textContent!.includes('saves nothing')&&!context.textContent!.includes('Read saved Capsules'));
  await wait(()=>within('Sessions').includes('Synthetic conversation'));
  click('Synthetic conversation',fixture.querySelector('[data-screen-label="Sessions"]')!);
  await wait(()=>within('Sessions').includes('合成原文'));
  check('sessions_show_conversation_account_scope',within('Sessions').includes('chatgpt-connector-synthetic'));
  check('sessions_read_conversations_turns_and_source_text',within('Sessions').includes('Only captured turns are shown')&&within('Sessions').includes('1 of 4 conversations'));
  await setLang('zh-Hans' as Lang);await wait(()=>within('Sessions').includes('只显示已捕获的轮次'));
  check('zh_registered_views_translate_without_new_reads',within('Home').includes('已采用'));
  await setLang('en' as Lang);
  state='locked';
  await wait(()=>!within('Sessions').includes('Synthetic conversation'));
  check('lock_withdraws_sessions_and_workspace_data',!within('Sessions').includes('合成原文')&&!within('Home').includes('3 records'));
}catch(error){checks.push({id:String(error),ok:false});}
finally{root.unmount();document.getElementById('results')!.textContent=JSON.stringify({checks,passed:checks.length>0&&checks.every(c=>c.ok),calls});}
