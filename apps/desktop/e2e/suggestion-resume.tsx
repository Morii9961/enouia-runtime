import { createRoot } from "react-dom/client";
import { SavedExtractionJobs } from "../src/memory/SavedExtractionJobs";
import { setTransport } from "../src/memory/client";
import "../src/quiet-runtime.css";
import "../src/memory/memory.css";

const fixture=document.getElementById("fixture")!;
const checks:{id:string;ok:boolean}[]=[];
const calls:{command:string;args:Record<string,unknown>}[]=[];
const paused=new Map([["job-one",true],["job-two",true]]);
let releaseResume:(()=>void)|null=null;
const releasePending=()=>releaseResume?.();
let lostReceipt=false;
let busy=false;
let refreshed=0;
const reportBusy=(value:boolean)=>{busy=value;};
const job=(run_id:string)=>({run_id,input_event_id:`input-${run_id}`,state:paused.get(run_id)?"paused":"ready",cursor:0,candidates:[]});
setTransport(async(native,args)=>{
  if(native!=="memory_call")throw new Error(`Unexpected native command ${native}`);
  const r=args.request as {command:string;arguments:Record<string,unknown>};calls.push({command:r.command,args:r.arguments});
  const run=String(r.arguments.runId);let result:unknown;
  if(r.arguments.sessionId!=="synthetic-session")throw new Error("Wrong saved session");
  if(r.command==="extraction_preview")result={job:job(run),items:[{responseIndex:0,proposedType:"fact",content:`Saved ${run} proposal`,quote:"Synthetic quote",selectedText:"Synthetic source",application:"awaiting_cursor",candidate:null}]};
  else if(r.command==="extraction_pause"){
    if(r.arguments.paused!==false)throw new Error("Wrong resume command");
    await new Promise<void>(resolve=>{releaseResume=resolve;});paused.set(run,false);
    if(run==="job-one"&&!lostReceipt){lostReceipt=true;return {kind:"memory_error",error:{code:"storage_failed",retryable:true,rules:[]}};}
    result={job:job(run)};
  }else throw new Error(`Unexpected command ${r.command}`);
  return {kind:"memory_page",result,error:null};
});
const root=createRoot(fixture);root.render(<SavedExtractionJobs sessionId="synthetic-session" jobs={[job("job-one"),job("job-two")]} onBusyChange={reportBusy} onChanged={async()=>{refreshed++;}}/>);
const button=(label:string)=>[...fixture.querySelectorAll<HTMLButtonElement>("button")].find(b=>b.textContent===label);
const readJob=(run:string)=>fixture.querySelector<HTMLButtonElement>(`button[aria-label="Read saved suggestions for job ${run}"]`);
const text=()=>fixture.textContent??"";
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function wait(p:()=>boolean){for(let n=0;n<250;n++){if(p())return;await sleep(20);}throw new Error(`UI wait timed out: ${text()}`);}
function check(id:string,ok:boolean){checks.push({id,ok});if(!ok)throw new Error(id);}
function click(label:string){const b=button(label);if(!b||b.disabled)throw new Error(`Unavailable ${label}`);b.click();}
try{
  await wait(()=>!!readJob("job-one"));readJob("job-one")!.click();await wait(()=>text().includes("Saved job-one proposal"));
  check("observed_paused_job_has_explicit_resume",!!button("Resume local queue")&&!button("Add remaining suggestions to the review queue"));
  click("Resume local queue");await wait(()=>releaseResume!=null);await sleep(50);
  check("resume_holds_job_and_dismissal",busy&&readJob("job-two")!.disabled&&button("Close saved suggestions")!.disabled);
  releasePending();await wait(()=>!!fixture.querySelector('[role="alert"]'));
  check("lost_resume_receipt_requires_observation",!button("Retry")&&button("Resume local queue")?.disabled===true&&text().includes("Previous suggestion observation"));
  click("Read saved suggestions again");await wait(()=>!!button("Add remaining suggestions to the review queue"));
  check("saved_read_observes_resume_without_replay",!button("Resume local queue")&&calls.filter(c=>c.command==="extraction_pause").length===1);
  check("resume_never_applies_automatically",!calls.some(c=>c.command==="extraction_apply")&&[...fixture.querySelectorAll(".mem-tag")].filter(t=>t.textContent==="pending").length===0);
  readJob("job-two")!.click();await wait(()=>text().includes("Saved job-two proposal"));
  releaseResume=null;click("Resume local queue");await wait(()=>releaseResume!=null);releasePending();
  await wait(()=>!!button("Add remaining suggestions to the review queue")&&!busy);
  check("successful_resume_refreshes_parent_once",refreshed===1);
  check("resume_targets_exact_saved_job",calls.filter(c=>c.command==="extraction_pause").every(c=>c.args.sessionId==="synthetic-session"&&c.args.paused===false)&&calls.some(c=>c.command==="extraction_pause"&&c.args.runId==="job-two"));
  check("only_local_resume_and_preview_commands",calls.every(c=>["extraction_pause","extraction_preview"].includes(c.command)));
  click("Close saved suggestions");await sleep(50);check("resumed_flow_can_close",!text().includes("Saved job-two proposal")&&!!readJob("job-two"));
}catch(error){checks.push({id:String(error),ok:false});}
finally{releasePending();root.unmount();document.getElementById("results")!.textContent=JSON.stringify({checks,passed:checks.every(c=>c.ok),calls},null,2);}
