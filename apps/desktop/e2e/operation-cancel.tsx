// Held reads demonstrate a real ordering hazard; all IPC is synthetic.
import { createRoot } from "react-dom/client";
import { Operation } from "../src/memory/ui";
import { setTransport } from "../src/memory/client";
import "../src/quiet-runtime.css";
import "../src/memory/memory.css";

const fixture=document.getElementById("fixture")!;
const checks:{id:string;ok:boolean}[]=[];
const calls:string[]=[];
let mode="ack";
let reads=0;
let releaseRead:(()=>void)|null=null;
let requested=false;
let finish=false;
let callbacks=0;
const releasePendingRead=()=>releaseRead?.();
const snapshot=()=>({operationId:"synthetic-operation",kind:"external_send",state:finish?(mode==="late"?"succeeded":"cancelled"):"running",cancelRequested:requested,progress:{done:0,total:null},result:finish&&mode==="late"?{finish:"completed"}:null});
setTransport(async(native,args)=>{
  if(native!=="memory_call")throw new Error("Unexpected native command");
  const r=args.request as {command:string;arguments:Record<string,unknown>};
  calls.push(r.command);
  if(r.arguments.operationId!=="synthetic-operation")throw new Error("Wrong operation ID");
  let result:unknown;
  if(r.command==="operation_get"){
    reads++;
    if(mode==="read-error"&&reads===2)throw new Error("Synthetic status delivery failure");
    if(reads===2){const old=snapshot();await new Promise<void>(resolve=>{releaseRead=resolve;});result=old;}
    else result=snapshot();
  }else if(r.command==="operation_cancel"){
    if(mode==="foreign")result={...snapshot(),operationId:"other-operation",cancelRequested:true};
    else {if(mode==="late")finish=true;else requested=true;result=snapshot();}
  }else throw new Error(`Unexpected command ${r.command}`);
  return {kind:"memory_page",result,error:null};
});
let root=createRoot(fixture);
const render=()=>root.render(<Operation id="synthetic-operation" onDone={()=>{callbacks++;}} />);
const text=()=>fixture.textContent??"";
const button=(label:string)=>[...fixture.querySelectorAll<HTMLButtonElement>("button")].find(b=>b.textContent===label);
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function wait(p:()=>boolean){for(let n=0;n<250;n++){if(p())return;await sleep(20);}throw new Error(`UI wait timed out: ${text()}`);}
function check(id:string,ok:boolean){checks.push({id,ok});if(!ok)throw new Error(id);}
try{
  render();await wait(()=>!!button("Stop locally")&&releaseRead!=null);
  button("Stop locally")!.click();
  await sleep(50);
  check("acknowledgement_is_immediately_visible",!!button("Local stop requested")&&button("Local stop requested")!.disabled);
  releasePendingRead();
  await sleep(50);
  check("old_read_cannot_clear_acknowledgement",!!button("Local stop requested")&&button("Local stop requested")!.disabled);
  check("acknowledgement_is_not_terminal",callbacks===0&&!text().includes("recorded outcome"));
  finish=true;
  await wait(()=>callbacks===1);
  check("real_terminal_observation_finishes_once",text().includes("cancelled"));

  root.unmount();root=createRoot(fixture);mode="late";reads=0;releaseRead=null;requested=false;finish=false;callbacks=0;
  render();await wait(()=>!!button("Stop locally")&&releaseRead!=null);
  button("Stop locally")!.click();await sleep(50);
  check("already_finished_cancel_reply_is_observed",text().includes("Reply saved")&&callbacks===1);
  releasePendingRead();await sleep(50);
  check("old_read_cannot_reopen_terminal",text().includes("Reply saved")&&!button("Stop locally"));
  await sleep(450);
  check("terminal_callback_is_not_repeated",callbacks===1);

  root.unmount();root=createRoot(fixture);mode="foreign";reads=0;releaseRead=null;requested=false;finish=false;callbacks=0;
  render();await wait(()=>!!button("Stop locally")&&releaseRead!=null);
  button("Stop locally")!.click();await sleep(50);
  check("foreign_acknowledgement_rejected",text().includes("does not match the contract")&&!!button("Stop locally")&&!button("Local stop requested")&&callbacks===0);
  mode="ack";button("Stop locally")!.click();await sleep(50);
  check("fresh_stop_can_recover_invalid_reply",!!button("Local stop requested")&&!text().includes("does not match the contract"));
  releasePendingRead();

  root.unmount();root=createRoot(fixture);mode="read-error";reads=0;releaseRead=null;requested=false;finish=false;callbacks=0;
  render();await wait(()=>text().includes("Could not read the operation"));
  check("read_failure_retains_stop_control",!!button("Stop locally")&&callbacks===0);
  button("Stop locally")!.click();await sleep(50);
  check("stop_ack_restarts_failed_observation",!!button("Local stop requested")&&!text().includes("Could not read the operation"));
  finish=true;await wait(()=>callbacks===1&&text().includes("cancelled"));
  check("restarted_observation_reaches_terminal",text().includes("cancelled"));
  check("only_local_get_and_cancel",calls.every(c=>["operation_get","operation_cancel"].includes(c)));
}catch(error){checks.push({id:String(error),ok:false});}
finally{releasePendingRead();root.unmount();document.getElementById("results")!.textContent=JSON.stringify({checks,passed:checks.every(c=>c.ok),calls},null,2);}
