// Actual Sessions parent plus Provider panel; all IPC is synthetic.
import { createRoot } from "react-dom/client";
import { Sessions } from "../src/memory/SessionsSurface";
import { setTransport } from "../src/memory/client";
import "../src/quiet-runtime.css";
import "../src/memory/memory.css";

const fixture = document.getElementById("fixture")!;
const results = document.getElementById("results")!;
const calls: {command: string; args: Record<string, unknown>}[] = [];
const checks: {id: string; ok: boolean}[] = [];
let releasePrepare: () => void = () => {};
let releaseSend: () => void = () => {};
let finished = false;
let admitted = false;
let submitted = "";
let failDetail = false;
const setup = {configured: true, destinations: [{api: "openai", model: "synthetic-model", streaming: "unsupported", maxOutputTokens: 4096}],
  grants: [{active: true, policyId: "synthetic-policy", maxSensitivity: "private", destinations: [{provider: "openai", model: "synthetic-model"}]}]};
setTransport(async (command, args) => {
  if (command === "memory_provider_setup") return {state: "ready"};
  if (command !== "memory_call") throw new Error(`Unexpected native command: ${command}`);
  const r = args.request as {command: string; arguments: Record<string, unknown>};
  calls.push({command: r.command, args: r.arguments});
  if (r.command === "session_detail" && failDetail) return {kind: "memory_error", error: {code: "storage_failed", retryable: false, rules: []}};
  let result: unknown;
  switch (r.command) {
    case "operation_list": result = {items: admitted ? [{operationId:"synthetic-operation",kind:"external_send",state:finished ? "succeeded" : "running",progress:{done:0,total:null},result:finished ? {finish:"completed"} : null}] : []}; break;
    case "session_list": result = {items: ["one", "two"].map(n => ({sessionId: `session-${n}`, updatedAt: "2026-10-12T00:00:00.000Z", branches: [{branchId: `branch-${n}`, lastEventSeq: 1}]}))}; break;
    case "session_detail": result = {sessionId:r.arguments.sessionId,branchId:r.arguments.branchId,transcript: submitted && r.arguments.sessionId === "session-one" ? [{eventId: "synthetic-input", kind: "input", deliveryState: "saved", text: submitted}, ...(finished ? [{eventId:"synthetic-reply", kind:"response", deliveryState:"saved", text:"Saved synthetic reply"}] : [])] : [], checkpoints: [], turns: [], invocations: [], lastSavedEventId: null}; break;
    case "provider_status": result = setup; break;
    case "external_prepare":
      submitted = r.arguments.text as string;
      await new Promise<void>(resolve => {releasePrepare = resolve;});
      result = {callId: "synthetic-call", wireHash: "synthetic-wire", endpoint: "synthetic endpoint", model: "synthetic-model", body: submitted, estimatedInputTokens: 10, outputTokens: 128}; break;
    case "external_send":
      await new Promise<void>(resolve => {releaseSend = resolve;});
      admitted = true;
      result = {operationId: "synthetic-operation"}; break;
    case "operation_get": result = {kind: "external_send", state: finished ? "succeeded" : "running", progress: {done: 0, total: null}, result: finished ? {finish: "completed"} : null}; break;
    default: throw new Error(`Unexpected Core command: ${r.command}`);
  }
  return {kind: "memory_page", result, error: null};
});
const root = createRoot(fixture);
root.render(<Sessions inspect={() => {}} />);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function wait(condition: () => boolean) {
  for (let n = 0; n < 250; n++) {if (condition()) return; await sleep(20);}
  throw new Error(`UI wait timed out: ${fixture.textContent}`);
}
const rows = () => [...fixture.querySelectorAll<HTMLButtonElement>(".mem-session-row")];
const button = (label: string) => [...fixture.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === label);
function click(label: string) {const b = button(label); if (!b || b.disabled) throw new Error(`Unavailable: ${label}`); b.click();}
function check(id: string, ok: boolean) {checks.push({id, ok}); if (!ok) throw new Error(id);}
function question() {return fixture.querySelector<HTMLTextAreaElement>("#mem-ask")!;}
function transcriptTitle() {return fixture.querySelector('[aria-label="Session transcript"] h2')?.textContent;}
function inspectorText() {return fixture.querySelector('[aria-label="Session inspector"]')?.textContent ?? "";}
function edit(text: string) {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(question(), text);
  question().dispatchEvent(new Event("input", {bubbles: true}));
}
try {
  await wait(() => rows().length === 2);
  rows()[0].click();
  await wait(() => !!question() && !question().disabled);
  edit("Submitted first question");
  await wait(() => button("Prepare the question for openai…")?.disabled === false);
  click("Prepare the question for openai…");
  await wait(() => rows().every(b => b.disabled));
  check("prepare_blocks_branch_new_and_composer", button("New session")!.disabled && question().disabled);
  rows()[1].click();
  check("disabled_branch_does_not_request_other_detail", !calls.some(c => c.command === "session_detail" && c.args.sessionId === "session-two"));
  releasePrepare();
  await wait(() => button("Send once")?.disabled === false && !question().disabled);
  edit("Next unsent question");
  click("Send once");
  await wait(() => rows().every(b => b.disabled));
  check("send_admission_blocks_session_writes", button("New session")!.disabled && button("Send")!.disabled && fixture.querySelector<HTMLInputElement>("#mem-cp")!.disabled);
  releaseSend();
  await wait(() => !!button("Stop locally"));
  check("running_send_keeps_owner_selected", rows()[0].getAttribute("aria-pressed") === "true" && rows().every(b => b.disabled));
  check("running_send_preserves_cancel", !button("Stop locally")!.disabled);
  click("Refresh workspace calls");
  await wait(() => fixture.textContent!.includes("shown in its inspector"));
  check("workspace_list_does_not_duplicate_local_watcher", [...fixture.querySelectorAll("button")].filter(b => b.textContent === "Stop locally").length === 1);
  failDetail = true; finished = true;
  await wait(() => inspectorText().includes("Reply saved") && rows().every(b => !b.disabled));
  await wait(() => fixture.querySelector('[role="alert"]') != null);
  check("failed_completion_refresh_has_manual_read", !!button("Read session again"));
  check("unobserved_detail_blocks_new_writes", button("New session")!.disabled && button("Send")!.disabled && button("Prepare the question for openai…")!.disabled);
  check("failed_refresh_does_not_invent_transcript", !fixture.textContent!.includes("Saved synthetic reply"));
  const sendsBeforeRecovery = calls.filter(c => c.command === "external_send").length;
  failDetail = false;
  click("Read session again");
  await wait(() => fixture.textContent!.includes("Saved synthetic reply") && !question().disabled);
  check("recovery_reads_saved_reply", fixture.querySelector('[role="alert"]') == null);
  check("recovery_never_resends", calls.filter(c => c.command === "external_send").length === sendsBeforeRecovery);
  check("completion_refreshes_original_branch", calls.filter(c => c.command === "session_detail").every(c => c.args.sessionId === "session-one"));
  check("completion_preserves_later_draft", question().value === "Next unsent question");
  rows()[1].click();
  await wait(() => transcriptTitle() === "Session session-two");
  check("new_branch_does_not_inherit_outcome_or_preview", !inspectorText().includes("Reply saved") && !button("Send once"));
  rows()[0].click();
  await wait(() => transcriptTitle() === "Session session-one" && !question().disabled);
  check("original_draft_restored", question().value === "Next unsent question");
  failDetail = true;
  rows()[1].click();
  await wait(() => !!button("Read session again"));
  check("failed_switch_keeps_observed_branch", transcriptTitle() === "Session session-one");
  failDetail = false;
  click("Read session again");
  await wait(() => transcriptTitle() === "Session session-two" && !question().disabled);
  check("recovery_reuses_requested_branch", calls.filter(c => c.command === "session_detail").at(-1)!.args.sessionId === "session-two");
  check("one_explicit_external_send", calls.filter(c => c.command === "external_send").length === 1);
} catch (error) {checks.push({id: String(error), ok: false});}
finally {
  releasePrepare(); releaseSend(); root.unmount();
  results.textContent = JSON.stringify({checks, passed: checks.every(c => c.ok), calls: calls.map(c => ({command: c.command, sessionId: c.args.sessionId ?? null}))}, null, 2);
}
