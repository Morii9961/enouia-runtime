// The source and provider observations are synthetic and render real controls.
import { createRoot } from "react-dom/client";
import { Source } from "../src/memory/ui";
import { setTransport } from "../src/memory/client";
import "../src/quiet-runtime.css";
import "../src/memory/memory.css";

const fixture=document.getElementById("fixture")!;
const checks:{id:string;ok:boolean}[]=[];
const calls:{command:string;args:Record<string,unknown>}[]=[];
let releasePrepare:(()=>void)|null=null;
let releaseSend:(()=>void)|null=null;
const releasePending=()=>{releasePrepare?.();releaseSend?.();};
let heldPrepare=true;
let finished=false;
setTransport(async(native,args)=>{
  if(native!=="memory_call")throw new Error("Unexpected native command");
  const r=args.request as {command:string;arguments:Record<string,unknown>};
  calls.push({command:r.command,args:r.arguments});
  let result:unknown;
  switch(r.command){
    case "source_excerpt":{const start=Number(r.arguments.startByte??0);result={sourceKind:"message",speakerRole:"user",byteStart:start,byteEnd:start+20,totalBytes:60,excerpt:`Synthetic source ${start}`};break;}
    case "provider_status":result={configured:true,destinations:[{api:"openai",model:"synthetic-model"}],grants:[{active:true,policyId:"synthetic-policy",purposes:["extraction"],destinations:[{provider:"openai",model:"synthetic-model"}]}]};break;
    case "extraction_prepare":
      if(heldPrepare)await new Promise<void>(resolve=>{releasePrepare=resolve;});
      result={callId:"synthetic-call",wireHash:"synthetic-hash",sessionId:"synthetic-session",runId:"synthetic-run",model:"synthetic-model",endpoint:"Synthetic unused endpoint",body:`Synthetic range ${r.arguments.startByte}`};break;
    case "external_send":await new Promise<void>(resolve=>{releaseSend=resolve;});result={operationId:"synthetic-operation"};break;
    case "operation_get":result={operationId:"synthetic-operation",kind:"external_send",state:finished?"succeeded":"running",cancelRequested:false,progress:{done:0,total:null},result:finished?{finish:"completed"}:null};break;
    case "extraction_preview":result={job:{state:"completed"},items:[
      {responseIndex:0,proposedType:"preference",content:"Original synthetic suggestion",quote:"Synthetic quote",selectedText:"Synthetic source 20",application:"candidate_recorded",candidate:{candidateId:"synthetic-candidate",revision:2,status:"accepted",content:"Edited synthetic candidate"}},
      {responseIndex:1,proposedType:"fact",content:"Suppressed synthetic suggestion",quote:"Synthetic quote",selectedText:"Synthetic source 20",application:"suppressed",candidate:null},
    ]};break;
    default:throw new Error(`Unexpected command ${r.command}`);
  }
  return {kind:"memory_page",result,error:null};
});
const root=createRoot(fixture);
root.render(<Source evidence={{available:true,sourceId:"synthetic-source",sourceRevision:1,supports:"synthetic support"}}/>);
const text=()=>fixture.textContent??"";
const button=(label:string)=>[...fixture.querySelectorAll<HTMLButtonElement>("button")].find(b=>b.textContent===label);
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function wait(p:()=>boolean){for(let n=0;n<250;n++){if(p())return;await sleep(20);}throw new Error(`UI wait timed out: ${text()}`);}
function check(id:string,ok:boolean){checks.push({id,ok});if(!ok)throw new Error(id);}
function click(label:string){const b=button(label);if(!b||b.disabled)throw new Error(`Unavailable ${label}`);b.click();}
try{
  await wait(()=>!!button("Show source"));click("Show source");await wait(()=>!!button("Next part"));
  click("Suggest memories from this part…");await wait(()=>!!button("Prepare the request…"));click("Prepare the request…");await wait(()=>releasePrepare!=null);await sleep(50);
  check("held_prepare_keeps_excerpt_selected",button("Next part")!.disabled&&text().includes("Synthetic source 0"));
  button("Next part")!.click();check("held_prepare_cannot_read_next_range",calls.filter(c=>c.command==="source_excerpt").length===1);
  releasePrepare!();await wait(()=>!!button("Don't send"));click("Don't send");await wait(()=>!button("Next part")!.disabled);
  check("settled_review_can_change_excerpt",!button("Send once"));
  click("Next part");await wait(()=>text().includes("Synthetic source 20"));heldPrepare=false;
  click("Suggest memories from this part…");await wait(()=>!!button("Prepare the request…"));click("Prepare the request…");await wait(()=>!!button("Send once"));
  const prepared=calls.filter(c=>c.command==="extraction_prepare");
  check("new_request_uses_shown_range",prepared[1].args.startByte===20&&prepared[1].args.endByte===40&&prepared[1].args.sourceRevision===1&&text().includes("Synthetic range 20"));
  click("Send once");await wait(()=>releaseSend!=null);await sleep(50);
  check("send_admission_keeps_excerpt_selected",button("Next part")!.disabled);
  releaseSend!();await wait(()=>!!button("Stop locally"));
  check("running_call_keeps_excerpt_selected",button("Next part")!.disabled&&text().includes("Synthetic source 20"));
  finished=true;await wait(()=>text().includes("Original synthetic suggestion"));
  check("original_suggestion_remains_literal",text().includes("Original synthetic suggestion"));
  check("current_candidate_is_distinct",text().includes("Current candidate: Edited synthetic candidate")&&text().includes("r2"));
  check("accepted_candidate_is_not_claimed_pending",text().includes("accepted")&&!text().includes("in the review queue"));
  check("suppressed_suggestion_reports_no_candidate",text().includes("No candidate recorded for this suggestion"));
  await wait(()=>!button("Next part")!.disabled);
  check("terminal_read_releases_excerpt",!!button("Close"));
  check("nothing_applies_or_resends_automatically",!calls.some(c=>c.command==="extraction_apply")&&calls.filter(c=>c.command==="external_send").length===1);
}catch(error){checks.push({id:String(error),ok:false});}
finally{releasePending();root.unmount();document.getElementById("results")!.textContent=JSON.stringify({checks,passed:checks.every(c=>c.ok),calls},null,2);}
