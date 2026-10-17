// The actual Vault & recovery panel; operation IDs, progress and results are synthetic.
import { createRoot } from "react-dom/client";
import MemorySurface from "../src/memory/MemorySurface";
import { MemoryStatusProvider } from "../src/memory/status";
import { setTransport } from "../src/memory/client";
import "../src/quiet-runtime.css";
import "../src/memory/memory.css";

const fixture = document.getElementById("fixture")!;
const checks: { id: string; ok: boolean }[] = [];
const calls: { command: string; args: Record<string, unknown> }[] = [];
type Op = { kind: string; state: string; result: unknown };
const operations = new Map<string, Op>();
let started = 0;
setTransport(async (native, args) => {
  if (native === "shell_status") return { vaultChanging: false };
  if (native !== "memory_call") throw new Error(`Unexpected native command ${native}`);
  const r = args.request as { command: string; arguments: Record<string, unknown> };
  calls.push({ command: r.command, args: r.arguments }); let result: unknown;
  const running = [...operations.values()].filter(op => op.state === "running").length;
  if (r.command === "workspace_status") result = { vault: { state: "open", rootName: "synthetic-vault", health: "ok", headSequence: 3, lastCommitAt: "2026-10-13T00:00:00Z" }, pendingCandidates: 0, operationsRunning: running };
  else if (r.command === "memory_list") result = { items: [], nextCursor: null, total: 0 };
  else if (r.command === "vault_verify" || r.command === "index_rebuild") {
    const operationId = `synthetic-op-${++started}`;
    operations.set(operationId, { kind: r.command, state: "running", result: null });
    result = { operationId };
  } else if (r.command === "operation_get") {
    const operationId = r.arguments.operationId as string; const op = operations.get(operationId);
    if (!op) throw new Error("Unknown synthetic operation");
    result = { operationId, kind: op.kind, state: op.state, cancelRequested: false, progress: { done: op.state === "running" ? 1 : 2, total: 2 }, result: op.result, error: null };
  } else throw new Error(`Unexpected command ${r.command}`);
  return { kind: "memory_page", result, error: null };
});
const root = createRoot(fixture);
root.render(<MemoryStatusProvider><MemorySurface /></MemoryStatusProvider>);
const text = () => fixture.textContent ?? "";
const button = (label: string) => [...fixture.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === label);
const shown = () => [...fixture.querySelectorAll(".mem-operation")].map(o => `${o.querySelector(".mem-mono")?.textContent}:${o.querySelector(".mem-state")?.textContent}`);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function wait(p: () => boolean) { for (let n = 0; n < 250; n++) { if (p()) return; await sleep(20); } throw new Error(`UI wait timed out: ${shown().join(", ")} ${text()}`); }
function check(id: string, ok: boolean) { checks.push({ id, ok }); }
function click(label: string) { const b = button(label); if (!b || b.disabled) throw new Error(`Unavailable ${label}`); b.click(); }
const finish = (id: string, result: unknown) => { const op = operations.get(id)!; op.state = "succeeded"; op.result = result; };
const verdict = { clean: false, recordsChecked: 3, objectsChecked: 4, missingRecords: 0, corruptRecords: 0, missingObjects: 0, corruptObjects: 1, damagedSegments: 0 };
try {
  await wait(() => [...fixture.querySelectorAll<HTMLButtonElement>("button")].some(b => b.textContent?.startsWith("Vault & recovery")));
  [...fixture.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent?.startsWith("Vault & recovery"))!.click();
  await wait(() => !!button("Verify Vault"));
  click("Verify Vault"); await wait(() => shown().includes("vault_verify:running"));
  click("Rebuild index"); await wait(() => shown().includes("index_rebuild:running"));
  check("second_operation_keeps_first_visible", shown().includes("vault_verify:running") && shown().length === 2);
  check("running_rebuild_keeps_cancel", !!button("Cancel"));
  finish("synthetic-op-1", verdict); await wait(() => shown().includes("vault_verify:succeeded") || text().includes("integrity problems"));
  check("earlier_verify_result_is_not_hidden", text().includes("Verification found integrity problems: 3 records · 4 objects.") && shown().includes("index_rebuild:running"));
  click("Verify Vault"); await wait(() => started === 3); await sleep(50);
  check("new_verify_supersedes_only_terminal_verify", JSON.stringify(shown()) === JSON.stringify(["index_rebuild:running", "vault_verify:running"]) && !text().includes("integrity problems"));
  finish("synthetic-op-2", null); finish("synthetic-op-3", { ...verdict, clean: true, corruptObjects: 0 });
  await wait(() => shown().every(s => s.endsWith(":succeeded")));
  check("both_results_remain_visible", shown().length === 2 && text().includes("Verification passed: 3 records · 4 objects.") && shown().includes("index_rebuild:succeeded"));
  check("vault_panel_starts_only_requested_operations", calls.filter(c => ["vault_verify", "index_rebuild"].includes(c.command)).map(c => c.command).join() === "vault_verify,index_rebuild,vault_verify"
    && calls.every(c => ["workspace_status", "memory_list", "vault_verify", "index_rebuild", "operation_get"].includes(c.command)));
} catch (error) { checks.push({ id: String(error), ok: false }); }
finally { root.unmount(); document.getElementById("results")!.textContent = JSON.stringify({ checks, passed: checks.every(c => c.ok) }, null, 2); }
