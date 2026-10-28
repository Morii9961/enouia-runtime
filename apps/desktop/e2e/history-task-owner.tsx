// Actual stable task owner and head-bound import report; no native data.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { HistoryTasks, useHistoryTasks } from "../src/memory/HistoryTaskPanel";
import { ImportReport } from "../src/memory/ImportReport";
import { call, setTransport, type J } from "../src/memory/client";
import { historyTask, historyTaskRequest } from "../tests/history-task-fixture";

const fixture = document.getElementById("fixture")!, root = createRoot(fixture), checks: { id: string; ok: boolean }[] = [];
const calls: { command: string; args: J; key: unknown }[] = [];
let failReceipt = true, hold = true, release: (() => void) | null = null, active = false, saved = false, partial = false;
const releasePending = () => { const next = release; release = null; next?.(); };
let vaultId = "synthetic-vault", instance = "one", detailMismatch = false, refuse = false;
let runActive = false, holdOps = false, releaseOps: (() => void) | null = null;
const releaseOperations = () => { const next = releaseOps; releaseOps = null; next?.(); };
const progress = () => { const r = historyTask(partial ? [1] : [1, 0]); r.identity.vaultId = vaultId; if (detailMismatch) r.taskId = "wrong-task"; return r; };
setTransport(async (native, args) => {
  if (native !== "memory_call") throw new Error(native);
  const r = args.request as J; calls.push({ command: r.command, args: structuredClone(r.arguments), key: r.idempotencyKey });
  let result: J;
  const op = () => ({ operationId: "synthetic-operation", kind: "history_materialize", state: active ? "running" : "succeeded", cancelRequested: false, progress: { done: active ? 0 : 1, total: 1 }, result: active ? null : progress() });
  switch (r.command) {
    case "history_task_list": result = { identity: { vaultId, commitId: "synthetic-head" }, items: saved ? [historyTask()] : [], nextCursor: null, readOnly: true }; break;
    case "operation_list": result = { items: active ? [op()] : [] };
      if (holdOps) { holdOps = false; await new Promise<void>(resolve => { releaseOps = resolve; }); } break;
    case "history_materialize":
      if (refuse) { refuse = false; return { kind: "memory_error", error: { code: "revision_conflict", retryable: false, rules: ["history.plan_stale"] } }; }
      if (runActive) { runActive = false; active = true; }
      saved = true;
      if (hold) { hold = false; await new Promise<void>(resolve => { release = resolve; }); }
      if (failReceipt) { failReceipt = false; return { kind: "memory_error", error: { code: "busy", retryable: true, rules: [] } }; }
      result = { operationId: "synthetic-operation" }; break;
    case "history_resume": partial = false; result = { operationId: "synthetic-resume" }; break;
    case "operation_get": result = r.arguments.operationId === "synthetic-resume" ? { ...op(), operationId: "synthetic-resume", kind: "history_resume", state: "succeeded", result: progress() } : op(); break;
    case "history_task_get": result = progress(); break;
    default: throw new Error(`Unexpected ${r.command}`);
  }
  return { kind: "synthetic", result };
});
function Harness() {
  const tasks = useHistoryTasks(vaultId, call), [head, setHead] = useState("old-head"), [report, setReport] = useState(true);
  return <>
    <button disabled={!tasks.ready} onClick={() => tasks.create(historyTaskRequest())}>Submit synthetic selection</button>
    <button onClick={() => { setHead("new-head"); setReport(false); }}>Refresh and close report</button>
    {report && <ImportReport selected="synthetic-import" current vaultId={vaultId} vaultHead={head}
      row={{ importId: "synthetic-import", revision: 7, status: "completed", counts: {}, warnings: [] }} close={() => setReport(false)} onCreateHistory={tasks.create} historyBusy={!tasks.ready} />}
    <HistoryTasks tasks={tasks} />
  </>;
}
const render = () => root.render(<div key={`${instance}:${vaultId}`} data-instance={`${instance}:${vaultId}`}><Harness /></div>), text = () => fixture.textContent ?? "";
const button = (label: string) => [...fixture.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === label);
const sleep = () => new Promise(resolve => setTimeout(resolve, 20));
async function wait(test: () => boolean) { for (let n = 0; n < 250; n++) { if (test()) return; await sleep(); } throw new Error(`timeout ${text()}`); }
const ready = () => wait(() => fixture.firstElementChild?.getAttribute("data-instance") === `${instance}:${vaultId}` && !!button("Submit synthetic selection") && !button("Submit synthetic selection")!.disabled);
function click(label: string) { const b = button(label); if (!b || b.disabled) throw new Error(`Unavailable ${label}`); b.click(); }
function check(id: string, ok: boolean) { checks.push({ id, ok }); if (!ok) throw new Error(id); }
const writes = () => calls.filter(c => ["history_materialize", "history_resume"].includes(c.command));
try {
  render(); await ready();
  check("reopening_discovers_tasks_and_active_operations_before_new_writes", calls.some(c => c.command === "history_task_list") && calls.some(c => c.command === "operation_list") && writes().length === 0);
  click("Submit synthetic selection"); button("Submit synthetic selection")!.click(); await wait(() => release !== null);
  click("Refresh and close report");
  // The owner is ready before its deferred view. Wait for that view to commit,
  // keeping the receipt held while asserting the exact write count below.
  await wait(() => text().includes("Waiting for the local task operation receipt") && !text().includes("History planning"));
  check("held_admission_survives_report_close_without_duplicate_write", writes().length === 1 && text().includes("Waiting for the local task operation receipt") && !text().includes("History planning"));
  releasePending(); await wait(() => !!button("Retry original history submission"));
  check("uncertain_receipt_blocks_new_submission", button("Submit synthetic selection")!.disabled);
  click("Retry original history submission"); await wait(() => text().includes("All selected local jobs exist"));
  check("retry_retains_exact_arguments_and_original_key", writes().length === 2 && writes()[0].key === writes()[1].key && JSON.stringify(writes()[0].args) === JSON.stringify(writes()[1].args));
  check("local_creation_is_not_reported_as_model_or_review_completion", text().includes("Model extraction and review are still separate") && !calls.some(c => c.command === "external_send"));
  check("saved_limits_are_visible_before_continuation", text().includes("Reserved token ceiling per batch") && [...fixture.querySelectorAll('dt')].find(el => el.textContent === "Cost ceiling per batch (micro USD)")?.nextElementSibling?.textContent === "unknown");
  partial = true; click("Read this history task again"); await wait(() => text().includes("1 local jobs are missing"));
  click("Resume missing local jobs"); await wait(() => text().includes("All selected local jobs exist"));
  check("resume_addresses_original_task_without_new_admission", writes().at(-1)!.command === "history_resume" && writes().at(-1)!.args.taskId === "synthetic-history-task" && writes().filter(c => c.command === "history_materialize").length === 2);
  detailMismatch = true; click("Read this history task again"); await wait(() => text().includes("The Memory call failed"));
  check("mismatched_task_read_hides_previous_progress_and_resume", !text().includes("All selected local jobs exist") && !button("Resume missing local jobs"));
  detailMismatch = false; instance = "reopened"; active = true; render(); await wait(() => text().includes("running"));
  check("recovered_running_operation_withholds_new_creation", button("Submit synthetic selection")!.disabled);
  active = false; await wait(() => !button("Submit synthetic selection")!.disabled);
  check("saved_tasks_reappear_after_surface_remount", text().includes("Read task synthetic-history-task"));
  refuse = true; click("Submit synthetic selection"); await wait(() => text().includes("Memory refused this submission") && !button("Submit synthetic selection")!.disabled);
  check("typed_final_refusal_allows_fresh_planning_without_replaying_stale_arguments", !button("Retry original history submission"));
  hold = true; click("Submit synthetic selection"); await wait(() => release !== null);
  vaultId = "other-vault"; render(); await ready();
  releasePending(); await sleep(); await sleep();
  check("late_write_receipt_cannot_publish_into_another_vault", !text().includes("Operation receipt.") && !text().includes("Observed local task") && !text().includes("Waiting for the local task operation receipt"));
  instance = "overlapping-observation"; render(); await ready();
  runActive = true; click("Submit synthetic selection"); await wait(() => text().includes("running"));
  holdOps = true; click("Read saved history tasks"); await wait(() => releaseOps !== null); active = false;
  await wait(() => text().includes("Operation receipt."));
  const observed = calls.filter(c => c.command === "operation_get").length;
  releaseOperations(); await wait(() => !button("Submit synthetic selection")!.disabled); await sleep();
  check("older_operation_list_cannot_reopen_a_terminal_owned_operation", calls.filter(c => c.command === "operation_get").length === observed && !text().includes("running"));
  document.getElementById("results")!.textContent = JSON.stringify({ fixture: "history-task-owner", passed: checks.every(c => c.ok), checks });
} finally { releasePending(); releaseOperations(); root.unmount(); }
