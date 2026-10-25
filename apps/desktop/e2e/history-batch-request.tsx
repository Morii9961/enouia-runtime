// Actual saved-task owner and request component; all IPC/Provider ports are fake.
import { createRoot } from "react-dom/client";
import { HistoryTasks, useHistoryTasks } from "../src/memory/HistoryTaskPanel";
import { call, setTransport, type J } from "../src/memory/client";
import { historyTask } from "../tests/history-task-fixture";

const fixture = document.getElementById("fixture")!, root = createRoot(fixture), checks: { id: string; ok: boolean }[] = [];
const calls: { command: string; args: J; key: string }[] = [];
let panelVisible = true;
let vaultId = "synthetic-vault", head = "original", visible = true, instance = 0, hold = false, failPrepare = false, failSend = false;
let release: (() => void) | null = null, handle = 0, ttl = 60000, wrongChild = false, refusal: string | null = null;
let invocation: string | null = null, model = "synthetic-model", exchange = 0;
let rejectHandle = false;
const sentKeys = new Set<string>();
const releasePending = () => { const next = release; release = null; next?.(); };
const task = () => { const next = historyTask(); next.identity.vaultId = vaultId; next.identity.commitId = head; next.batches[0].invocationState = invocation; return next; };
const status = () => ({ configured: true, destinations: [{ api: "openai", model, maxOutputTokens: 4096 }], grants: [{ policyId: "synthetic-grant", active: true,
  purposes: ["extraction"], maxSensitivity: "private", destinations: [{ provider: "openai", model }] }] });
