// Session ownership, lost receipts and parent observations are simulated.
import { createRoot } from "react-dom/client";
import { Sessions } from "../src/memory/SessionsSurface";
import { setTransport } from "../src/memory/client";
import "../src/quiet-runtime.css";
import "../src/memory/memory.css";

const fixture=document.getElementById("fixture")!;
const checks:{id:string;ok:boolean}[]=[];
const calls:{command:string;args:Record<string,unknown>}[]=[];
const cursors=new Map([["job-one",1],["job-two",0]]);
let releaseApply:(()=>void)|null=null;
const releasePending=()=>releaseApply?.();
let held=new Set<string>();
let lostReceipt=false;
let failDetail=false;
let reviewRoutes=0;
const job=(run_id:string)=>({run_id,input_event_id:`input-${run_id}`,state:cursors.get(run_id)===2?"completed":"running",cursor:cursors.get(run_id),candidates:[]});
const preview=(run:string)=>({job:job(run),items:[0,1].map(n=>({responseIndex:n,proposedType:"fact",content:`Saved ${run} suggestion ${n}`,quote:"Synthetic quote",selectedText:"Synthetic source",application:n<(cursors.get(run)??0)?"candidate_recorded":"awaiting_cursor",candidate:n<(cursors.get(run)??0)?{candidateId:`candidate-${run}-${n}`,revision:1,status:"pending",content:`Saved ${run} suggestion ${n}`}:null}))});
setTransport(async(native,args)=>{
  if(native==="memory_provider_setup")return {state:"absent"};
  if(native!=="memory_call")throw new Error(`Unexpected native command ${native}`);
  const r=args.request as {command:string;arguments:Record<string,unknown>;idempotencyKey:string|null};
  calls.push({command:r.command,args:r.arguments});
  let result:unknown;
  switch(r.command){
    case "operation_list":result={items:[]};break;
    case "session_list":result={items:["session-one","session-two"].map((sessionId,n)=>({sessionId,updatedAt:"2026-10-12T00:00:00Z",branches:[{branchId:`branch-${n}`,lastEventSeq:2}]}))};break;
    case "session_detail":
      if(failDetail)return {kind:"memory_error",error:{code:"storage_failed",retryable:false,rules:[]}};
      result={sessionId:r.arguments.sessionId,branchId:r.arguments.branchId,transcript:[],turns:[],checkpoints:[],invocations:[],lastSavedEventId:null,extractionJobs:r.arguments.sessionId==="session-one"?[job("job-one"),job("job-two")]:[]};break;
    case "provider_status":result={configured:false,destinations:[],grants:[]};break;
    case "extraction_preview":
      if(r.arguments.sessionId!=="session-one")throw new Error("Wrong saved job owner");
      result=preview(String(r.arguments.runId));break;
    case "extraction_apply":{
      if(r.arguments.sessionId!=="session-one"||!r.idempotencyKey)throw new Error("Wrong application owner/key");
      const run=String(r.arguments.runId);
      if(!held.has(run)){held.add(run);await new Promise<void>(resolve=>{releaseApply=resolve;});}
      cursors.set(run,Math.min((cursors.get(run)??0)+1,2));
      if(run==="job-one"&&!lostReceipt){lostReceipt=true;return {kind:"memory_error",error:{code:"storage_failed",retryable:true,rules:[]}};}
      result={job:job(run)};break;
    }
    default:throw new Error(`Unexpected command ${r.command}`);
  }
  return {kind:"memory_page",result,error:null};
});
const root=createRoot(fixture);root.render(<Sessions inspect={()=>{}} reviewCandidates={()=>{reviewRoutes++;}}/>);
const pane=()=>fixture.querySelector<HTMLElement>('[aria-label="Saved source suggestions"]');
const text=()=>pane()?.textContent??"";
const session=(id:string)=>fixture.querySelector<HTMLButtonElement>(`button[title="${id} · branch-${id==="session-one"?0:1}"]`);
const readJob=(id:string)=>fixture.querySelector<HTMLButtonElement>(`button[aria-label="Read saved suggestions for job ${id}"]`);
const button=(label:string,scope:ParentNode=fixture)=>[...scope.querySelectorAll<HTMLButtonElement>("button")].find(b=>b.textContent===label);
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function wait(p:()=>boolean){for(let n=0;n<250;n++){if(p())return;await sleep(20);}throw new Error(`UI wait timed out: ${fixture.textContent}`);}
function check(id:string,ok:boolean){checks.push({id,ok});if(!ok)throw new Error(id);}
function click(label:string,scope:ParentNode=fixture){const b=button(label,scope);if(!b||b.disabled)throw new Error(`Unavailable ${label}`);b.click();}
try{
  await wait(()=>!!session("session-one"));session("session-one")!.click();await wait(()=>!!readJob("job-one"));
  readJob("job-one")!.click();await wait(()=>text().includes("Saved job-one suggestion 0"));
  check("observed_saved_job_can_apply_remaining",!!button("Add remaining suggestions to the review queue",pane()!));
  click("Add remaining suggestions to the review queue",pane()!);await wait(()=>releaseApply!=null);await sleep(50);
  check("admitted_application_keeps_session_owner",session("session-two")!.disabled&&button("New session")!.disabled&&fixture.querySelector<HTMLTextAreaElement>("textarea")!.disabled&&fixture.querySelector<HTMLInputElement>("#mem-session-filter")!.disabled);
  check("admitted_application_keeps_job_and_close",readJob("job-two")!.disabled&&button("Close saved suggestions",pane()!)!.disabled);
  check("admitted_application_blocks_review_route",button("Open candidate inbox",pane()!)?.disabled===true&&reviewRoutes===0);
  session("session-two")!.click();fixture.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));
  check("blocked_controls_start_no_other_write",!calls.some(c=>c.command==="session_ask"||c.command==="session_new"||c.command==="session_detail"&&c.args.sessionId==="session-two"));
  releasePending();await wait(()=>!!pane()!.querySelector('[role="alert"]'));
  check("lost_receipt_requires_saved_read",!button("Retry",pane()!)&&text().includes("Previous suggestion observation")&&button("Add remaining suggestions to the review queue",pane()!)?.disabled===true);
  check("lost_receipt_does_not_claim_second_candidate",[...pane()!.querySelectorAll(".mem-tag")].filter(t=>t.textContent==="pending").length===1);
  check("ambiguous_queue_requires_read_before_review_route",button("Open candidate inbox",pane()!)?.disabled===true);
  const written=calls.filter(c=>c.command==="extraction_apply").length;
  click("Read saved suggestions again",pane()!);await wait(()=>!button("Add remaining suggestions to the review queue",pane()!));
  check("reobservation_reads_completion_without_replay",calls.filter(c=>c.command==="extraction_apply").length===written&&[...pane()!.querySelectorAll(".mem-tag")].filter(t=>t.textContent==="pending").length===2);
  click("Open candidate inbox",pane()!);check("observed_queue_allows_only_explicit_review_navigation",reviewRoutes===1&&calls.filter(c=>c.command==="extraction_apply").length===written);

  readJob("job-two")!.click();await wait(()=>text().includes("Saved job-two suggestion 0"));
  releaseApply=null;click("Add remaining suggestions to the review queue",pane()!);await wait(()=>releaseApply!=null);failDetail=true;releasePending();
  await wait(()=>!!button("Read session again"));
  check("successful_batch_observes_original_session",calls.filter(c=>c.command==="session_detail").every(c=>c.args.sessionId==="session-one"));
  check("parent_read_failure_blocks_new_writes",button("New session")!.disabled&&button("Send")!.disabled);
  check("unobserved_parent_blocks_review_route",button("Open candidate inbox",pane()!)?.disabled===true);
  check("saved_batch_completes_with_one_call_per_remaining_step",calls.filter(c=>c.command==="extraction_apply"&&c.args.runId==="job-two").length===2&&[...pane()!.querySelectorAll(".mem-tag")].filter(t=>t.textContent==="pending").length===2);
  failDetail=false;click("Read session again");await wait(()=>!session("session-two")!.disabled&&!button("New session")!.disabled);
  check("parent_read_recovery_keeps_saved_result",text().includes("Saved job-two suggestion 1")&&!button("Add remaining suggestions to the review queue",pane()!));
  check("local_application_never_sends_or_approves",calls.every(c=>["operation_list","session_list","session_detail","provider_status","extraction_preview","extraction_apply"].includes(c.command)));
  click("Close saved suggestions",pane()!);await sleep(50);check("settled_application_can_close",!!readJob("job-two")&&!text().includes("Saved job-two suggestion 1"));
}catch(error){checks.push({id:String(error),ok:false});}
finally{releasePending();root.unmount();document.getElementById("results")!.textContent=JSON.stringify({checks,passed:checks.every(c=>c.ok),calls},null,2);}
