// Synthetic DOM-model journey; imported strings remain inert text.
import { createRoot } from "react-dom/client";
import { HistoryBriefPanel } from "../src/memory/HistoryBriefPanel";
import { call, setTransport, type J } from "../src/memory/client";
import { historyComparisonFixture } from "../tests/history-comparison-fixture";

const fixture=document.getElementById("fixture")!,root=createRoot(fixture),checks:{id:string;ok:boolean}[]=[],calls:J[]=[];
let stage="mount"; let data=historyComparisonFixture(),enabled=true,refusal=false,badHash=false,hold=false,release:(()=>void)|null=null;
const hostile="# Synthetic navigation\n<img src=x onerror=alert(1)>\n# untrusted heading\n来源限定语：尚未接受；不是正式记忆。";
const pendingRelease=()=>{const r=release;release=null;r?.();};
setTransport(async(native,{request})=>{
  if(native!=="memory_call"||request.command!=="history_brief")throw Error("Unexpected port");
  calls.push(request);
  const selected=structuredClone(data.response);
  if(hold){hold=false;await new Promise<void>(resolve=>{release=resolve;});}
  if(refusal)return{kind:"memory_error",error:{code:"permission_denied",retryable:false,rules:["history.source_read"]}};
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(hostile));
  const contentHash=badHash?"0".repeat(64):Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,"0")).join("");
  return{kind:"history_brief",result:{base:selected.base,batches:selected.batches,markdown:hostile,contentHash,maxBytes:131072}};
});
const render=()=>root.render(enabled?<HistoryBriefPanel vaultId="synthetic-vault" choices={data.choices} comparison={data.response} request={call}/>:null);
const text=()=>fixture.textContent??"",button=()=>fixture.querySelector<HTMLButtonElement>("button");
const sleep=()=>new Promise(resolve=>setTimeout(resolve,20));
async function wait(test:()=>boolean){for(let i=0;i<250;i++){if(test())return;await sleep();}throw Error("Timeout "+stage+" "+JSON.stringify(checks)+" "+text());}
function check(id:string,ok:boolean){checks.push({id,ok});if(!ok)throw Error(id);}
async function read(){button()!.click();await wait(()=>!!fixture.querySelector("pre")&&!button()?.disabled);}
try{
  render();await wait(()=>!!button());check("mount_has_no_request",calls.length===0);
  await read();
  const pre=fixture.querySelector("pre")!;
  check("exact_text_hash_is_shown",pre.textContent===hostile&&text().includes("SHA-256"));
  check("imported_markup_and_headings_are_inert",pre.childElementCount===0&&!fixture.querySelector("img")&&!fixture.querySelector("h1"));
  check("qualifier_is_preserved_and_not_canonical",pre.textContent.includes("尚未接受")&&text().includes("not a generated summary"));
  stage="refusal";refusal=true;button()!.click();await wait(()=>!!fixture.querySelector('[role="alert"]')&&!button()?.disabled);
  check("failed_refresh_removes_old_brief",!fixture.querySelector("pre"));
  stage="bad-hash";refusal=false;badHash=true;button()!.click();await wait(()=>!!fixture.querySelector('[role="alert"]')?.textContent?.includes("The Memory call failed")&&!button()?.disabled);
  check("bad_hash_never_displays_text",!fixture.querySelector("pre"));
  stage="selection-hold";badHash=false;hold=true;button()!.click();await wait(()=>release!==null);
  data=historyComparisonFixture();data.response.base.commitId+="-new";render();await sleep();pendingRelease();await sleep();
  check("comparison_change_drops_late_brief",!fixture.querySelector("pre"));
  stage="unmount-hold";hold=true;button()!.click();await wait(()=>release!==null);
  enabled=false;render();await wait(()=>fixture.childElementCount===0);pendingRelease();await sleep();
  enabled=true;render();await wait(()=>!!button());check("unmount_drops_late_brief_without_auto_read",!fixture.querySelector("pre")&&calls.length===5);
  await read();check("only_explicit_null_key_reads_occur",calls.length===6&&calls.every(r=>r.command==="history_brief"&&r.idempotencyKey===null));
  document.getElementById("results")!.textContent=JSON.stringify({passed:checks.every(c=>c.ok),checks});
}finally{pendingRelease();root.unmount();}
