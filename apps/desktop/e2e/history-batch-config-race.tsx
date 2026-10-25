// Pending receipts must not regain authority after configuration A -> B -> A.
// Actual request component; all status, preparation and send ports are fake.
import { createRoot } from "react-dom/client";
import { HistoryBatchPanel } from "../src/memory/HistoryBatchPanel";
import { HistoryBatchOwner } from "../src/memory/historyBatch";
import { call, setTransport, type J } from "../src/memory/client";
import { historyTask } from "../tests/history-task-fixture";

const fixture = document.getElementById("fixture")!, root = createRoot(fixture);
const checks: { id: string; ok: boolean }[] = [], calls: { command: string; key: string }[] = [];
const task = historyTask(), owner = new HistoryBatchOwner();
owner.setDraft("synthetic-vault", task.taskId, 1, { policy: "synthetic-grant", output: "256" });
let model = "synthetic-model", failStatus = false, holdStatus = false, holdPrepare = false;
let statusCount = 0, preparationCount = 0, lastObservedModel = "", exchanges = 0;
let release: (() => void) | null = null;
const releasePending = () => { const next = release; release = null; next?.(); };
const status = () => ({ configured: true, destinations: [{ api: "openai", model, maxOutputTokens: 4096 }], grants: [{
  policyId: "synthetic-grant", active: true, maxSensitivity: "private", purposes: ["extraction"], destinations: [{ provider: "openai", model }],
}] });
setTransport(async (native, envelope) => {
  if (native !== "memory_call") throw new Error(`Unexpected native ${native}`);
  const r = envelope.request as J; calls.push({ command: r.command, key: r.idempotencyKey });
  let result: J;
  switch (r.command) {
    case "provider_status": {
      const snapshot = status(); statusCount++;
      if (failStatus) { failStatus = false; throw new Error("Synthetic unavailable status"); }
      if (holdStatus) { holdStatus = false; await new Promise<void>(resolve => { release = resolve; }); }
      else lastObservedModel = model;
      result = snapshot; break;
    }
    case "history_batch_prepare":
      result = { ...r.arguments, sessionId: "synthetic-child-1", runId: "synthetic-run-1", inputEventId: "synthetic-input-1",
        api: "openai", model: "synthetic-model", dispatchId: "synthetic-dispatch", callId: `synthetic-race-call-${++preparationCount}`,
        endpoint: "https://example.invalid/synthetic", body: `SYNTHETIC RACE BODY ${preparationCount}`, wireHash: "a".repeat(64),
        estimatedInputTokens: 50, expiresInMs: 60000, streaming: false };
      if (holdPrepare) { holdPrepare = false; await new Promise<void>(resolve => { release = resolve; }); }
      break;
    case "history_task_get": result = task; break;
    case "external_send": exchanges++; result = { operationId: "synthetic-race-send", kind: "external_send" }; break;
    case "operation_get": result = { operationId: "synthetic-race-send", kind: "external_send", state: "succeeded", cancelRequested: false,
      progress: { done: 1, total: 1 }, result: {} }; break;
    default: throw new Error(`Unexpected command ${r.command}`);
  }
  return { kind: "synthetic", result };
});
const text = () => fixture.textContent ?? "";
const button = (label: string) => [...fixture.querySelectorAll<HTMLButtonElement>("button")].find(el => el.textContent === label);
const prepare = "Prepare or recover this batch request", send = "Send this batch once";
const sleep = () => new Promise(resolve => setTimeout(resolve, 20));
async function wait(test: () => boolean) { for (let n = 0; n < 260; n++) { if (test()) return; await sleep(); } throw new Error(`Timeout ${text()}`); }
function click(label: string) { const el = button(label); if (!el || el.disabled) throw new Error(`Unavailable ${label}: ${text()}`); el.click(); }
function check(id: string, ok: boolean) { checks.push({ id, ok }); }
async function observeModel(next: string) {
  const count = statusCount; model = next;
  await wait(() => statusCount > count && lastObservedModel === next);
  await wait(() => next === "synthetic-model" ? !text().includes("Restore the saved task") : text().includes("Restore the saved task"));
}
async function withdrawIfShown() {
  if (button("Withdraw batch request")) { click("Withdraw batch request"); await wait(() => !!button(prepare) && !button(prepare)!.disabled); }
}
try {
  root.render(<HistoryBatchPanel vaultId="synthetic-vault" task={task} index={1} owner={owner} request={call} />);
  await wait(() => !!button(prepare) && !button(prepare)!.disabled);
  holdPrepare = true; click(prepare); await wait(() => release !== null);
  await observeModel("changed-model"); await observeModel("synthetic-model");
  releasePending(); await wait(() => !text().includes("Waiting for the batch request receipt"));
  check("configuration_a_b_a_never_restores_pending_preparation_authority", !text().includes("SYNTHETIC RACE BODY") && !button(send));
  await withdrawIfShown();

  holdPrepare = true; click(prepare); await wait(() => release !== null);
  const beforeFailure = statusCount; failStatus = true;
  await wait(() => statusCount > beforeFailure && text().includes("Provider status is unavailable"));
  const beforeRecovery = statusCount;
  await wait(() => statusCount > beforeRecovery && !text().includes("Provider status is unavailable"));
  releasePending(); await wait(() => !text().includes("Waiting for the batch request receipt"));
  check("status_failure_and_recovery_never_restore_old_preparation_authority", !text().includes("SYNTHETIC RACE BODY") && !button(send));
  await withdrawIfShown();

  click(prepare); await wait(() => !!button(send));
  fixture.querySelector<HTMLInputElement>('[aria-label="Exact history request"] input')!.click();
  await wait(() => !button(send)!.disabled);
  holdStatus = true; click(send); await wait(() => release !== null);
  await observeModel("changed-model"); await observeModel("synthetic-model");
  releasePending(); await wait(() => !text().includes("Waiting for the batch request receipt"));
  check("configuration_a_b_a_cancels_old_send_preflight_without_exchange", exchanges === 0 && !button(send));
  check("no_task_creation_or_candidate_writes_during_races", !calls.some(c => ["history_materialize", "extraction_prepare", "extraction_apply", "review_confirm"].includes(c.command)));
  document.getElementById("results")!.textContent = JSON.stringify({ fixture: "history-batch-config-race", passed: checks.every(c => c.ok), checks });
} finally { releasePending(); root.unmount(); }
