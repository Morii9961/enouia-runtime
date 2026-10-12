import { createRoot } from "react-dom/client";
import { ExtractionPanel } from "../src/memory/ExtractionPanel";
import { setTransport } from "../src/memory/client";
import "../src/quiet-runtime.css";
import "../src/memory/memory.css";

const fixture=document.getElementById("fixture")!;
const checks:{id:string;ok:boolean}[]=[];
const calls:{command:string;args:Record<string,unknown>}[]=[];
let releasePrepare:(()=>void)|null=null;
const releasePending=()=>releasePrepare?.();
let finished=false;
let closed=false;
setTransport(async(native,args)=>{
  if(native!=="memory_call")throw new Error("Unexpected native command");
  const r=args.request as {command:string;arguments:Record<string,unknown>};calls.push({command:r.command,args:r.arguments});
  let result:unknown;
  switch(r.command){
    case "provider_status":result={configured:true,destinations:[{api:"openai",model:"synthetic-openai"},{api:"anthropic",model:"synthetic-anthropic"}],grants:[
      {active:true,policyId:"conversation-only",purposes:["conversation"],destinations:[{provider:"openai",model:"synthetic-openai"}]},
      {active:true,policyId:"extraction-grant",purposes:["extraction"],destinations:[{provider:"anthropic",model:"synthetic-anthropic"}]},
    ]};break;
    case "extraction_prepare":await new Promise<void>(resolve=>{releasePrepare=resolve;});result={callId:"synthetic-call",wireHash:"synthetic-hash",sessionId:"synthetic-session",runId:"synthetic-run",model:"synthetic-anthropic",endpoint:"Synthetic Anthropic endpoint (unused)",body:"Synthetic Anthropic body"};break;
    case "external_send":result={operationId:"synthetic-operation"};break;
    case "operation_get":result={operationId:"synthetic-operation",kind:"external_send",state:finished?"succeeded":"running",progress:{done:0,total:null},cancelRequested:false,result:finished?{finish:"completed"}:null};break;
    case "extraction_preview":result={job:{state:"completed"},items:[]};break;
    default:throw new Error(`Unexpected command ${r.command}`);
  }
  return {kind:"memory_page",result,error:null};
});
const root=createRoot(fixture);
root.render(<ExtractionPanel range={{sourceId:"synthetic-source",revision:3,start:20,end:40}} onClose={()=>{closed=true;}}/>);
const text=()=>fixture.textContent??"";
const choice=()=>fixture.querySelector<HTMLSelectElement>("select");
const button=(label:string)=>[...fixture.querySelectorAll<HTMLButtonElement>("button")].find(b=>b.textContent===label);
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function wait(p:()=>boolean){for(let n=0;n<250;n++){if(p())return;await sleep(20);}throw new Error(`UI wait timed out: ${text()}`);}
function check(id:string,ok:boolean){checks.push({id,ok});if(!ok)throw new Error(id);}
function click(label:string){const b=button(label);if(!b||b.disabled)throw new Error(`Unavailable ${label}`);b.click();}
try{
  await wait(()=>text().includes("No grant allows extraction"));
  check("configured_destinations_can_be_chosen",!!choice()&&choice()!.options.length===2);
  check("conversation_grant_does_not_allow_extraction",!button("Prepare the request…")&&choice()!.value==="openai");
  const select=choice()!;select.value="anthropic";select.dispatchEvent(new Event("change",{bubbles:true}));
  await wait(()=>!!button("Prepare the request…"));
  check("chosen_provider_and_model_are_named",text().includes("anthropic (synthetic-anthropic)"));
  check("selection_does_not_send_or_grant",calls.every(c=>c.command==="provider_status"));
  click("Prepare the request…");await wait(()=>releasePrepare!=null);await sleep(50);
  check("selection_is_held_during_prepare",choice()!.disabled);
  const prepared=calls.find(c=>c.command==="extraction_prepare")!.args;
  check("prepare_uses_selected_destination_and_grant",prepared.api==="anthropic"&&prepared.policyId==="extraction-grant"&&prepared.startByte===20&&prepared.endByte===40&&prepared.sourceRevision===3);
  releasePending();await wait(()=>!!button("Send once"));
  check("prepared_body_keeps_its_destination",choice()!.disabled&&choice()!.value==="anthropic"&&text().includes("Synthetic Anthropic body"));
  click("Send once");await wait(()=>!!button("Stop locally"));
  check("running_call_keeps_its_destination",choice()!.disabled&&choice()!.value==="anthropic");
  finished=true;await wait(()=>text().includes("0 suggestions"));
  check("observed_job_keeps_its_destination",choice()!.disabled&&text().includes("Reply saved"));
  check("one_send_and_no_grant_or_key_commands",calls.filter(c=>c.command==="external_send").length===1&&calls.every(c=>["provider_status","extraction_prepare","external_send","operation_get","extraction_preview"].includes(c.command)));
  click("Close");check("settled_choice_flow_can_close",closed);
}catch(error){checks.push({id:String(error),ok:false});}
finally{releasePending();root.unmount();document.getElementById("results")!.textContent=JSON.stringify({checks,passed:checks.every(c=>c.ok),calls},null,2);}
