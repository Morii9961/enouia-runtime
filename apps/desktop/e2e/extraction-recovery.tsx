// Receipt loss and partial application are simulated, not storage failure.
import { createRoot } from "react-dom/client";
import { ExtractionPanel } from "../src/memory/ExtractionPanel";
import { setTransport } from "../src/memory/client";
import "../src/quiet-runtime.css";
import "../src/memory/memory.css";

const fixture=document.getElementById("fixture")!;
const checks:{id:string;ok:boolean}[]=[];
const calls:{command:string;args:Record<string,unknown>;key:string|null}[]=[];
let mode="retry";
let cursor=0;
let closed=0;
let failedReceipt=false;
let failPreview=false;
let releaseApply:(()=>void)|null=null;
const releasePendingApply=()=>releaseApply?.();
const job=()=>({state:cursor===2?"completed":"running"});
const preview=()=>({job:job(),items:[0,1].map(n=>({responseIndex:n,proposedType:"preference",content:`Synthetic suggestion ${n}`,quote:"Synthetic quote",selectedText:"Synthetic source",candidate:n<cursor?{status:"pending"}:null}))});
const reply=(result:unknown)=>({kind:"memory_page",result,error:null});
setTransport(async(native,args)=>{
  if(native!=="memory_call")throw new Error("Unexpected native command");
  const r=args.request as {command:string;arguments:Record<string,unknown>;idempotencyKey:string|null};
  calls.push({command:r.command,args:r.arguments,key:r.idempotencyKey});
  switch(r.command){
    case "provider_status":return reply({configured:true,destinations:[{api:"openai",model:"synthetic-model"}],grants:[{active:true,policyId:"synthetic-policy",purposes:["extraction"],destinations:[{provider:"openai",model:"synthetic-model"}]}]});
    case "extraction_prepare":return reply({callId:"synthetic-call",wireHash:"synthetic-hash",sessionId:"synthetic-session",runId:"synthetic-run",model:"synthetic-model",endpoint:"Synthetic unused endpoint",body:"Synthetic request"});
    case "external_send":return reply({operationId:"synthetic-operation"});
    case "operation_get":return reply({operationId:"synthetic-operation",kind:"external_send",state:"succeeded",progress:{done:1,total:1},result:{finish:"completed"},cancelRequested:false});
    case "extraction_preview":
      if(failPreview)return {kind:"memory_error",error:{code:"storage_failed",retryable:false,rules:[]}};
      return reply(preview());
    case "extraction_apply":{
      if(r.arguments.sessionId!=="synthetic-session"||r.arguments.runId!=="synthetic-run"||!r.idempotencyKey)throw new Error("Wrong extraction target");
      if(cursor===0)await new Promise<void>(resolve=>{releaseApply=resolve;});
      cursor=Math.min(cursor+1,2);
      const result={job:job()};
      if(mode==="retry"&&!failedReceipt){failedReceipt=true;return {kind:"memory_error",error:{code:"storage_failed",retryable:true,rules:[]}};}
      if(mode==="read"&&cursor===2)return {kind:"memory_error",error:{code:"storage_failed",retryable:false,rules:[]}};
      return reply(result);
    }
    default:throw new Error(`Unexpected command ${r.command}`);
  }
});
let root=createRoot(fixture);
const render=()=>root.render(<ExtractionPanel range={{sourceId:"synthetic-source",revision:1,start:0,end:20}} onClose={()=>{closed++;}}/>);
const text=()=>fixture.textContent??"";
const button=(label:string)=>[...fixture.querySelectorAll<HTMLButtonElement>("button")].find(b=>b.textContent===label);
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function wait(p:()=>boolean){for(let n=0;n<250;n++){if(p())return;await sleep(20);}throw new Error(`UI wait timed out: ${text()}`);}
function check(id:string,ok:boolean){checks.push({id,ok});if(!ok)throw new Error(id);}
function click(label:string){const b=button(label);if(!b||b.disabled)throw new Error(`Unavailable ${label}`);b.click();}
async function prepare(){render();await wait(()=>!!button("Prepare the request…"));click("Prepare the request…");await wait(()=>!!button("Send once"));click("Send once");await wait(()=>!!button("Add to the review queue"));}
try{
  await prepare();click("Add to the review queue");await wait(()=>releaseApply!=null);
  check("pending_apply_keeps_close_disabled",!!button("Close")&&button("Close")!.disabled);
  button("Close")!.click();check("pending_apply_does_not_dismiss",closed===0);
  releasePendingApply();await wait(()=>!!fixture.querySelector('[role="alert"]'));
  check("lost_receipt_does_not_claim_queue_write",!text().includes("pending in the review queue"));
  check("retryable_apply_error_requires_saved_read",!button("Retry")&&button("Add to the review queue")?.disabled===true&&!!button("Refresh saved suggestions"));
  const beforeRefresh=calls.filter(c=>c.command==="extraction_apply").length;
  click("Refresh saved suggestions");await wait(()=>button("Add to the review queue")?.disabled===false);
  check("read_observes_first_commit_without_replay",text().includes("pending in the review queue")&&calls.filter(c=>c.command==="extraction_apply").length===beforeRefresh);
  click("Add to the review queue");await wait(()=>!button("Add to the review queue"));
  const applied=calls.filter(c=>c.command==="extraction_apply");
  check("remaining_suggestion_uses_original_job",JSON.stringify(applied[0].args)===JSON.stringify(applied[1].args));
  check("two_explicit_steps_only",cursor===2&&applied.length===2);
  check("completed_queue_observed",!button("Add to the review queue"));

  root.unmount();root=createRoot(fixture);mode="read";cursor=0;releaseApply=null;failedReceipt=false;
  await prepare();click("Add to the review queue");await wait(()=>releaseApply!=null);releasePendingApply();await wait(()=>!!fixture.querySelector('[role="alert"]'));
  check("partial_write_requires_reobservation",button("Add to the review queue")?.disabled===true&&text().includes("Previous suggestion observation"));
  check("saved_suggestions_have_explicit_refresh",!!button("Refresh saved suggestions"));
  const beforeApply=calls.filter(c=>c.command==="extraction_apply").length;
  failPreview=true;click("Refresh saved suggestions");await sleep(50);
  check("failed_refresh_keeps_recovery_and_previous_items",!!button("Refresh saved suggestions")&&text().includes("Synthetic suggestion 0")&&button("Add to the review queue")?.disabled===true);
  failPreview=false;click("Refresh saved suggestions");await wait(()=>text().includes("pending in the review queue"));
  check("refresh_reads_saved_completion",!button("Add to the review queue")&&calls.filter(c=>c.command==="extraction_apply").length===beforeApply);
  check("recovery_does_not_resend_model",calls.filter(c=>c.command==="external_send").length===2);
  click("Close");check("settled_workflow_can_close",closed===1);
}catch(error){checks.push({id:String(error),ok:false});}
finally{releasePendingApply();root.unmount();document.getElementById("results")!.textContent=JSON.stringify({checks,passed:checks.every(c=>c.ok),calls},null,2);}
