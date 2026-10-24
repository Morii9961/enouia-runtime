// Component journeys: actual client envelope, fake local IPC; no browser acceptance.
import { createRoot } from "react-dom/client";
import { HistoryResultPanel } from "../src/memory/HistoryResultPanel";
import { call, setTransport, type J } from "../src/memory/client";
import { historyTask } from "../tests/history-task-fixture";
import { historyResult } from "../tests/history-results-fixture";
const fixture=document.getElementById("fixture")!,root=createRoot(fixture),outside=document.createElement("input");
document.body.appendChild(outside);
const checks:{id:string;ok:boolean}[]=[],calls:J[]=[];
let vault="synthetic-vault",index=1,enabled=true,revision=0,cursor=0,state="ready",empty=false,refusal=false;
let loss:"before"|"after"|null=null,hold=false,release:(()=>void)|null=null;
const releasePending=()=>{const next=release;release=null;next?.();};
const task=()=>{const t=historyTask();t.identity.vaultId=vault;t.identity.commitId+=revision;return t;};
function result(batch:number){const r=historyResult(cursor,state);r.batchIndex=batch;r.sessionId=`synthetic-child-${batch}`;r.runId=`synthetic-run-${batch}`;r.job.run_id=r.runId;r.job.input_event_id=`synthetic-input-${batch}`;if(empty){r.items=[];r.responseHash="e".repeat(64);}return r;}
setTransport(async(native,envelope)=>{
  if(native!=="memory_call")throw new Error(`Unexpected native ${native}`);
  const r=envelope.request as J;calls.push(structuredClone(r));
  if(!["history_batch_preview","history_batch_apply","extraction_pause"].includes(r.command))throw new Error(`Unexpected ${r.command}`);
  if(refusal)return{kind:"memory_error",error:{code:"permission_denied",retryable:false,rules:["history.source_read"]}};
  if(r.command==="history_batch_apply"||r.command==="extraction_pause"){
    if(loss==="before"){loss=null;throw new Error("Synthetic unknown receipt");}
    if(r.command==="extraction_pause")state=r.arguments.paused?"paused":"ready";
    else if(r.arguments.cursor===cursor){if(empty)state="completed";else{cursor++;state=cursor===2?"completed":"ready";}}
    if(loss==="after"){loss=null;throw new Error("Synthetic lost receipt after local commit");}
  }
  const observed=result(r.command==="extraction_pause"?index:r.arguments.batchIndex);
  if(hold){hold=false;await new Promise<void>(resolve=>{release=resolve;});}
  if(r.command==="extraction_pause")return{kind:"extraction_job",result:{job:observed.job}};
  if(r.command==="history_batch_preview")return{kind:"extraction_preview",result:observed};
  const {items,dispatchId,...receipt}=observed;void items;void dispatchId;return{kind:"extraction_job",result:receipt};
});
const render=()=>root.render(<HistoryResultPanel vaultId={vault} task={task()} index={index} enabled={enabled} request={call}/>);
const text=()=>fixture.textContent??"",sleep=()=>new Promise(resolve=>setTimeout(resolve,20));
const button=(label:string)=>[...fixture.querySelectorAll<HTMLButtonElement>("button")].find(b=>b.textContent===label);
const checkbox=()=>fixture.querySelector<HTMLInputElement>('input[type="checkbox"]');
const inspect="Inspect saved batch results",apply="Add one result to review",recover="Recover original local step";
async function wait(test:()=>boolean){for(let n=0;n<250;n++){if(test())return;await sleep();}throw new Error(`Timeout ${text()}`);}
function click(label:string){const b=button(label);if(!b||b.disabled)throw new Error(`Unavailable ${label}: ${text()}`);b.focus();b.click();}
async function confirm(){checkbox()!.click();await wait(()=>!!checkbox()?.checked);}
function check(id:string,ok:boolean){checks.push({id,ok});if(!ok)throw new Error(id);}
const writes=()=>calls.filter(r=>r.command==="history_batch_apply");
const controls=()=>calls.filter(r=>r.command==="extraction_pause");
async function inspectSaved(){click(inspect);await sleep();await wait(()=>!!fixture.querySelector("h4")&&!button(inspect)?.disabled);}
try{
  render();await wait(()=>!!button(inspect)&&!button(inspect)!.disabled);
  check("mount_does_not_read_or_write",calls.length===0&&!checkbox());
  await inspectSaved();
  check("full_proposal_quote_context_source_and_unknown_time_are_plain_text",text().includes("Synthetic original proposal 0")&&text().includes("A complete synthetic quote with its nearby qualifier.")&&text().includes("synthetic-source")&&text().includes("user_statement")&&text().includes("Occurred: Unknown")&&!!button(apply)?.disabled);
  await wait(()=>document.activeElement===fixture.querySelector("h4"));
  check("inspection_moves_owned_focus_without_confirming",!checkbox()!.checked&&writes().length===0);
  await confirm();render();await sleep();check("equivalent_task_copy_does_not_reset_review",!!checkbox()?.checked);
  await inspectSaved();check("refresh_withdraws_old_checkbox_confirmation",!checkbox()!.checked&&!!button(apply)?.disabled);
  await confirm();click("Pause local result processing");await wait(()=>text().includes("Local pause-state receipt observed"));
  check("pause_is_only_the_observed_original_child_and_never_advances_cursor",cursor===0&&writes().length===0&&JSON.stringify(controls()[0].arguments)===JSON.stringify({sessionId:"synthetic-child-1",runId:"synthetic-run-1",paused:true})&&!checkbox());
  await inspectSaved();check("paused_result_requires_fresh_confirmation_before_resume",!!button("Resume local result processing")?.disabled&&!button(apply)&&!checkbox()!.checked);
  await confirm();click("Resume local result processing");await wait(()=>text().includes("Local pause-state receipt observed"));
  check("resume_adds_nothing_and_does_not_restore_old_preview",cursor===0&&writes().length===0&&!checkbox());
  await inspectSaved();loss="before";await confirm();click("Pause local result processing");await wait(()=>text().includes("pause-state decision needs a fresh observation"));
  const unknownControl=controls().at(-1)!;const controlsBeforeRead=controls().length;await inspectSaved();
  check("unknown_control_recovery_is_read_only_and_does_not_reuse_checkbox",controls().length===controlsBeforeRead&&!checkbox()!.checked&&!!button("Pause local result processing")?.disabled);
  await confirm();click("Pause local result processing");await wait(()=>text().includes("Local pause-state receipt observed"));
  check("new_explicit_pause_decision_has_its_own_key",controls().at(-1)!.idempotencyKey!==unknownControl.idempotencyKey&&cursor===0&&writes().length===0);
  await inspectSaved();loss="after";await confirm();click("Resume local result processing");await wait(()=>text().includes("pause-state decision needs a fresh observation"));
  const controlsBeforeObservation=controls().length;await inspectSaved();check("lost_control_receipt_observes_current_state_without_replay",controls().length===controlsBeforeObservation&&state==="ready"&&cursor===0&&!checkbox()!.checked);
  await confirm();const applyControl=button(apply)!;applyControl.click();applyControl.click();await wait(()=>text().includes("Local step receipt observed"));
  check("double_click_applies_one_cursor_without_automatic_refresh",writes().length===1&&writes()[0].arguments.cursor===0&&cursor===1&&!checkbox()&&!text().includes("Synthetic original proposal"));
  check("reads_are_unkeyed_and_write_is_exact_original_identity",calls.filter(r=>r.command==="history_batch_preview").every(r=>r.idempotencyKey===null)&&JSON.stringify(writes()[0].arguments)===JSON.stringify({taskId:task().taskId,batchIndex:1,responseHash:"d".repeat(64),cursor:0}));
  await inspectSaved();check("current_candidate_content_stays_distinct_from_original",text().includes("Original proposal: Synthetic original proposal 0")&&text().includes("Current candidate")&&text().includes("Current candidate 0")&&!checkbox()!.checked);
  loss="before";await confirm();click(apply);await wait(()=>text().includes("previous local step outcome is unconfirmed"));
  const unknown=writes().at(-1)!;check("unknown_receipt_withdraws_preview_and_next_write",!checkbox()&&!button(apply)&&cursor===1);
  await inspectSaved();check("same_position_offers_explicit_original_recovery",!!button(recover)?.disabled);
  await confirm();click("Pause local result processing");await wait(()=>text().includes("Local pause-state receipt observed"));await inspectSaved();
  await confirm();click("Resume local result processing");await wait(()=>text().includes("Local pause-state receipt observed"));await inspectSaved();
  check("pause_resume_does_not_replace_unknown_original_application",!!button(recover)?.disabled&&writes().at(-1)!.idempotencyKey===unknown.idempotencyKey);
  await confirm();click(recover);await wait(()=>text().includes("Local step receipt observed"));
  check("recovery_reuses_original_hash_cursor_key",writes().at(-1)!.idempotencyKey===unknown.idempotencyKey&&JSON.stringify(writes().at(-1)!.arguments)===JSON.stringify(unknown.arguments)&&cursor===2);
  await inspectSaved();check("completed_processing_is_not_approval",text().includes("Saved local processing is complete")&&!checkbox()&&!button(apply)&&text().includes("pending"));
  revision++;cursor=0;state="ready";render();await wait(()=>!!button(inspect)&&!button(inspect)!.disabled&&!fixture.querySelector("h4"));
  await inspectSaved();loss="after";await confirm();click(apply);await wait(()=>text().includes("previous local step outcome is unconfirmed"));
  const beforeRefresh=writes().length;await inspectSaved();check("read_after_lost_commit_observes_progress_without_replaying",cursor===1&&writes().length===beforeRefresh&&!button(recover)&&!!button(apply)?.disabled);
  state="paused";await inspectSaved();check("paused_observation_cannot_authorize_candidate_application",text().includes("This local job is paused")&&!button(apply)&&!!button("Resume local result processing")?.disabled);
  refusal=true;click(inspect);await wait(()=>!!fixture.querySelector('[role="alert"]')&&!button(inspect)?.disabled);check("source_refusal_withdraws_previous_text_and_authority",!text().includes("Synthetic original proposal")&&!checkbox());
  refusal=false;state="ready";hold=true;click(inspect);await wait(()=>release!==null);outside.focus();releasePending();await wait(()=>!!fixture.querySelector("h4"));await sleep();check("late_read_respects_outside_focus",document.activeElement===outside);
  hold=true;click(inspect);await wait(()=>release!==null);index=0;render();await wait(()=>text().includes("Saved batch 1 results"));index=1;render();await sleep();releasePending();await sleep();check("batch_round_trip_cannot_restore_old_preview",!fixture.querySelector("h4")&&!checkbox());
  hold=true;click(inspect);await wait(()=>release!==null);enabled=false;render();await wait(()=>fixture.childElementCount===0);releasePending();await sleep();enabled=true;render();await wait(()=>!!button(inspect)&&!button(inspect)!.disabled);check("lifecycle_disable_reenable_drops_late_text_and_confirmation",!fixture.querySelector("h4")&&!checkbox());
  hold=true;click(inspect);await wait(()=>release!==null);vault="another-synthetic-vault";render();await sleep();releasePending();await sleep();check("vault_switch_discards_old_observation",!text().includes("Synthetic original proposal")&&!checkbox());
  empty=true;cursor=0;state="ready";await inspectSaved();check("empty_response_has_explicit_completion_not_a_candidate",text().includes("contains no suggestions")&&!!button("Complete empty local result")?.disabled);
  await confirm();click("Complete empty local result");await wait(()=>text().includes("Local step receipt observed"));await inspectSaved();check("empty_completion_stays_at_zero_without_candidates",text().includes("0 / 0 processed · completed")&&!checkbox());
  vault="late-write-synthetic-vault";empty=false;cursor=0;state="ready";render();await wait(()=>!!button(inspect)&&!button(inspect)!.disabled&&!fixture.querySelector("h4"));
  await inspectSaved();await confirm();hold=true;click(apply);await wait(()=>release!==null);
  const lateStep=writes().at(-1)!;enabled=false;render();await wait(()=>fixture.childElementCount===0);releasePending();await sleep();enabled=true;render();await wait(()=>!!button(inspect)&&!button(inspect)!.disabled);
  check("late_write_receipt_cannot_restore_preview_or_confirmation",!checkbox()&&!fixture.querySelector("h4")&&text().includes("matching receipt was observed"));
  const afterLateWrite=writes().length;await inspectSaved();
  check("reopened_panel_observes_late_write_without_consuming_next_item",cursor===1&&writes().length===afterLateWrite&&lateStep.arguments.cursor===0&&!button(recover)&&!!button(apply)?.disabled);
  check("only_saved_preview_single_step_and_local_pause_commands_were_used",calls.every(r=>["history_batch_preview","history_batch_apply","extraction_pause"].includes(r.command)));
  document.getElementById("results")!.textContent=JSON.stringify({fixture:"history-results",passed:checks.every(c=>c.ok),checks});
}finally{releasePending();root.unmount();outside.remove();}
