// Pause/resume receipt timing is simulated; the model is never called.
import { createRoot } from "react-dom/client";
import { ExtractionPanel } from "../src/memory/ExtractionPanel";
import { setTransport } from "../src/memory/client";
import "../src/quiet-runtime.css";
import "../src/memory/memory.css";

const fixture = document.getElementById("fixture")!;
const checks: { id: string; ok: boolean }[] = [];
const calls: { command: string; args: Record<string, unknown> }[] = [];
let paused = true;
let completed = false;
let lostReceipt = false;
let releaseResume: (() => void) | null = null;
const releasePending = () => releaseResume?.();
let closed = 0;
let busy = false;
const reportBusy = (value: boolean) => { busy = value; };
const job = () => ({ run_id: "synthetic-run", state: completed ? "completed" : paused ? "paused" : "ready", cursor: completed ? 1 : 0 });
setTransport(async (native, args) => {
  if (native !== "memory_call") throw new Error(`Unexpected native command ${native}`);
  const r = args.request as { command: string; arguments: Record<string, unknown> };
  calls.push({ command: r.command, args: r.arguments });
  let result: unknown;
  switch (r.command) {
    case "provider_status": result = { configured: true, destinations: [{ api: "openai", model: "synthetic-model" }], grants: [{ active: true, policyId: "synthetic-policy", purposes: ["extraction"], destinations: [{ provider: "openai", model: "synthetic-model" }] }] }; break;
    case "extraction_prepare": result = { callId: "synthetic-call", wireHash: "synthetic-hash", sessionId: "synthetic-session", runId: "synthetic-run", model: "synthetic-model", endpoint: "Synthetic endpoint (unused)", body: "Synthetic exact request" }; break;
    case "external_send": result = { operationId: "synthetic-operation", kind: "external_send" }; break;
    case "operation_get": result = { operationId: "synthetic-operation", kind: "external_send", state: "succeeded", cancelRequested: false, progress: { done: 1, total: 1 }, result: { finish: "completed" } }; break;
    case "extraction_preview": result = { job: job(), items: [{ responseIndex: 0, proposedType: "fact", content: "Saved synthetic proposal", quote: "Synthetic quote", selectedText: "Synthetic source", candidate: completed ? { candidateId: "candidate-one", revision: 1, status: "pending", content: "Saved synthetic proposal" } : null }] }; break;
    case "extraction_pause":
      if (r.arguments.paused !== false || r.arguments.sessionId !== "synthetic-session" || r.arguments.runId !== "synthetic-run") throw new Error("Wrong resume owner");
      await new Promise<void>(resolve => { releaseResume = resolve; }); paused = false;
      if (!lostReceipt) { lostReceipt = true; return { kind: "memory_error", error: { code: "storage_failed", retryable: true, rules: [] } }; }
      result = { job: job() }; break;
    case "extraction_apply":
      if (paused) throw new Error("Paused queue must be resumed first");
      completed = true; result = { job: job() }; break;
    default: throw new Error(`Unexpected command ${r.command}`);
  }
  return { kind: "memory_page", result, error: null };
});
let root = createRoot(fixture);
const render = () => root.render(<ExtractionPanel range={{ sourceId: "synthetic-source", revision: 1, start: 0, end: 20 }} onClose={() => { closed++; }} onBusyChange={reportBusy} />);
const text = () => fixture.textContent ?? "";
const button = (label: string) => [...fixture.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === label);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function wait(p: () => boolean) { for (let n = 0; n < 250; n++) { if (p()) return; await sleep(20); } throw new Error(`UI wait timed out: ${text()}`); }
function check(id: string, ok: boolean) { checks.push({ id, ok }); if (!ok) throw new Error(id); }
function click(label: string) { const b = button(label); if (!b || b.disabled) throw new Error(`Unavailable ${label}`); b.click(); }
async function prepare() {
  render(); await wait(() => !!button("Prepare the request…")); click("Prepare the request…");
  await wait(() => !!button("Send once")); click("Send once"); await wait(() => text().includes("Saved synthetic proposal"));
}
try {
  await prepare();
  check("source_flow_exposes_saved_recovery_ids", !!fixture.querySelector('p[title="synthetic-session · synthetic-run"]') && text().includes("read this saved run from Sessions"));
  check("paused_source_job_offers_resume_without_apply", !!button("Resume local queue") && !button("Add to the review queue"));
  click("Resume local queue"); await wait(() => releaseResume != null); await sleep(50);
  check("resume_holds_source_choice_and_close", busy && button("Close")!.disabled && fixture.querySelector<HTMLSelectElement>("select")!.disabled);
  releasePending(); await wait(() => !!fixture.querySelector('[role="alert"]'));
  check("ambiguous_resume_requires_observation", !button("Retry") && button("Resume local queue")?.disabled === true && text().includes("Previous suggestion observation"));
  click("Refresh saved suggestions"); await wait(() => !!button("Add to the review queue"));
  check("read_recovers_resume_without_replay", calls.filter(c => c.command === "extraction_pause").length === 1 && !button("Resume local queue"));
  check("resume_does_not_apply_automatically", !calls.some(c => c.command === "extraction_apply"));
  click("Add to the review queue"); await wait(() => text().includes("pending candidate"));
  check("separate_gesture_applies_local_queue", calls.filter(c => c.command === "extraction_apply").length === 1 && !button("Add to the review queue"));
  click("Close"); check("settled_flow_can_close", closed === 1);

  root.unmount(); root = createRoot(fixture); paused = true; completed = false; releaseResume = null;
  await prepare(); click("Resume local queue"); await wait(() => releaseResume != null); await sleep(50);
  const beforeUnmount = calls.length; root.unmount(); releasePending(); await sleep(80);
  check("unmounted_resume_starts_no_result_read", calls.length === beforeUnmount);
  check("no_model_replay_or_review_approval", calls.filter(c => c.command === "external_send").length === 2 && !calls.some(c => c.command === "review_confirm"));
} catch (error) { checks.push({ id: String(error), ok: false }); }
finally { releasePending(); root.unmount(); document.getElementById("results")!.textContent = JSON.stringify({ checks, passed: checks.every(c => c.ok), calls }, null, 2); }
