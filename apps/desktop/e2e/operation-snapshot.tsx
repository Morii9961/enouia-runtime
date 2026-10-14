// Error boundary observes real rendering faults; replies remain synthetic.
import { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { Operation } from "../src/memory/ui";
import { WorkspaceProviderCalls } from "../src/memory/WorkspaceProviderCalls";
import { setTransport } from "../src/memory/client";
import "../src/quiet-runtime.css";
import "../src/memory/memory.css";

const fixture = document.getElementById("fixture")!;
const checks: { id: string; ok: boolean }[] = [];
let malformed: "progress" | "state" | "cancel" | null = "progress", cancellationFault = false, callbacks = 0, cancelCalls = 0;
const valid = () => ({ operationId: "synthetic-operation", kind: "external_send", state: "running", progress: { done: 0, total: null }, cancelRequested: false, result: null });
const snapshot = () => ({ ...valid(), ...(malformed === "progress" ? { progress: null } : malformed === "state" ? { state: "invented" } : malformed === "cancel" ? { cancelRequested: "yes" } : {}) });
setTransport(async (native, args) => {
  if (native !== "memory_call") throw new Error(native);
  const r = args.request as { command: string };
  let result: unknown;
  if (r.command === "operation_get") result = snapshot();
  else if (r.command === "operation_cancel") { cancelCalls++; result = { ...valid(), cancelRequested: true, progress: cancellationFault ? null : { done: 0, total: null } }; }
  else if (r.command === "operation_list") result = { items: [snapshot()] };
  else throw new Error(r.command);
  return { kind: "memory_page", result };
});
class Boundary extends Component<{ children: ReactNode }, { crashed: boolean }> {
  state = { crashed: false };
  static getDerivedStateFromError() { return { crashed: true }; }
  render() { return this.state.crashed ? <p>Operation view crashed</p> : this.props.children; }
}
let root = createRoot(fixture);
const render = (list = false) => root.render(<Boundary>{list ? <WorkspaceProviderCalls /> : <Operation id="synthetic-operation" kind="external_send" onDone={() => { callbacks++; }} />}</Boundary>);
const text = () => fixture.textContent ?? "";
const button = (label: string) => [...fixture.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === label);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function wait(p: () => boolean) { for (let n = 0; n < 250; n++) { if (p()) return; await sleep(20); } throw new Error(`UI timeout: ${text()}`); }
function check(id: string, ok: boolean) { checks.push({ id, ok }); if (!ok) throw new Error(id); }
function retry() { const b = button("Retry"); if (!b) throw new Error("Missing read retry"); b.click(); }
try {
  render(); await wait(() => !!button("Retry") || text().includes("crashed"));
  check("missing_progress_is_read_error_without_render_crash", !text().includes("crashed") && !!button("Retry") && callbacks === 0);
  malformed = "state"; retry(); await sleep(40);
  check("unknown_state_cannot_publish_or_finish", !!button("Retry") && !text().includes("invented") && callbacks === 0);
  malformed = "cancel"; retry(); await sleep(40);
  check("malformed_cancel_flag_cannot_claim_stop", !!button("Retry") && !button("Local stop requested"));
  malformed = null; retry(); await wait(() => !!button("Stop locally"));
  check("valid_read_recovers_running_controls", !button("Retry") && !text().includes("crashed"));
  cancellationFault = true; button("Stop locally")!.click(); await wait(() => fixture.querySelector('[role="alert"]') != null);
  check("malformed_stop_reply_retains_running_observation", !!button("Stop locally") && !button("Local stop requested") && text().includes("progress 0"));
  check("invalid_stop_reply_is_not_automatically_replayed", cancelCalls === 1 && !button("Retry") && callbacks === 0);
  root.unmount(); root = createRoot(fixture); malformed = "progress"; render(true);
  await wait(() => fixture.querySelector('[role="alert"]') != null || text().includes("crashed"));
  check("malformed_list_is_read_error_without_watcher_or_crash", !text().includes("crashed") && !button("Stop locally"));
  malformed = null; button("Refresh workspace calls")!.click(); await wait(() => !!button("Stop locally"));
  check("valid_list_recovers_after_explicit_read", !fixture.querySelector('[role="alert"]') && !text().includes("crashed"));
  malformed = "state"; button("Refresh workspace calls")!.click(); await wait(() => fixture.querySelector('[role="alert"]') != null);
  check("bad_list_replacement_retains_prior_valid_observation", text().includes("earlier observation") && text().includes("running") && !text().includes("invented"));
} catch (error) { checks.push({ id: String(error), ok: false }); }
finally { root.unmount(); document.getElementById("results")!.textContent = JSON.stringify({ checks, passed: checks.every(c => c.ok), callbacks, cancelCalls }, null, 2); }
