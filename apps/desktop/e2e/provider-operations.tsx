// Browser-mounted Runtime controls, synthetic IPC only. No app config,
// Vault, Credential Manager or network Provider transport is used.
import { createRoot } from "react-dom/client";
import { ExternalPanel } from "../src/memory/ExternalPanel";
import { ExtractionPanel } from "../src/memory/ExtractionPanel";
import { setTransport } from "../src/memory/client";
import "../src/quiet-runtime.css";
import "../src/memory/memory.css";

const calls: { command: string; args: Record<string, unknown> }[] = [];
const checks: { id: string; ok: boolean }[] = [];
const results = document.getElementById("results")!;
const fixture = document.getElementById("fixture")!;
const query = new URLSearchParams(location.search);
const preview = query.has("preview");
let scenario = "cancel";
let operationState = "queued";
let cancelled = false;
let cancellationReads = 0;
let failPreview = true;
let changed = 0;
let closed = false;
const setup = {
  configured: true,
  destinations: [{ api: "openai", model: "synthetic-model", maxOutputTokens: 4096, streaming: "unsupported" }],
  grants: [{ active: true, policyId: "synthetic-policy", maxSensitivity: "private", purposes: ["extraction"], destinations: [{provider: "openai", model: "synthetic-model"}] }],
};
const prepared = {
  callId: "synthetic-call", wireHash: "synthetic-wire", endpoint: "synthetic endpoint (not used)",
  model: "synthetic-model", estimatedInputTokens: 15, outputTokens: 128,
  body: "Synthetic exact request body", sessionId: "synthetic-session", runId: "synthetic-extraction",
};
setTransport(async (command, args) => {
  if (command === "memory_provider_setup") return {state: "ready"};
  if (command !== "memory_call") throw new Error(`Unexpected native command ${command}`);
  const r = args.request as {command: string; arguments: Record<string, unknown>};
  calls.push({command: r.command, args: r.arguments});
  const reply = (result: unknown) => ({kind: "memory_page", result, error: null});
  switch (r.command) {
    case "provider_status": return reply(setup);
    case "external_prepare": case "extraction_prepare": return reply(prepared);
    case "external_send": operationState = "queued"; return reply({operationId: "synthetic-operation"});
    case "operation_cancel": cancelled = true; return reply({operationId:"synthetic-operation",kind:"external_send",state:"running",cancelRequested:true,progress:{done:0,total:null}});
    case "operation_get": {
      if (scenario === "cancel" && cancelled && ++cancellationReads >= 2) operationState = "cancelled";
      if (scenario === "failed") operationState = "failed";
      if (scenario === "completed") operationState = "succeeded";
      return reply({kind: "external_send", state: operationState, cancelRequested: cancelled, progress: {done: 0, total: null},
        result: scenario === "completed" ? {finish: "length"} : null,
        error: scenario === "failed" ? {code: "storage_failed", retryable: false, rules: []} : null});
    }
    case "extraction_preview":
      if (failPreview) return {kind: "memory_error", error: {code: "storage_failed", retryable: false, rules: []}};
      return reply({job: {state: "completed"}, items: [{responseIndex: 0, proposedType: "preference", content: "Synthetic suggestion", quote: "Synthetic quote", selectedText: "Synthetic source"}]});
    default: throw new Error(`Unexpected synthetic command ${r.command}`);
  }
});
let root = createRoot(fixture);
const renderExternal = () => root.render(<ExternalPanel branch={{sessionId: "synthetic-session", branchId: "synthetic-branch"}}
  text="Synthetic question" invocations={[]} consumeText={() => {}} onChanged={async () => { changed++; }} />);
const renderExtraction = () => root.render(<ExtractionPanel range={{sourceId: "synthetic-source", revision: 1, start: 0, end: 20}} onClose={() => {closed = true;}} />);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const text = () => fixture.textContent ?? "";
async function wait(condition: () => boolean) {
  for (let n = 0; n < 250; n++) { if (condition()) return; await sleep(20); }
  throw new Error(`UI wait timed out: ${text()}`);
}
function button(label: string) { return [...fixture.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === label); }
function click(label: string) { const b = button(label); if (!b || b.disabled) throw new Error(`Unavailable: ${label}`); b.click(); }
function check(id: string, ok: boolean) { checks.push({id, ok}); if (!ok) throw new Error(id); }
function reset(next: string) {
  root.unmount(); root = createRoot(fixture); scenario = next; cancelled = false; cancellationReads = 0; closed = false;
}
async function sendExternal() {
  renderExternal();
  await wait(() => button("Prepare the question for openai…")?.disabled === false);
  click("Prepare the question for openai…");
  await wait(() => button("Send once")?.disabled === false);
  click("Send once");
}
try {
  if (preview) {
    renderExternal();
    results.textContent = "Synthetic preview only.";
  } else {
    await sendExternal();
    await wait(() => !!button("Stop locally"));
    check("queued_send_can_stop_locally", text().includes("may have received"));
    click("Stop locally");
    await wait(() => !!button("Local stop requested"));
    check("stop_ack_waits_for_terminal", button("Local stop requested")!.disabled && !text().includes("recorded outcome"));
    await wait(() => text().includes("recorded outcome"));
    check("cancelled_outcome_retained", text().includes("cancelled") && !button("Stop locally"));
    check("terminal_refresh_once", changed === 2); // prepare, then completion
    check("cancel_targets_owned_operation", calls.some(c => c.command === "operation_cancel" && c.args.operationId === "synthetic-operation"));
    await sleep(450);
    check("no_automatic_send_retry", calls.filter(c => c.command === "external_send").length === 1);

    reset("completed");
    await sendExternal();
    await wait(() => text().includes("Reply saved"));
    check("output_limit_result_retained", text().includes("output limit"));

    reset("failed");
    renderExtraction();
    await wait(() => button("Prepare the request…")?.disabled === false);
    click("Prepare the request…");
    await wait(() => button("Send once")?.disabled === false);
    click("Send once");
    await wait(() => !!button("Read saved suggestions"));
    check("failed_extraction_has_outcome_and_close", text().includes("recorded outcome") && !!button("Close"));
    click("Read saved suggestions");
    await wait(() => fixture.querySelector('[role="alert"]') != null);
    check("failed_preview_keeps_local_recovery", !!button("Read saved suggestions") && !!button("Close"));
    failPreview = false;
    click("Read saved suggestions");
    await wait(() => text().includes("Synthetic suggestion"));
    check("preview_recovery_only_reads", calls.filter(c => c.command === "extraction_preview").length === 2);
    click("Close");
    check("failed_workflow_can_close", closed);
    check("no_automatic_apply", !calls.some(c => c.command === "extraction_apply"));
  }
} catch (error) { checks.push({id: String(error), ok: false}); }
finally {
  if (!preview) { root.unmount(); results.textContent = JSON.stringify({checks, passed: checks.every(c => c.ok), calls: calls.map(c => c.command)}, null, 2); }
}
