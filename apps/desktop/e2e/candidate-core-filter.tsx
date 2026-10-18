// Partial-page filtering is an observation aid, never an approval rule.
import { createRoot } from "react-dom/client";
import { Inbox } from "../src/memory/MemorySurface";
import { MemoryStatusProvider } from "../src/memory/status";
import { setTransport } from "../src/memory/client";
const fixture = document.getElementById("fixture")!;
const checks: { id:string; ok:boolean }[] = [];
const calls: string[] = [];
const candidate = (id:string,priority?:string) => ({ candidateId:id,revision:1,content:`Synthetic ${id}`,proposalKind:"create",proposedType:"fact",
  sensitivity:"private",originKind:"agent_proposal",createdAt:"2026-10-18T00:00:00Z",evidence:[],contextSources:[],conflicts:[],target:null,
  ...(priority ? {details:{title:`Title ${id}`,priority}} : {}) });
setTransport(async(native,args)=>{
  if(native==="shell_status")return {vaultChanging:false};
  if(native!=="memory_call")throw new Error("Unexpected native command");
  const r=args.request as {command:string;arguments:Record<string,unknown>};calls.push(r.command);
  const result=r.command==="workspace_status"?{vault:{state:"open"},pendingCandidates:3}:r.command==="candidate_list"?
    r.arguments.cursor==null?{items:[candidate("ordinary","P1"),candidate("legacy")],total:3,nextCursor:"next-page"}:
      {items:[candidate("core","P0")],total:3,nextCursor:null}:null;
  if(result==null)throw new Error(`Unexpected mutation ${r.command}`);
  return {kind:"memory_page",result,error:null};
});
const root=createRoot(fixture);root.render(<MemoryStatusProvider><Inbox/></MemoryStatusProvider>);
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const text=()=>fixture.textContent??"";
const button=(label:string)=>[...fixture.querySelectorAll<HTMLButtonElement>("button")].find(b=>b.textContent===label);
async function wait(test:()=>boolean){for(let n=0;n<250;n++){if(test())return;await sleep(20);}throw new Error(`UI timeout: ${text()}`);}
function check(id:string,ok:boolean){checks.push({id,ok});if(!ok)throw new Error(id);}
try{
  await wait(()=>fixture.querySelectorAll("article.mem-candidate").length===2);
  const draft=fixture.querySelector<HTMLTextAreaElement>("article textarea")!;
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value")!.set!.call(draft,"Unsent synthetic edit");
  draft.dispatchEvent(new Event("input",{bubbles:true}));await sleep(25);
  const checkbox=fixture.querySelector<HTMLInputElement>('[aria-label="Show P0 core candidates"]')!;
  checkbox.click();await wait(()=>text().includes("0 P0 shown"));
  check("filter_uses_only_loaded_rows_and_reports_incomplete_scope",text().includes("3 waiting · 2 loaded · 0 P0 shown")&&text().includes("No P0 core candidates in the loaded rows"));
  check("filter_does_not_trigger_fetch_or_claim_empty_vault",calls.filter(c=>c==="candidate_list").length===1&&!text().includes("Nothing waiting for review"));
  button("Load more candidates")!.click();await wait(()=>text().includes("1 P0 shown"));
  check("later_page_core_is_visible_without_reordering_source_data",fixture.querySelectorAll("article.mem-candidate").length===1&&text().includes("Title core")&&text().includes("Proposed priority P0"));
  check("filter_preserves_global_pending_count",text().includes("3 waiting · 3 loaded · 1 P0 shown"));
  checkbox.click();await wait(()=>fixture.querySelectorAll("article.mem-candidate").length===3);
  check("filter_keeps_unsent_edits",fixture.querySelector<HTMLTextAreaElement>("article textarea")?.value==="Unsent synthetic edit");
  check("legacy_candidates_remain_available_outside_filter",text().includes("Synthetic legacy"));
  check("priority_filter_never_reviews_or_sends",calls.every(c=>["candidate_list","workspace_status"].includes(c)));
}catch(error){checks.push({id:String(error),ok:false});}
finally{root.unmount();document.getElementById("results")!.textContent=JSON.stringify({passed:checks.every(c=>c.ok),checks},null,2);}
