// Same owned-action focus rules as Import, with synthetic IPC only.
import { createRoot } from "react-dom/client";
import { HistoryBatchPanel } from "../src/memory/HistoryBatchPanel";
import { HistoryBatchOwner } from "../src/memory/historyBatch";
import { call, setTransport, type J } from "../src/memory/client";
import { historyTask } from "../tests/history-task-fixture";

const fixture = document.getElementById("fixture")!, root = createRoot(fixture), outside = document.createElement("input");
document.body.appendChild(outside);
const checks: { id: string; ok: boolean }[] = [], task = historyTask(), owner = new HistoryBatchOwner();
owner.setDraft("synthetic-vault", task.taskId, 1, { policy: "synthetic-grant", output: "1024" });
let hold = false, release: (() => void) | null = null, preparations = 0, sends = 0;
const releasePending = () => { const next = release; release = null; next?.(); };
setTransport(async (native, envelope) => {
  if (native !== "memory_call") throw new Error(native);
  const r = envelope.request as J;
  if (r.command === "provider_status") return { kind: "synthetic", result: { configured: true,
    destinations: [{ api: "openai", model: "synthetic-model", maxOutputTokens: 512 }], grants: [{
      policyId: "synthetic-grant", active: true, purposes: ["extraction"], maxSensitivity: "private", destinations: [{ provider: "openai", model: "synthetic-model" }],
    }] } };
  if (r.command === "external_send") { sends++; throw new Error("Focus cannot send"); }
  if (r.command !== "history_batch_prepare") throw new Error(`Unexpected ${r.command}`);
  const result = { ...r.arguments, callId: `synthetic-focus-${++preparations}`, sessionId: "synthetic-child-1", runId: "synthetic-run-1", inputEventId: "synthetic-input-1",
    dispatchId: "synthetic-dispatch", api: "openai", model: "synthetic-model", endpoint: "https://example.invalid/synthetic", body: "SYNTHETIC FOCUS BODY",
    wireHash: "a".repeat(64), estimatedInputTokens: 50, expiresInMs: 60000, streaming: false };
  if (hold) { hold = false; await new Promise<void>(resolve => { release = resolve; }); }
  return { kind: "synthetic", result };
});
const text = () => fixture.textContent ?? "", sleep = () => new Promise(resolve => setTimeout(resolve, 20));
const button = (label: string) => [...fixture.querySelectorAll<HTMLButtonElement>("button")].find(el => el.textContent === label);
const prepare = "Prepare or recover this batch request", body = () => fixture.querySelector<HTMLPreElement>('[aria-label="Exact history request"] pre');
async function wait(test: () => boolean) { for (let n = 0; n < 250; n++) { if (test()) return; await sleep(); } throw new Error(`Timeout ${text()}`); }
async function focusSettled(test: () => boolean) { for (let n = 0; n < 15; n++) { if (test()) return true; await sleep(); } return false; }
function check(id: string, ok: boolean) { checks.push({ id, ok }); }
async function begin() {
  const b = button(prepare)!; if (b.disabled) throw new Error("Preparation unavailable");
  hold = true; b.focus(); b.click(); await wait(() => release !== null);
  // Happy DOM keeps focus on disabled controls; native WebView2 blurs them.
  if ((document.activeElement as HTMLButtonElement)?.disabled) {
    const standIn = document.createElement("span"); standIn.tabIndex = -1; document.body.appendChild(standIn); standIn.focus(); standIn.remove();
  }
}
async function finish() { releasePending(); await wait(() => !!body() && !text().includes("Waiting for the batch request receipt")); }
async function withdraw() { const b = button("Withdraw batch request")!; b.focus(); b.click(); await wait(() => !!button(prepare)); }
try {
  root.render(<HistoryBatchPanel vaultId="synthetic-vault" task={task} index={1} owner={owner} request={call} />);
  await wait(() => !!fixture.querySelector('select option[value="synthetic-grant"]'));
  const output = fixture.querySelector<HTMLInputElement>('input[inputmode="numeric"]')!;
  check("configured_output_limit_has_accessible_invalid_explanation", output.getAttribute("aria-invalid")==="true"
    && !!output.getAttribute("aria-describedby") && !!document.getElementById(output.getAttribute("aria-describedby")!)?.textContent?.includes("512") && preparations===0 && !!button(prepare)?.disabled);
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(output,"256"); output.dispatchEvent(new Event("input",{bubbles:true}));
  await wait(() => !button(prepare)!.disabled);
  await begin(); await finish();
  check("preparation_continues_at_readable_exact_body_when_focus_was_lost", await focusSettled(() => document.activeElement===body()));
  check("request_body_has_accessible_reading_name", !!body()?.getAttribute("aria-label"));
  check("focus_handoff_does_not_check_or_send", !fixture.querySelector<HTMLInputElement>('[aria-label="Exact history request"] input')!.checked && button("Send this batch once")!.disabled && sends===0);
  await withdraw();
  check("withdrawal_returns_to_original_preparation_control", await focusSettled(() => document.activeElement===button(prepare)));
  await begin(); outside.focus(); await finish();
  check("preparation_respects_focus_moved_elsewhere", document.activeElement===outside);
  check("all_preparations_keep_same_original_parameters", preparations===2 && owner.draft("synthetic-vault",task.taskId,1).output==="256");
  check("focus_flow_has_no_external_send", sends===0);
  document.getElementById("results")!.textContent=JSON.stringify({ fixture:"history-batch-focus", passed:checks.every(c=>c.ok), checks });
} finally { releasePending(); root.unmount(); outside.remove(); }
