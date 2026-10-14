// The saved ledger remains local when native Provider setup is off.
import { createRoot } from "react-dom/client";
import { useState } from "react";
import { ExternalPanel } from "../src/memory/ExternalPanel";
import { setTransport } from "../src/memory/client";
import "../src/quiet-runtime.css";
import "../src/memory/memory.css";

const calls: {command:string; args:Record<string,unknown>; key:unknown}[] = [];
const checks: {id:string;ok:boolean}[] = [];
const fixture = document.getElementById("fixture")!;
let canonicalClosed = false;
let loseReceipt = true;
let commits = 0;
setTransport(async (native, args) => {
  if (native === "memory_provider_setup") return {state:"absent"};
  if (native !== "memory_call") throw new Error(`Unexpected native command ${native}`);
  const r = args.request as {command:string;arguments:Record<string,unknown>;idempotencyKey:unknown};
  calls.push({command:r.command,args:r.arguments,key:r.idempotencyKey});
  const reply = (result:unknown) => ({kind:"memory_page",result,error:null});
  if (r.command === "provider_status") return reply({configured:false,destinations:[],grants:[]});
  if (r.command === "external_interrupt_plan") return reply({kind:"interrupt",planId:"synthetic-plan",diffHash:"synthetic-hash",inspection:"Close synthetic unknown call locally; remote outcome remains unknown."});
  if (r.command === "provider_confirm") {
    if (!canonicalClosed) {canonicalClosed = true; commits++;}
    if (loseReceipt) {loseReceipt = false;return {kind:"memory_error",error:{code:"busy",retryable:true,rules:[]}};}
    return reply({kind:"interrupt"});
  }
  throw new Error(`Unexpected Core command ${r.command}`);
});
function Fixture() {
  const [state,setState] = useState("outcome_unknown");
  return <ExternalPanel branch={{sessionId:"synthetic-session",branchId:"synthetic-branch"}} text="Unsent question"
    invocations={[{dispatch_id:"synthetic-dispatch",input_event_id:"synthetic-input",state,reserved_tokens:128}]}
    consumeText={()=>{throw new Error("Unsent draft was consumed");}}
    onChanged={async()=>{setState(canonicalClosed ? "cancelled" : "outcome_unknown");}} />;
}
const root = createRoot(fixture);root.render(<Fixture />);
const text = () => fixture.textContent ?? "";
const button = (label:string) => [...fixture.querySelectorAll<HTMLButtonElement>("button")].find(b=>b.textContent===label);
const sleep = (ms:number) => new Promise(resolve=>setTimeout(resolve,ms));
async function wait(p:()=>boolean) {for(let n=0;n<250;n++){if(p())return;await sleep(20);}throw new Error(`UI wait timed out: ${text()}`);}
function click(label:string){const b=button(label);if(!b||b.disabled)throw new Error(`Unavailable: ${label}`);b.click();}
function check(id:string,ok:boolean){checks.push({id,ok});if(!ok)throw new Error(id);}
try {
  await wait(()=>text().includes("External providers are off"));
  check("off_setup_keeps_saved_ledger", text().includes("outcome unknown"));
  check("off_setup_has_local_close", button("Close locally…")?.disabled === false);
  click("Close locally…");
  await wait(()=>button("Confirm")?.disabled === false);
  const planCall = calls.find(c=>c.command==="external_interrupt_plan")!;
  check("plan_targets_recorded_ids",planCall.args.inputEventId==="synthetic-input"&&planCall.args.dispatchId==="synthetic-dispatch");
  check("exact_local_plan_is_visible",text().includes("remote outcome remains unknown"));
  click("Confirm");
  await wait(()=>!!button("Retry"));
  check("lost_receipt_does_not_claim_local_close",!text().includes("closed locally"));
  click("Retry");
  await wait(()=>text().includes("closed locally"));
  const confirmations=calls.filter(c=>c.command==="provider_confirm");
  check("retry_keeps_confirmation_payload_and_key",confirmations.length===2&&confirmations[0].key===confirmations[1].key&&JSON.stringify(confirmations[0].args)===JSON.stringify(confirmations[1].args));
  check("receipt_replay_does_not_double_commit",commits===1);
  check("off_setup_stays_off",text().includes("External providers are off"));
  check("off_setup_offers_no_egress",!button("Set key…")&&!button("Send once")&&!button("Prepare the question for openai…"));
  check("only_local_read_plan_confirm_commands",calls.every(c=>["provider_status","external_interrupt_plan","provider_confirm"].includes(c.command)));
}catch(error){checks.push({id:String(error),ok:false});}
finally{root.unmount();document.getElementById("results")!.textContent=JSON.stringify({checks,passed:checks.every(c=>c.ok),commands:calls.map(c=>c.command),commits},null,2);}
