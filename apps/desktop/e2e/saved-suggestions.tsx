import { createRoot } from "react-dom/client";
import { Sessions } from "../src/memory/SessionsSurface";
import { setTransport } from "../src/memory/client";
import "../src/quiet-runtime.css";
import "../src/memory/memory.css";

const fixture=document.getElementById("fixture")!;
const checks:{id:string;ok:boolean}[]=[];
const calls:{command:string;args:Record<string,unknown>;key:string|null}[]=[];
let releaseFirst:(()=>void)|null=null;
const releasePending=()=>releaseFirst?.();
let failSecond=false;
const job=(run_id:string)=>({run_id,input_event_id:`input-${run_id}`,state:"completed",cursor:1,candidates:[`candidate-${run_id}`]});
setTransport(async(native,args)=>{
  if(native==="memory_provider_setup")return {state:"absent"};
  if(native!=="memory_call")throw new Error(`Unexpected native command ${native}`);
  const r=args.request as {command:string;arguments:Record<string,unknown>;idempotencyKey:string|null};
  calls.push({command:r.command,args:r.arguments,key:r.idempotencyKey});
  let result:unknown;
  switch(r.command){
    case "operation_list":result={items:[]};break;
    case "session_list":result={items:["session-one","session-two"].map((sessionId,n)=>({sessionId,updatedAt:"2026-10-12T00:00:00Z",branches:[{branchId:`branch-${n}`,lastEventSeq:2}]}))};break;
    case "session_detail":result={sessionId:r.arguments.sessionId,branchId:r.arguments.branchId,transcript:[],turns:[],checkpoints:[],invocations:[],lastSavedEventId:null,extractionJobs:r.arguments.sessionId==="session-one"?[job("job-one"),job("job-two")]:[job("job-other")]};break;
    case "provider_status":result={configured:false,destinations:[],grants:[]};break;
    case "extraction_preview":{
      const run=String(r.arguments.runId);
      if(run==="job-one")await new Promise<void>(resolve=>{releaseFirst=resolve;});
      if(run==="job-two"&&failSecond)return {kind:"memory_error",error:{code:"storage_failed",retryable:false,rules:[]}};
      result={job:job(run),items:[{responseIndex:0,proposedType:"fact",content:`Saved suggestion ${run}`,quote:"Synthetic quote",selectedText:"Synthetic source",application:"candidate_recorded",candidate:{candidateId:`candidate-${run}`,revision:2,status:"accepted",content:`Saved suggestion ${run}`}}]};break;
    }
    default:throw new Error(`Unexpected command ${r.command}`);
  }
  return {kind:"memory_page",result,error:null};
});
const root=createRoot(fixture);root.render(<Sessions inspect={()=>{}}/>);
const text=()=>fixture.textContent??"";
const pane=()=>fixture.querySelector<HTMLElement>('[aria-label="Saved source suggestions"]');
const session=(id:string)=>fixture.querySelector<HTMLButtonElement>(`button[title="${id} · branch-${id==="session-one"?0:1}"]`);
const jobButton=(id:string)=>fixture.querySelector<HTMLButtonElement>(`button[aria-label="Read saved suggestions for job ${id}"]`);
const button=(label:string)=>[...(pane()?.querySelectorAll<HTMLButtonElement>("button")??[])].find(b=>b.textContent===label);
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function wait(p:()=>boolean){for(let n=0;n<250;n++){if(p())return;await sleep(20);}throw new Error(`UI wait timed out: ${text()}`);}
function check(id:string,ok:boolean){checks.push({id,ok});if(!ok)throw new Error(id);}
try{
  await wait(()=>!!session("session-one"));session("session-one")!.click();await wait(()=>text().includes("External providers are off"));
  check("saved_jobs_survive_session_read",!!pane()&&!!jobButton("job-one")&&!!jobButton("job-two"));
  jobButton("job-one")!.click();await wait(()=>releaseFirst!=null);await sleep(50);
  check("unobserved_job_is_not_empty",pane()!.textContent!.includes("Reading saved suggestions")&&!pane()!.textContent!.includes("0 suggestions"));
  jobButton("job-two")!.click();await wait(()=>pane()!.textContent!.includes("Saved suggestion job-two"));
  releasePending();await sleep(50);
  check("older_job_read_cannot_replace_selection",pane()!.textContent!.includes("Saved suggestion job-two")&&!pane()!.textContent!.includes("Saved suggestion job-one"));
  check("off_provider_keeps_recorded_candidate_visible",text().includes("External providers are off")&&pane()!.textContent!.includes("accepted candidate"));
  failSecond=true;button("Read saved suggestions again")!.click();await wait(()=>!!pane()!.querySelector('[role="alert"]'));
  check("failed_read_has_manual_recovery",!!button("Read saved suggestions again")&&!pane()!.textContent!.includes("0 suggestions"));
  failSecond=false;button("Read saved suggestions again")!.click();await wait(()=>pane()!.textContent!.includes("Saved suggestion job-two"));
  check("recovery_uses_saved_session_and_job",calls.filter(c=>c.command==="extraction_preview"&&c.args.runId==="job-two").every(c=>c.args.sessionId==="session-one"&&c.key===null));
  jobButton("job-one")!.click();await sleep(50);session("session-two")!.click();await wait(()=>!!jobButton("job-other"));releasePending();await sleep(50);
  check("session_switch_drops_previous_job_observation",!pane()!.textContent!.includes("Saved suggestion job-two")&&!pane()!.textContent!.includes("Saved suggestion job-one")&&!jobButton("job-two"));
  jobButton("job-other")!.click();await wait(()=>pane()!.textContent!.includes("Saved suggestion job-other"));
  check("other_session_reads_its_own_job",calls.some(c=>c.command==="extraction_preview"&&c.args.sessionId==="session-two"&&c.args.runId==="job-other"));
  button("Close saved suggestions")!.click();await sleep(50);
  check("close_keeps_saved_job_list",!!jobButton("job-other")&&!pane()!.textContent!.includes("Saved suggestion job-other"));
  check("recovery_never_sends_applies_or_grants",calls.every(c=>["operation_list","session_list","session_detail","provider_status","extraction_preview"].includes(c.command))&&calls.every(c=>c.key===null));
}catch(error){checks.push({id:String(error),ok:false});}
finally{releasePending();root.unmount();document.getElementById("results")!.textContent=JSON.stringify({checks,passed:checks.every(c=>c.ok),calls},null,2);}
