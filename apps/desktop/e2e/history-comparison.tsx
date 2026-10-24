// DOM-model journey; synthetic transport only, no native/browser acceptance.
import { createRoot } from "react-dom/client";
import { HistoryComparisonPanel } from "../src/memory/HistoryComparisonPanel";
import { call, setTransport, type J } from "../src/memory/client";
import { historyComparisonFixture } from "../tests/history-comparison-fixture";

const fixture=document.getElementById("fixture")!,root=createRoot(fixture),checks:{id:string;ok:boolean}[]=[],calls:J[]=[];
let data=historyComparisonFixture(),enabled=true,refusal=false,hold=false,release:(()=>void)|null=null;
const pendingRelease=()=>{const r=release;release=null;r?.();};
setTransport(async(native,{request})=>{
  if(native!=="memory_call"||request.command!=="history_compare")throw Error("Unexpected port");
  calls.push(request);
  const result=structuredClone(data.response);
  if(hold){hold=false;await new Promise<void>(resolve=>{release=resolve;});}
  if(refusal)return{kind:"memory_error",error:{code:"permission_denied",retryable:false,rules:["history.source_read"]}};
  return{kind:"history_comparison",result};
});
const render=()=>root.render(<HistoryComparisonPanel vaultId="synthetic-vault" choices={data.choices} enabled={enabled} request={call}/>);
const text=()=>fixture.textContent??"",button=()=>fixture.querySelector<HTMLButtonElement>("button");
const sleep=()=>new Promise(resolve=>setTimeout(resolve,20));
async function wait(test:()=>boolean){for(let i=0;i<250;i++){if(test())return;await sleep();}throw Error("Timeout "+text());}
function check(id:string,ok:boolean){checks.push({id,ok});if(!ok)throw Error(id);}
async function read(){button()!.click();await wait(()=>text().includes("Original synthetic proposal")&&!button()?.disabled);}
try{
  render();await wait(()=>!!button());
  check("mount_does_not_read_or_write",calls.length===0);
  await read();
  check("unknown_time_and_non_user_evidence_remain_explicit",text().includes("Occurred: Unknown")&&text().includes("Not user evidence"));
  check("original_and_owner_edited_details_remain_separate",text().includes("Original synthetic proposal 0")&&text().includes("Current owner edited synthetic wording")&&text().includes("edited_synthetic_key"));
  check("qualifier_and_hint_are_not_current_truth",text().includes("not accepted.")&&text().includes("Unordered difference hint")&&text().includes("do not choose a current truth"));
  check("source_coverage_is_available",!!fixture.querySelector("details")&&text().includes("synthetic-source-1"));
  render();await sleep();check("equivalent_metadata_copy_preserves_view",text().includes("Original synthetic proposal"));
  refusal=true;button()!.click();await wait(()=>!!fixture.querySelector('[role="alert"]')&&!button()?.disabled);
  check("failed_refresh_withdraws_previous_source_text",!text().includes("Original synthetic proposal")&&!fixture.querySelector("details"));
  refusal=false;hold=true;button()!.click();await wait(()=>release!==null);
  data=historyComparisonFixture();data.choices.reverse();render();await sleep();pendingRelease();await sleep();
  check("selection_change_discards_late_view",!text().includes("Original synthetic proposal"));
  data=historyComparisonFixture();render();await sleep();hold=true;button()!.click();await wait(()=>release!==null);
  enabled=false;render();await wait(()=>fixture.childElementCount===0);pendingRelease();await sleep();
  enabled=true;render();await wait(()=>!!button());
  check("lifecycle_disable_drops_old_view_without_automatic_read",!text().includes("Original synthetic proposal")&&calls.length===4);
  await read();
  check("no_mutation_or_automatic_followup",calls.length===5&&calls.every(r=>r.command==="history_compare"&&r.idempotencyKey===null));
  document.getElementById("results")!.textContent=JSON.stringify({passed:checks.every(c=>c.ok),checks});
}finally{pendingRelease();root.unmount();}
