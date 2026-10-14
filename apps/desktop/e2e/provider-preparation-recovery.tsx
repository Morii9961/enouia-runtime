// Actual panels; synthetic saved records and controlled receipt failures.
import { createRoot } from "react-dom/client";
import { ExternalPanel } from "../src/memory/ExternalPanel";
import { ExtractionPanel } from "../src/memory/ExtractionPanel";
import { setTransport } from "../src/memory/client";
import "../src/quiet-runtime.css";
import "../src/memory/memory.css";

const fixture = document.getElementById("fixture")!;
const checks: { id: string; ok: boolean }[] = [];
const calls: { command: string; args: Record<string, unknown>; key: unknown }[] = [];
let scenario = "session", attempts = 0, saves = 0, owned = false, changed = 0, closed = false, consumed: string[] = [];
const savedKeys = new Set<unknown>();
const setup = { configured: true, destinations: [{ api: "openai", model: "synthetic", maxOutputTokens: 4096 }], grants: [{
  active: true, policyId: "synthetic-policy", maxSensitivity: "private", purposes: ["extraction"], destinations: [{ provider: "openai", model: "synthetic" }] }] };
setTransport(async (native, args) => {
  if (native === "memory_provider_setup") return { state: "ready" };
  if (native !== "memory_call") throw new Error(`Unexpected native command ${native}`);
  const r = args.request as { command: string; arguments: Record<string, unknown>; idempotencyKey: unknown };
  calls.push({ command: r.command, args: r.arguments, key: r.idempotencyKey });
  if (r.command === "provider_status") return { kind: "memory_page", result: setup };
  if (!["external_prepare", "extraction_prepare"].includes(r.command)) throw new Error(`Unexpected command ${r.command}`);
  attempts++;
  if (!savedKeys.has(r.idempotencyKey)) { savedKeys.add(r.idempotencyKey); saves++; }
  if (scenario.startsWith("blocked") || attempts < 3) return { kind: "memory_error", error: {
    code: scenario.startsWith("blocked") ? "permission_denied" : "busy", retryable: !scenario.startsWith("blocked"), rules: [] } };
  return { kind: "memory_page", result: { callId: "synthetic-call", wireHash: "synthetic-hash", body: "Exact recovered body", endpoint: "synthetic endpoint",
    model: "synthetic", estimatedInputTokens: 10, outputTokens: 128, sessionId: "synthetic-session", runId: "synthetic-run" } };
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
  else root.render(<ExternalPanel branch={{ sessionId: "synthetic-session", branchId: "synthetic-branch" }} text="Original draft" invocations={[]}
    onChanged={async () => { changed++; }} onBusyChange={v => { owned = v; }} consumeText={value => { consumed.push(value); }} />);
}
try {
  for (const next of ["session", "source", "blocked-session", "blocked-source"]) {
    scenario = next; attempts = 0; saves = 0; owned = false; changed = 0; closed = false; consumed = []; savedKeys.clear();
    const source = next.endsWith("source"), blocked = next.startsWith("blocked"), start = calls.length;
    render(source); const prepare = source ? "Prepare the request…" : "Prepare the question for openai…";
    await wait(() => button(prepare)?.disabled === false); click(prepare);
    await wait(() => attempts === 1 && !!button("Recover preparation") && !button("Recover preparation")!.disabled === !blocked);
    check(`${next}_ambiguous_preparation_holds_selection`, owned && fixture.querySelector<HTMLSelectElement>("select")?.disabled === true);
    check(`${next}_does_not_invent_prepared_body_or_consume_draft`, !button("Send once") && !text().includes("Exact recovered body") && consumed.length === 0);
    if (!blocked) {
      click("Recover preparation"); await sleep(20); await wait(() => attempts === 2 && !!button("Retry") && button("Recover preparation")?.disabled === false);
      click("Retry"); await wait(() => button("Send once")?.disabled === false && !owned);
      const prepares = calls.slice(start).filter(c => ["external_prepare", "extraction_prepare"].includes(c.command));
      check(`${next}_recover_and_retry_keep_original_payload_key`, prepares.length === 3 && prepares.every(c => c.key === prepares[0].key && JSON.stringify(c.args) === JSON.stringify(prepares[0].args)));
      check(`${next}_one_saved_request_and_explicit_unsent_body`, saves === 1 && text().includes("Exact recovered body"));
      if (!source) check(`${next}_consumes_only_original_confirmed_draft`, consumed.length === 1 && consumed[0] === "Original draft" && changed === 1);
    } else {
      check(`${next}_nonretryable_withholds_recovery`, button("Recover preparation")!.disabled && !button("Retry"));
      click(source ? "Close" : "Leave preparation and read saved state"); await wait(() => source ? closed : !owned && !button("Recover preparation"));
      check(`${next}_leave_never_repeats_preparation`, attempts === 1 && saves === 1 && consumed.length === 0);
      if (!source) check(`${next}_leave_rereads_saved_state`, changed === 1 && text().includes("Read the saved session"));
    }
    root.unmount(); root = createRoot(fixture);
  }
  check("preparation_recovery_never_sends_or_changes_grants", calls.every(c => ["provider_status", "external_prepare", "extraction_prepare"].includes(c.command)));
} catch (error) { checks.push({ id: String(error), ok: false }); }
finally { root.unmount(); document.getElementById("results")!.textContent = JSON.stringify({ checks, passed: checks.every(c => c.ok), calls }, null, 2); }
