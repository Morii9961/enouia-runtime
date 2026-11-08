// Mounted component + controlled native transport. No browser or OS evidence.
import { createRoot } from 'react-dom/client';
import { CaptureMemory } from '../src/memory/CaptureMemory';
import { setCaptureTransport } from '../src/memory/capture';
import { setLang, useLang, type Lang } from '../src/i18n';
import { status, preflight, write, jobs, page, correction } from './fixtures/capture.mjs';
const fixture=document.getElementById('fixture')!,root=createRoot(fixture);
const checks:{id:string;ok:boolean}[]=[],calls:Record<string,any>[]=[];
let state='disabled';const formed:string[]=[];const progress:Record<number,string[][]>={};
let writeFailure:string|null=null,queueFailure=false,busyStatus=false;const revised:string[]=[];
setCaptureTransport(async(command,args)=>{
  if(command!=='memory_capture')throw new Error('Unexpected channel');
  const query=(args as any).request.query;calls.push(structuredClone(query));
  if(query.operation==='status'){if(busyStatus){busyStatus=false;throw 'capture_busy';}return status(state);}
  if(query.operation==='lock'){state='locked';return {...status('locked'),effect:'native_control'};}
  if(query.operation==='renew'){state='open';return {...status('open'),effect:'native_control'};}
  if(query.operation==='preflight')return preflight(query.exchange);
  if(query.operation==='write'){
    if(writeFailure){const error=writeFailure;writeFailure=null;throw error;}
    if(queueFailure){queueFailure=false;return write(query.exchange,{queueError:'capture_refused'});}
    progress[query.exchange]=[['forming','queued'],['formed','no_memory']];
    return write(query.exchange);
  }
  if(query.operation==='jobs'){
    const steps=progress[query.exchange]??[['formed','no_memory']];
    const next=steps.length>1?steps.shift()!:steps[0];
    if(next[0]==='formed'&&!formed.includes(`conversation ${query.exchange}`))formed.push(`conversation ${query.exchange}`);
    return jobs(query.exchange,next);
  }
  if(query.operation==='correct'){setTimeout(()=>revised.push('conversation 0'),300);return correction();}
  if(query.operation==='page')return page(formed,revised);
  throw new Error('Unexpected operation');
});
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const text=()=>fixture.textContent??'';
const item=(n:number)=>fixture.querySelectorAll('ol.mem-list > li')[n] as HTMLElement|undefined;
const press=(n:number,label:string)=>{const b=[...(item(n)?.querySelectorAll<HTMLButtonElement>('button')??[])].find(b=>b.textContent?.trim()===label);if(!b||b.disabled)throw new Error(`Unavailable ${label} on ${n}`);b.click();};
const button=(label:string)=>[...fixture.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===label);
const check=(id:string,ok:boolean)=>checks.push({id,ok});
async function wait(test:()=>boolean){for(let n=0;n<350;n++){if(test())return;await sleep(20);}throw new Error(`UI timeout: ${text()}`);}
const sent=(operation:string)=>calls.filter(c=>c.operation===operation);
try{
  function Surface(){useLang();return <CaptureMemory/>;}
  root.render(<Surface/>);
  await wait(()=>text().includes('No synthetic capture is enabled in this session.'));
  check('disabled_is_explicit_without_conversations_or_writes',!item(0)&&calls.every(c=>c.operation==='status'));
  state='open';
  await wait(()=>!!item(2)&&text().includes('Capture: open'));
  check('fixed_conversations_are_shown_with_both_turns',text().includes('Conversation 1')&&text().includes('Synthetic reply: noted.')&&item(1)!.textContent!.includes('合成示例：我上周做了一个蓝色陶杯。'));
  check('conversation_text_is_literal_not_markup',text().includes('<img id="capture-injected"')&&!fixture.querySelector('#capture-injected'));
  check('conversation_language_is_marked',item(1)!.querySelector('[lang="zh-Hans"]')!==null);
  await wait(()=>text().includes('No memory has been formed yet.'));
  press(0,'Preview capture');await wait(()=>text().includes('Preview: this conversation is not captured yet. Nothing was queued.'));
  check('preview_sends_one_preflight_and_no_write',sent('preflight').length===1&&sent('write').length===0);
  press(0,'Capture conversation');await wait(()=>text().includes('Captured and queued for formation.'));
  check('write_sends_once_with_exchange_index_only',sent('write').length===1&&JSON.stringify(sent('write')[0])==='{"operation":"write","exchange":0}');
  await wait(()=>item(0)!.textContent!.includes('Formed · 1 memories'));
  check('job_progress_shows_states_and_counts',item(0)!.textContent!.includes('No memory · 0 memories'));
  await wait(()=>text().includes('1 memories formed in this root'));
  check('formed_memories_refresh_after_jobs_settle',text().includes('Formed from: conversation 0'));
  const settledJobs=sent('jobs').length;await sleep(1500);
  check('settled_jobs_stop_polling',sent('jobs').length===settledJobs);
  busyStatus=true;await wait(()=>!busyStatus);await wait(()=>text().includes('Synthetic capture is busy. Try again shortly.'));
  check('busy_status_keeps_conversations_and_formed_list',!!item(3)&&text().includes('Capture: open')&&text().includes('1 memories formed in this root'));
  await wait(()=>!text().includes('Synthetic capture is busy.'));
  check('correction_conversation_names_its_target',item(3)!.textContent!.includes('Corrects conversation 1')&&!item(0)!.textContent!.includes('Corrects conversation'));
  const writesBefore=sent('write').length;
  [...item(3)!.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()==='Send synthetic correction report')!.click();
  await wait(()=>item(3)!.textContent!.includes("Correction report saved. Memory's worker decides any revision on its own."));
  await wait(()=>text().includes('· r2 ·'));
  check('correction_sends_one_report_and_waits_for_the_worker_revision',sent('correct').length===1&&sent('write').length===writesBefore&&text().includes('Corrected by the synthetic report'));
  const writes=sent('write').length;
  for(const [language,heading,label] of [['zh-Hans','合成 Runtime 捕获','已形成 · 1 条记忆'],['ja','合成 Runtime キャプチャ','形成済み · 記憶 1 件'],['en','Synthetic Runtime capture','Formed · 1 memories']]){
    await setLang(language as Lang);await wait(()=>text().includes(heading));
    check(`${language}_language_translates_without_new_writes`,text().includes(label)&&sent('write').length===writes);
  }
  writeFailure='capture_outcome_unknown';press(1,'Capture conversation');
  await wait(()=>!!item(1)!.querySelector('[role=alert]'));
  check('unknown_outcome_is_explained',item(1)!.textContent!.includes('The capture outcome is unknown. Memory kept the original request'));
  const afterUnknown=sent('write').length;await sleep(800);
  check('unknown_outcome_is_never_resent',sent('write').length===afterUnknown&&!item(1)!.textContent!.includes('Captured and queued'));
  queueFailure=true;press(2,'Capture conversation');
  await wait(()=>item(2)!.textContent!.includes('Captured, but queueing was refused'));
  check('queue_refusal_keeps_the_capture_receipt_visible',item(2)!.textContent!.includes('The synthetic capture was refused'));
  state='expired';await wait(()=>text().includes('This capture enrollment has expired.'));
  check('expired_enrollment_disables_capture',[0,1,2].every(n=>[...item(n)!.querySelectorAll('button')].every(b=>b.disabled))&&!button('End capture enrollment'));
  button('Renew capture enrollment')!.click();await wait(()=>!!button('End capture enrollment'));
  check('explicit_renewal_sends_one_renew_and_reopens_capture',sent('renew').length===1&&text().includes('Capture: open')&&[0,1,2].every(n=>[...item(n)!.querySelectorAll('button')].every(b=>!b.disabled)));
  button('End capture enrollment')!.click();
  await wait(()=>text().includes('Capture enrollment ended for this session.'));
  check('end_enrollment_sends_one_lock_and_hides_formed_list',sent('lock').length===1&&!text().includes('memories formed in this root'));
  check('only_closed_capture_operations_were_used',calls.every(c=>['status','preflight','write','jobs','page','lock','renew','correct'].includes(c.operation)));
}catch(error){checks.push({id:String(error),ok:false});}
finally{root.unmount();document.getElementById('results')!.textContent=JSON.stringify({checks,passed:checks.every(c=>c.ok),calls});}
