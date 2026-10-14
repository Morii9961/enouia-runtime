// Core operation-list re-observation, with no native app/Vault/Provider.
import { createRoot } from "react-dom/client";
import { WorkspaceProviderCalls } from "../src/memory/WorkspaceProviderCalls";
import { setTransport } from "../src/memory/client";
import "../src/quiet-runtime.css";
import "../src/memory/memory.css";

const fixture = document.getElementById("fixture")!;
const results = document.getElementById("results")!;
const calls: {command: string; args: Record<string, unknown>}[] = [];
const checks: {id: string; ok: boolean}[] = [];
let releaseList: () => void = () => {};
let holdList = true;
let failList = false;
let failCancel = true;
let cancelRequested = false;
let cancelReads = 0;
let state = "running";
let empty = false;
const operation = () => ({operationId: "synthetic-workspace-operation", kind: "external_send", state, cancelRequested, progress: {done: 0, total: null}, result: null});
setTransport(async (native, args) => {
  if (native !== "memory_call") throw new Error(`Unexpected native command ${native}`);
  const r = args.request as {command: string; arguments: Record<string, unknown>};
  calls.push({command: r.command, args: r.arguments});
  let result: unknown;
  if (r.command === "operation_list") {
    if (holdList) {holdList = false; await new Promise<void>(resolve => {releaseList = resolve;});}
    if (failList) return {kind: "memory_error", error: {code:"storage_failed", retryable:false, rules:[]}};
    result = {items: empty ? [] : [operation(), {operationId:"synthetic-backup", kind:"backup_export", state:"running", cancelRequested:false, progress:{done:0,total:null}}]};
  } else if (r.command === "operation_get") {
    if (r.arguments.operationId !== "synthetic-workspace-operation") throw new Error("Wrong operation read");
    if (cancelRequested && ++cancelReads >= 2) state = "cancelled";
    result = operation();
  } else if (r.command === "operation_cancel") {
    if (failCancel) return {kind:"memory_error", error:{code:"storage_failed",retryable:false,rules:[]}};
    cancelRequested = true; result = operation();
  } else throw new Error(`Unexpected Core command ${r.command}`);
  return {kind:"memory_page",result,error:null};
});
const root = createRoot(fixture);
const render = (excludeOperationId: string | null = null) => root.render(<WorkspaceProviderCalls excludeOperationId={excludeOperationId} />);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function wait(predicate: () => boolean) {
  for (let n=0;n<250;n++) {if(predicate()) return; await sleep(20);}
  throw new Error(`UI wait timed out: ${fixture.textContent}`);
}
const text = () => fixture.textContent ?? "";
const button = (label: string) => [...fixture.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === label);
function click(label: string) {const b=button(label);if(!b||b.disabled) throw new Error(`Unavailable: ${label}`);b.click();}
function check(id: string, ok: boolean) {checks.push({id,ok});if(!ok) throw new Error(id);}
try {
  render();
  await wait(() => text().includes("Reading workspace calls"));
  check("pending_list_is_not_empty", !text().includes("No model calls"));
  releaseList();
  await wait(() => !!button("Stop locally"));
  check("core_list_restores_existing_call", text().includes("Operation synthetic"));
  check("other_operation_kinds_are_filtered", !text().includes("backup_export"));
  root.render(null);
  await sleep(20);
  const readsBeforeLeave = calls.filter(c => c.command === "operation_get").length;
  await sleep(450);
  check("unmount_stops_page_polling", calls.filter(c => c.command === "operation_get").length === readsBeforeLeave);
  render();
  await wait(() => !!button("Stop locally"));
  check("return_reobserves_existing_id", calls.filter(c => c.command === "operation_list").length >= 2);
  render("synthetic-workspace-operation");
  await wait(() => text().includes("shown in its inspector"));
  check("local_watcher_is_not_duplicated", !button("Stop locally"));
  render();
  await wait(() => !!button("Stop locally"));
  click("Stop locally");
  await wait(() => fixture.querySelector('[role="alert"]') != null);
  check("cancel_failure_does_not_claim_stop", !text().includes("recorded outcome") && !text().includes("Local stop requested"));
  failCancel = false;
  click("Stop locally");
  await wait(() => !!button("Local stop requested"));
  check("cancel_ack_waits_for_completion", button("Local stop requested")!.disabled);
  await wait(() => text().includes("recorded outcome") && button("Refresh workspace calls")?.disabled === false);
  check("returned_call_terminal_is_observed", text().includes("cancelled"));
  check("cancel_uses_listed_core_id", calls.filter(c => c.command === "operation_cancel").every(c => c.args.operationId === "synthetic-workspace-operation"));
  failList = true;
  click("Refresh workspace calls");
  await wait(() => text().includes("earlier observation"));
  check("list_failure_retains_observation", text().includes("cancelled") && !text().includes("No model calls"));
  failList = false; empty = true;
  click("Refresh workspace calls");
  await wait(() => text().includes("No model calls"));
  check("empty_requires_successful_list", !text().includes("Operation synthetic"));
  check("no_request_or_body_replay", calls.every(c => ["operation_list","operation_get","operation_cancel"].includes(c.command)));
} catch(error) {checks.push({id:String(error),ok:false});}
finally {releaseList();root.unmount();results.textContent=JSON.stringify({checks,passed:checks.every(c=>c.ok),calls:calls.map(c=>c.command)},null,2);}
