// DOM-model journey; synthetic transport only, no native/browser acceptance.
import { createRoot } from "react-dom/client";
import { HistoryComparisonPanel } from "../src/memory/HistoryComparisonPanel";
import { HistoryComparisonSelection } from "../src/memory/HistoryComparisonSelection";
import { call, setTransport, type J } from "../src/memory/client";
import { historyComparisonFixture } from "../tests/history-comparison-fixture";
import { setLang, useLang, type Lang } from "../src/i18n";

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
function Surface(){useLang();return <HistoryComparisonPanel vaultId="synthetic-vault" choices={data.choices} enabled={enabled} request={call}/>;}
const render=()=>root.render(<Surface/>);
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
  const coverage=fixture.querySelectorAll<HTMLSelectElement>('select')[2],beforeLanguage=calls.length;
  coverage.value='unknown';coverage.dispatchEvent(new Event('change',{bubbles:true}));await sleep();coverage.focus();
  for(const [language,entry,summary] of [
    ['en','Original proposal: Original synthetic proposal 0','Source spans matching the current navigation view'],
    ['zh-Hans','原始建议：Original synthetic proposal 0','符合当前导航条件的来源片段'],
    ['ja','元の提案：Original synthetic proposal 0','現在のナビゲーションの選択内容に一致するソース区間'],
  ]){
    await setLang(language as Lang);await wait(()=>text().includes(entry)&&text().includes(summary));
    check(`${language}_comparison_keeps_exact_content_and_response_identity`,text().includes('edited_synthetic_key')&&text().includes('not accepted.')&&text().includes(data.response.runs[0].response_hash)&&text().includes('synthetic-comparison-head'));
    check(`${language}_language_preserves_coverage_filter_node_and_focus`,coverage.isConnected&&coverage.value==='unknown'&&document.activeElement===coverage);
  }
  check('language_changes_do_not_repeat_comparison_reads',calls.length===beforeLanguage);
  await setLang('en');await wait(()=>text().includes('Original proposal:'));
  refusal=true;button()!.click();await wait(()=>!!fixture.querySelector('[role="alert"]')&&!button()?.disabled);
  check("failed_refresh_withdraws_previous_source_text",!text().includes("Original synthetic proposal")&&!fixture.querySelector("details"));
  const failedCalls=calls.length,errorControl=button()!;errorControl.focus();
  for(const [language,error] of [['zh-Hans','当前策略不允许为规划预览读取这些来源'],['ja','現在のポリシーでは、計画のプレビューのためにこれらのソースを読むことはできません'],['en','The current policy does not allow reading these sources for a planning preview']]){
    await setLang(language as Lang);await wait(()=>!!fixture.querySelector('[role="alert"]')?.textContent?.includes(error));
    check(`${language}_comparison_error_keeps_withdrawal_and_manual_recovery`,calls.length===failedCalls&&button()===errorControl&&document.activeElement===errorControl&&!fixture.querySelector('details'));
  }
  refusal=false;hold=true;button()!.click();await wait(()=>release!==null);
  data=historyComparisonFixture();data.choices.reverse();render();await sleep();pendingRelease();await sleep();
  check("selection_change_discards_late_view",!text().includes("Original synthetic proposal"));
  data=historyComparisonFixture();render();await sleep();hold=true;button()!.click();await wait(()=>release!==null);
  enabled=false;render();await wait(()=>fixture.childElementCount===0);pendingRelease();await sleep();
  enabled=true;render();await wait(()=>!!button());
  check("lifecycle_disable_drops_old_view_without_automatic_read",!text().includes("Original synthetic proposal")&&calls.length===4);
  await read();
  check("no_mutation_or_automatic_followup",calls.length===5&&calls.every(r=>r.command==="history_compare"&&r.idempotencyKey===null));
  for(const batch of data.task.batches)batch.invocationState='completed';
  function Selection(){useLang();return <HistoryComparisonSelection vaultId="synthetic-vault" tasks={[data.task]} enabled request={call}/>;}
  root.render(<Selection/>);await wait(()=>!!fixture.querySelector('input[type="checkbox"]'));
  const selected=fixture.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  selected.click();await wait(()=>text().includes('Selected 1/32'));selected.focus();
  const selectionCalls=calls.length;
  for(const [language,label] of [['zh-Hans','已选择 1/32 个保存批次'],['ja','保存済みバッチを 1/32 件選択'],['en','Selected 1/32 saved batches']]){
    await setLang(language as Lang);await wait(()=>text().includes(label));
    check(`${language}_language_keeps_saved_batch_selection_and_focus`,selected.isConnected&&selected.checked&&document.activeElement===selected);
  }
  check('selection_language_changes_do_not_read_or_write',calls.length===selectionCalls);
  document.getElementById("results")!.textContent=JSON.stringify({passed:checks.every(c=>c.ok),checks});
}finally{pendingRelease();root.unmount();}
