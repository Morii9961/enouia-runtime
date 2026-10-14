// Real shared watcher; wrong identities and delivery timing are controlled.
import { createRoot } from "react-dom/client";
import { Operation } from "../src/memory/ui";
import { setTransport } from "../src/memory/client";
import "../src/quiet-runtime.css";
import "../src/memory/memory.css";

const fixture = document.getElementById("fixture")!;
const checks: { id: string; ok: boolean }[] = [];
const calls: { command: string; id: unknown }[] = [];
let fault: "id" | "missing" | "kind" | null = "id";
let state = "succeeded";
let callbacks = 0;
let cancelRequested = false;
let hold = false;
let release: (() => void) | null = null;
const releasePending = () => release?.();
const snapshot = () => ({ operationId: fault === "missing" ? undefined : fault === "id" ? "other-operation" : "selected-operation", kind: fault === "kind" ? "import" : "external_send", state, cancelRequested, progress: { done: 0, total: null }, result: state === "succeeded" ? { finish: "completed" } : null });
setTransport(async (native, args) => {
  if (native !== "memory_call") throw new Error(`Unexpected native command ${native}`);
  const r = args.request as { command: string; arguments: Record<string, unknown> };
  calls.push({ command: r.command, id: r.arguments.operationId });
  if (r.arguments.operationId !== "selected-operation") throw new Error("Wrong requested operation");
  let result: unknown;
  if (r.command === "operation_get") {
    const read = snapshot();
    if (hold) { hold = false; await new Promise<void>(resolve => { release = resolve; }); }
    result = read;
  } else if (r.command === "operation_cancel") { cancelRequested = true; result = snapshot(); }
  else throw new Error(`Unexpected command ${r.command}`);
  return { kind: "memory_page", result, error: null };
});
let root = createRoot(fixture);
const render = (knownKind = true) => root.render(<Operation id="selected-operation" kind={knownKind ? "external_send" : undefined} onDone={() => { callbacks++; }} />);
render();
const text = () => fixture.textContent ?? "";
const button = (label: string) => [...fixture.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === label);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function wait(p: () => boolean) { for (let n = 0; n < 250; n++) { if (p()) return; await sleep(20); } throw new Error(`UI wait timed out: ${text()}`); }
function check(id: string, ok: boolean) { checks.push({ id, ok }); if (!ok) throw new Error(id); }
function retry() { const b = button("Retry"); if (!b || b.disabled) throw new Error("No read retry"); b.click(); }
try {
  await wait(() => !!button("Retry") || text().includes("Reply saved"));
  check("foreign_terminal_read_cannot_finish_selected_operation", callbacks === 0 && !text().includes("Reply saved") && !!button("Retry") && !button("Stop locally"));
  fault = "missing"; retry(); await sleep(40);
  check("missing_read_identity_cannot_finish_operation", callbacks === 0 && !text().includes("Reply saved") && !!button("Retry"));
  fault = "kind"; retry(); await sleep(40);
  check("wrong_known_operation_kind_is_rejected", callbacks === 0 && !text().includes("Reply saved") && !text().includes("progress") && !!button("Retry"));
  fault = null; state = "running"; retry(); await wait(() => !!button("Stop locally"));
  check("valid_read_recovers_without_cancellation", callbacks === 0 && !button("Retry") && calls.every(c => c.command === "operation_get"));
  fault = "id"; state = "succeeded"; await wait(() => !!button("Retry"));
  check("failed_replacement_keeps_prior_progress_without_completion", callbacks === 0 && text().includes("running") && !!button("Stop locally") && !text().includes("Reply saved"));
  fault = null; state = "succeeded"; retry(); await wait(() => callbacks === 1);
  check("matching_terminal_status_finishes_once", text().includes("Reply saved") && !button("Stop locally")); await sleep(450);
  check("terminal_status_is_not_republished", callbacks === 1);

  root.unmount(); root = createRoot(fixture); callbacks = 0; state = "running"; fault = null; cancelRequested = false; render(false); await wait(() => !!button("Stop locally"));
  fault = "kind"; state = "succeeded"; await wait(() => !!button("Retry"));
  check("generic_watcher_keeps_first_observed_kind", callbacks === 0 && text().includes("external_send") && !text().includes("Reply saved"));
  fault = null; state = "running"; retry(); await wait(() => !button("Retry"));
  fault = "id"; state = "succeeded"; hold = true; await wait(() => release != null);
  fault = null; state = "running"; button("Stop locally")!.click(); await wait(() => !!button("Local stop requested")); releasePending(); await sleep(80);
  check("late_foreign_read_cannot_replace_local_stop_ack", callbacks === 0 && !!button("Local stop requested") && !text().includes("Could not read the operation") && !text().includes("Reply saved"));
  state = "cancelled"; await wait(() => callbacks === 1);
  check("matching_local_stop_outcome_is_observed", text().includes("cancelled") && !button("Stop locally"));
  check("all_requests_keep_the_selected_operation", calls.every(c => c.id === "selected-operation" && ["operation_get", "operation_cancel"].includes(c.command)) && calls.filter(c => c.command === "operation_cancel").length === 1);
} catch (error) { checks.push({ id: String(error), ok: false }); }
finally { releasePending(); root.unmount(); document.getElementById("results")!.textContent = JSON.stringify({ checks, passed: checks.every(c => c.ok), calls }, null, 2); }