setTransport(async (native, envelope) => {
  if (native !== "memory_call") throw new Error(`Unexpected native ${native}`);
  const r = envelope.request as J; calls.push({ command: r.command, args: structuredClone(r.arguments), key: r.idempotencyKey });
  let result: J;
  switch (r.command) {
    case "history_task_list": result = { identity: { vaultId, commitId: head }, items: [task()], nextCursor: null, readOnly: true }; break;
    case "operation_list": result = { items: [] }; break;
    case "history_task_get": result = task(); break;
    case "provider_status": result = status(); break;
    case "history_batch_prepare": {
      if (refusal) return { kind: "memory_error", error: { code: "revision_conflict", retryable: false, rules: [refusal] } };
      const index = r.arguments.batchIndex;
      result = { ...r.arguments, callId: `synthetic-call-${++handle}`, sessionId: `synthetic-child-${index}`, runId: `synthetic-run-${index}`, inputEventId: `synthetic-input-${index}`,
        dispatchId: "synthetic-dispatch", api: "openai", model: "synthetic-model", endpoint: "https://example.invalid/synthetic", body: `SYNTHETIC BODY ${handle}`,
        wireHash: "a".repeat(64), outputTokens: r.arguments.outputTokens, estimatedInputTokens: 50, expiresInMs: ttl, streaming: false };
      if (wrongChild) result.runId = "wrong-run";
      if (hold) { hold = false; await new Promise<void>(resolve => { release = resolve; }); }
      if (failPrepare) { failPrepare = false; throw new Error("Synthetic lost receipt"); }
      break;
    }
    case "external_send":
      if (rejectHandle) { rejectHandle = false; return { kind: "memory_error", error: { code: "not_found", retryable: false, rules: ["provider.call_unknown"] } }; }
      if (!sentKeys.has(r.idempotencyKey)) { sentKeys.add(r.idempotencyKey); exchange++; }
      if (failSend) { failSend = false; throw new Error("Synthetic lost send receipt"); }
      invocation = "completed"; result = { operationId: "synthetic-send-op", kind: "external_send" }; break;
    case "operation_get": result = { operationId: "synthetic-send-op", kind: "external_send", state: "succeeded", cancelRequested: false,
      progress: { done: 1, total: 1 }, result: {} }; break;
    default: throw new Error(`Unexpected ${r.command}`);
  }
  return { kind: "synthetic", result };
});
function Harness() { const tasks = useHistoryTasks(vaultId); return <div data-head={head} data-owner={`${vaultId}:${instance}`}>{panelVisible && <HistoryTasks tasks={tasks} />}</div>; }
const render = () => root.render(visible ? <Harness key={`${vaultId}:${instance}`} /> : null);
const text = () => fixture.textContent ?? "", sleep = () => new Promise(resolve => setTimeout(resolve, 20));
const button = (label: string) => [...fixture.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === label);
function click(label: string) { const b = button(label); if (!b || b.disabled) throw new Error(`Unavailable ${label}: ${text()}`); b.click(); }
async function wait(test: () => boolean) { for (let n = 0; n < 300; n++) { if (test()) return; await sleep(); } throw new Error(`Timeout ${text()}`); }
function check(id: string, ok: boolean) { checks.push({ id, ok }); if (!ok) throw new Error(id); }
function input(control: HTMLInputElement | HTMLSelectElement, value: string) {
  const proto = control instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(control, value);
  control.dispatchEvent(new Event(control instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
}
const prepares = () => calls.filter(c => c.command === "history_batch_prepare"), sends = () => calls.filter(c => c.command === "external_send");
const prepareLabel = "Prepare or recover this batch request";
async function choose(index = 2) {
  await wait(() => fixture.firstElementChild?.getAttribute("data-owner") === `${vaultId}:${instance}`);
  await wait(() => !!button("Read task synthetic-history-task")); click("Read task synthetic-history-task");
  await wait(() => !!button(`Inspect batch ${index} request`)); click(`Inspect batch ${index} request`);
  await wait(() => !!fixture.querySelector('select option[value="synthetic-grant"]'));
  input(fixture.querySelector("select")!, "synthetic-grant"); await wait(() => !!button(prepareLabel) && !button(prepareLabel)!.disabled);
}
async function prepare() { click(prepareLabel); await wait(() => !!fixture.querySelector('[aria-label="Exact history request"]')); }
const inspect = () => fixture.querySelector<HTMLInputElement>('[aria-label="Exact history request"] input')!.click();
try {
  render(); await choose();
  check("selection_does_not_prepare_or_send", prepares().length === 0 && sends().length === 0);
  hold = true; click(prepareLabel); await wait(() => release !== null); button(prepareLabel)!.click();
  head = "context-commit"; render(); await sleep(); releasePending(); await wait(() => !!button("Send this batch once"));
  check("head_commit_retains_one_preparation_original_batch_and_exact_body", prepares().length === 1 && prepares()[0].args.batchIndex === 1 && text().includes("SYNTHETIC BODY 1"));
  check("inspection_displays_destination_model_handle_hash_and_output", text().includes("example.invalid/synthetic") && text().includes("synthetic-model") && text().includes("synthetic-call-1") && text().includes("a".repeat(64)) && text().includes("1024 output tokens"));
  check("send_requires_separate_exact_inspection", button("Send this batch once")!.disabled && sends().length === 0);
  click("Withdraw batch request"); await wait(() => !!button(prepareLabel) && !button(prepareLabel)!.disabled); failPrepare = true; click(prepareLabel); await wait(() => text().includes("Preparation is not confirmed"));
  const original = prepares().at(-1)!;
  click("Read this history task again"); await sleep(); await wait(() => !!button(prepareLabel) && !button(prepareLabel)!.disabled);
  await prepare();
  check("uncertain_receipt_and_task_reread_reuse_exact_key_and_args", prepares().at(-1)!.key === original.key && JSON.stringify(prepares().at(-1)!.args) === JSON.stringify(original.args));
  check("recovered_handle_requires_new_inspection", button("Send this batch once")!.disabled && text().includes("synthetic-call-3"));
  click("Withdraw batch request"); await wait(() => !!button(prepareLabel) && !button(prepareLabel)!.disabled);
  input(fixture.querySelector('input[inputmode="numeric"]')!, "512"); await sleep(); await prepare();
  check("changed_output_uses_another_key", prepares().at(-1)!.key !== original.key && prepares().at(-1)!.args.outputTokens === 512);
  const changedKey = prepares().at(-1)!.key;
  panelVisible = false; render(); await wait(() => !text().includes("Saved history tasks"));
  panelVisible = true; render(); await wait(() => !!button(prepareLabel) && !button(prepareLabel)!.disabled);
  check("component_remount_retains_original_selection_and_parameters_but_withdraws_handle", fixture.querySelector<HTMLInputElement>('input[inputmode="numeric"]')!.value === "512" && !text().includes("SYNTHETIC BODY"));
  await prepare(); check("component_remount_recovers_original_key_with_fresh_inspection", prepares().at(-1)!.key === changedKey && button("Send this batch once")!.disabled);
  click("Withdraw batch request"); await wait(() => !!button(prepareLabel) && !button(prepareLabel)!.disabled); hold = true; click(prepareLabel); await wait(() => release !== null);
  click("Inspect batch 1 request"); await sleep(); releasePending(); await sleep(); await sleep();
  check("late_batch_reply_cannot_publish_to_new_selection", !text().includes("SYNTHETIC BODY") && text().includes("Batch 1 request"));
  input(fixture.querySelector("select")!, "synthetic-grant");
  await wait(() => !button(prepareLabel)!.disabled); wrongChild = true; click(prepareLabel); await wait(() => text().includes("Preparation is not confirmed"));
  check("mixed_child_identity_withholds_body_and_send", !button("Send this batch once") && !text().includes("SYNTHETIC BODY"));
  wrongChild = false; ttl = 80; click(prepareLabel); await wait(() => text().includes("handle expired"));
  check("expired_handle_is_withdrawn_without_send", !button("Send this batch once") && sends().length === 0); ttl = 60000;
  await prepare(); model = "different-model";
  await wait(() => text().includes("settings or grants changed"));
  check("provider_drift_withdraws_old_body_and_handle", !button("Send this batch once") && !text().includes("SYNTHETIC BODY"));
  model = "synthetic-model"; await wait(() => !button(prepareLabel)!.disabled);
  await prepare(); inspect(); await wait(() => !button("Send this batch once")!.disabled);
  rejectHandle = true; click("Send this batch once"); await wait(() => text().includes("refused the unavailable request handle"));
  check("invalid_handle_withdraws_body_and_requires_saved_task_reread", !button("Send this batch once") && button(prepareLabel)!.disabled && exchange === 0);
  const handleKey = prepares().at(-1)!.key;
  click("Read this history task again"); await sleep(); await wait(() => !!button(prepareLabel) && !button(prepareLabel)!.disabled);
  await prepare(); check("definite_presend_handle_refusal_recovers_original_preparation_key", prepares().at(-1)!.key === handleKey && button("Send this batch once")!.disabled);
  inspect(); await wait(() => !button("Send this batch once")!.disabled);
  failSend = true; click("Send this batch once"); await wait(() => !!button("Recover this batch call"));
  click("Recover this batch call"); await wait(() => text().includes("Suggestions, queueing and human review are separate"));
  check("lost_send_receipt_recovers_same_handle_hash_key_one_fake_exchange", sends().length === 3 && sends()[1].key === sends()[2].key && JSON.stringify(sends()[1].args) === JSON.stringify(sends()[2].args) && exchange === 1);
  click("Inspect batch 2 request"); await wait(() => text().includes("Batch 2 request"));
  for (const state of ["completed", "failed", "cancelled", "outcome_unknown", "length"]) {
    invocation = state; click("Read this history task again"); await sleep(); await wait(() => text().includes(`invocation ${state}`));
    check(`${state}_invocation_cannot_reprepare`, !!button(prepareLabel)?.disabled && !button("Send this batch once"));
  }
  invocation = null; instance++; render(); await choose();
  check("reopened_owner_has_no_old_body_or_confirmation", !text().includes("SYNTHETIC BODY") && !button("Send this batch once"));
  for (const [rule, expected] of [["history.model_changed", "configured model differs"], ["history.batch_not_ready", "paused or completed"],
    ["history.source_read", "does not allow reading"], ["history.batch_missing", "Explicitly resume"], ["history.batch_not_selected", "not selected"]]) {
    refusal = rule; click(prepareLabel); await wait(() => text().includes(expected));
    check(`${rule}_refusal_offers_saved_state_recovery_without_send`, !button("Send this batch once") && text().includes("Read the saved task"));
    click("Read this history task again"); await sleep(); await wait(() => !!button(prepareLabel) && !button(prepareLabel)!.disabled);
  }
  refusal = null; hold = true; click(prepareLabel); await wait(() => release !== null);
  const reopenKey = prepares().at(-1)!.key;
  visible = false; render(); await wait(() => !fixture.firstElementChild); releasePending(); await sleep(); visible = true; instance++; render(); await choose();
  check("lock_or_unmount_discards_late_receipt_and_handle", !text().includes("SYNTHETIC BODY"));
  await prepare(); check("lock_reopen_recovery_retains_original_key_and_requires_inspection", prepares().at(-1)!.key === reopenKey && button("Send this batch once")!.disabled);
  click("Withdraw batch request"); await wait(() => !!button(prepareLabel) && !button(prepareLabel)!.disabled);
  hold = true; click(prepareLabel); await wait(() => release !== null); vaultId = "other-vault"; render(); await sleep(); releasePending(); await sleep();
  check("vault_switch_withdraws_old_handle_and_late_body", !text().includes("SYNTHETIC BODY") && !button("Send this batch once"));
  check("flow_never_creates_another_job_applies_or_approves", !calls.some(c => ["extraction_prepare", "history_materialize", "extraction_apply", "review_confirm"].includes(c.command)));
  document.getElementById("results")!.textContent = JSON.stringify({ fixture: "history-batch-request", passed: checks.every(c => c.ok), checks });
} finally { releasePending(); root.unmount(); }
