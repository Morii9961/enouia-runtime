// Actual Session/source Provider panels; every response and receipt delay is synthetic.
import { createRoot } from "react-dom/client";
import { ExternalPanel } from "../src/memory/ExternalPanel";
import { ExtractionPanel } from "../src/memory/ExtractionPanel";
import { setTransport } from "../src/memory/client";
import "../src/quiet-runtime.css";
import "../src/memory/memory.css";

const fixture = document.getElementById("fixture")!;
const checks: { id: string; ok: boolean }[] = [];
const calls: { command: string; args: Record<string, unknown>; key: unknown }[] = [];
let scenario = "session", attempts = 0, sends = 0, owned = false, changed = 0, closed = false;
let admittedKey: unknown;
const setup = { configured: true, destinations: [{ api: "openai", model: "synthetic", maxOutputTokens: 4096 }], grants: [{
  active: true, policyId: "synthetic-policy", maxSensitivity: "private", purposes: ["extraction"], destinations: [{ provider: "openai", model: "synthetic" }] }] };
setTransport(async (native, args) => {
  if (native === "memory_provider_setup") return { state: "ready" };
  if (native !== "memory_call") throw new Error(`Unexpected native command ${native}`);
  const r = args.request as { command: string; arguments: Record<string, unknown>; idempotencyKey: unknown };
  calls.push({ command: r.command, args: r.arguments, key: r.idempotencyKey });
  const reply = (result: unknown) => ({ kind: "memory_page", result });
  if (r.command === "provider_status") return reply(setup);
  if (["external_prepare", "extraction_prepare"].includes(r.command)) return reply({ callId: `${scenario}-call`, wireHash: `${scenario}-hash`,
    body: "Exact synthetic body", endpoint: "synthetic endpoint", model: "synthetic", estimatedInputTokens: 10, outputTokens: 128,
    sessionId: "synthetic-suggestion-session", runId: "synthetic-run" });
  if (r.command === "external_send") {
    attempts++;
    if (admittedKey && admittedKey !== r.idempotencyKey) return { kind: "memory_error", error: { code: "not_found", retryable: false, rules: ["provider.call_unknown"] } };
    if (!admittedKey) { admittedKey = r.idempotencyKey; sends++; }
    if (scenario.startsWith("blocked") || attempts < 3) return { kind: "memory_error", error: {
      code: scenario.startsWith("blocked") ? "permission_denied" : "busy", retryable: !scenario.startsWith("blocked"), rules: [] } };
    return reply({ operationId: "synthetic-operation", kind: "external_send" });
  }
  if (r.command === "operation_get") return reply({ operationId: r.arguments.operationId, kind: "external_send", state: "failed",
    progress: { done: 0, total: null }, result: null, cancelRequested: false, error: { code: "storage_failed", retryable: false, rules: [] } });
  throw new Error(`Unexpected command ${r.command}`);
});
const text = () => fixture.textContent ?? "";
const button = (label: string) => [...fixture.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === label);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function wait(p: () => boolean) { for (let n = 0; n < 250; n++) { if (p()) return; await sleep(20); } throw new Error(`UI timeout: ${text()}`); }
function click(label: string) { const b = button(label); if (!b || b.disabled) throw new Error(`Unavailable: ${label}`); b.click(); }
function check(id: string, ok: boolean) { checks.push({ id, ok }); if (!ok) throw new Error(id); }
let root = createRoot(fixture);
function render(source: boolean) {
  if (source) root.render(<ExtractionPanel range={{ sourceId: "synthetic-source", revision: 1, start: 0, end: 20 }} onBusyChange={v => { owned = v; }} onClose={() => { closed = true; }} />);
  else root.render(<ExternalPanel branch={{ sessionId: "synthetic-session", branchId: "synthetic-branch" }} text="Unsent draft" invocations={[]}
    onChanged={async () => { changed++; }} onBusyChange={v => { owned = v; }} consumeText={() => {}} />);
}
try {
  for (const next of ["session", "source", "blocked-session", "blocked-source"]) {
    scenario = next; attempts = 0; sends = 0; admittedKey = null; changed = 0; owned = false; closed = false;
    const source = next.endsWith("source"), blocked = next.startsWith("blocked"), start = calls.length;
    render(source);
    const prepare = source ? "Prepare the request…" : "Prepare the question for openai…";
    await wait(() => button(prepare)?.disabled === false); click(prepare);
    await wait(() => button("Send once")?.disabled === false);
    click("Send once"); await wait(() => !!button("Recover this call") && !button("Recover this call")!.disabled === !blocked);
    check(`${next}_lost_start_keeps_exact_body_and_ownership`, text().includes("Exact synthetic body") && text().includes("may have received") && owned);
    check(`${next}_withholds_model_change`, fixture.querySelector<HTMLSelectElement>("select")?.disabled === true);
    if (source) check(`${next}_retains_saved_run_identity`, text().includes("synthetic-run") && text().includes("synthetic-suggestion-session") && !button("Read saved suggestions"));
    if (!blocked) {
      click("Recover this call"); await sleep(20); await wait(() => attempts === 2 && !!button("Retry") && button("Recover this call")?.disabled === false);
      click("Retry"); await wait(() => text().includes("Read the recorded outcome") && !owned);
      const sendsForCase = calls.slice(start).filter(c => c.command === "external_send");
      check(`${next}_explicit_recovery_and_retry_replay_same_key`, sendsForCase.length === 3 && sendsForCase.every(c => c.key === sendsForCase[0].key && JSON.stringify(c.args) === JSON.stringify(sendsForCase[0].args)));
      check(`${next}_service_dispatched_once`, sends === 1 && !button("Recover this call"));
    } else {
      check(`${next}_nonretryable_withholds_recovery`, button("Recover this call")!.disabled && !button("Retry") && !text().includes("Not sent."));
      click(source ? "Leave this request" : "Leave and read saved state");
      await wait(() => source ? closed : !owned && !button("Recover this call"));
      check(`${next}_leave_never_replays_send`, attempts === 1 && sends === 1);
      if (!source) check(`${next}_leave_reads_saved_state_without_claiming_not_sent`, changed === 2 && text().includes("outcome is not confirmed") && !text().includes("Not sent."));
    }
    root.unmount(); root = createRoot(fixture);
  }
  check("only_preparation_send_and_observation_commands", calls.every(c => ["provider_status", "external_prepare", "extraction_prepare", "external_send", "operation_get"].includes(c.command)));
} catch (error) { checks.push({ id: String(error), ok: false }); }
finally { root.unmount(); document.getElementById("results")!.textContent = JSON.stringify({ checks, passed: checks.every(c => c.ok), calls }, null, 2); }
