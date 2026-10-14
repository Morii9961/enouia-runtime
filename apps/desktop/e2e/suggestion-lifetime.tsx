// An already admitted cursor step can finish after its page is gone.
import { createRoot } from "react-dom/client";
import { ExtractionPanel } from "../src/memory/ExtractionPanel";
import { SavedExtractionJobs } from "../src/memory/SavedExtractionJobs";
import { setTransport } from "../src/memory/client";
import "../src/quiet-runtime.css";
import "../src/memory/memory.css";

const fixture=document.getElementById("fixture")!;
const checks:{id:string;ok:boolean}[]=[];
const calls:{command:string;args:Record<string,unknown>}[]=[];
let cursor=0;
let releaseApply:(()=>void)|null=null;
const releasePending=()=>releaseApply?.();
let parentRefreshes=0;
const job=()=>({run_id:"synthetic-run",input_event_id:"synthetic-input",state:cursor===2?"completed":"running",cursor,candidates:[]});
const preview=()=>({job:job(),items:[0,1].map(n=>({responseIndex:n,proposedType:"fact",content:`Synthetic suggestion ${n}`,quote:"Synthetic quote",selectedText:"Synthetic source",application:n<cursor?"candidate_recorded":"awaiting_cursor",candidate:n<cursor?{candidateId:`candidate-${n}`,revision:1,status:"pending",content:`Synthetic suggestion ${n}`}:null}))});
setTransport(async(native,args)=>{
  if(native!=="memory_call")throw new Error(`Unexpected native command ${native}`);
  const r=args.request as {command:string;arguments:Record<string,unknown>};calls.push({command:r.command,args:r.arguments});
  let result:unknown;
  switch(r.command){
    case "provider_status":result={configured:true,destinations:[{api:"openai",model:"synthetic-model"}],grants:[{active:true,policyId:"synthetic-policy",purposes:["extraction"],destinations:[{provider:"openai",model:"synthetic-model"}]}]};break;
    case "extraction_prepare":result={callId:"synthetic-call",wireHash:"synthetic-hash",sessionId:"synthetic-session",runId:"synthetic-run",model:"synthetic-model",endpoint:"Synthetic endpoint (unused)",body:"Synthetic exact request"};break;
    case "external_send":result={operationId:"synthetic-operation"};break;
    case "operation_get":result={operationId:"synthetic-operation",kind:"external_send",state:"succeeded",cancelRequested:false,progress:{done:1,total:1},result:{finish:"completed"}};break;
    case "extraction_preview":result=preview();break;
    case "extraction_apply":
      if(r.arguments.sessionId!=="synthetic-session"||r.arguments.runId!=="synthetic-run")throw new Error("Wrong application owner");
      await new Promise<void>(resolve=>{releaseApply=resolve;});cursor=Math.min(cursor+1,2);result={job:job()};break;
    default:throw new Error(`Unexpected command ${r.command}`);
  }
  return {kind:"memory_page",result,error:null};
});
let root=createRoot(fixture);
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const text=()=>fixture.textContent??"";
const button=(label:string)=>[...fixture.querySelectorAll<HTMLButtonElement>("button")].find(b=>b.textContent===label);
async function wait(p:()=>boolean){for(let n=0;n<250;n++){if(p())return;await sleep(20);}throw new Error(`UI wait timed out: ${text()}`);}
function check(id:string,ok:boolean){checks.push({id,ok});if(!ok)throw new Error(id);}
function click(label:string){const b=button(label);if(!b||b.disabled)throw new Error(`Unavailable ${label}`);b.click();}
const renderSaved=()=>root.render(<SavedExtractionJobs sessionId="synthetic-session" jobs={[job()]} onChanged={async()=>{parentRefreshes++;}}/>);
try{
  root.render(<ExtractionPanel range={{sourceId:"synthetic-source",revision:1,start:0,end:20}} onClose={()=>{}}/>);
  await wait(()=>!!button("Prepare the request…"));click("Prepare the request…");await wait(()=>!!button("Send once"));click("Send once");await wait(()=>!!button("Add to the review queue"));
  click("Add to the review queue");await wait(()=>releaseApply!=null);await sleep(50);
  const beforeSource=calls.length;root.unmount();releasePending();await sleep(80);
  check("unmounted_source_starts_no_following_step",calls.length===beforeSource&&cursor===1);
  check("already_admitted_step_can_finish",calls.filter(c=>c.command==="extraction_apply").length===1);

  root=createRoot(fixture);releaseApply=null;renderSaved();await wait(()=>!!button("Read saved suggestions"));click("Read saved suggestions");await wait(()=>!!button("Add remaining suggestions to the review queue"));
  check("return_reads_the_saved_partial_cursor",[...fixture.querySelectorAll(".mem-tag")].filter(t=>t.textContent==="pending").length===1);
  click("Add remaining suggestions to the review queue");await wait(()=>releaseApply!=null);await sleep(50);
  const beforeSaved=calls.length;root.unmount();releasePending();await sleep(80);
  check("unmounted_saved_flow_starts_no_result_read",calls.length===beforeSaved&&cursor===2);
  check("unmounted_saved_flow_does_not_refresh_parent",parentRefreshes===0);

  root=createRoot(fixture);renderSaved();await wait(()=>!!button("Read saved suggestions"));click("Read saved suggestions");await wait(()=>text().includes("Synthetic suggestion 1"));
  check("new_reader_observes_saved_completion",[...fixture.querySelectorAll(".mem-tag")].filter(t=>t.textContent==="pending").length===2&&!button("Add remaining suggestions to the review queue"));
  check("no_model_resend_or_memory_approval",calls.filter(c=>c.command==="external_send").length===1&&!calls.some(c=>c.command==="review_confirm"));
}catch(error){checks.push({id:String(error),ok:false});}
finally{releasePending();root.unmount();document.getElementById("results")!.textContent=JSON.stringify({checks,passed:checks.every(c=>c.ok),calls},null,2);}
