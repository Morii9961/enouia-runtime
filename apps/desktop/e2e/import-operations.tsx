// Actual Memory surface -> Import route with overlapping synthetic imports. No native picker, file or Vault is used.
import { createRoot } from "react-dom/client";
import MemorySurface from "../src/memory/MemorySurface";
import { MemoryStatusProvider } from "../src/memory/status";
import { setTransport } from "../src/memory/client";
import "../src/quiet-runtime.css";
import "../src/memory/memory.css";

const fixture = document.getElementById("fixture")!;
const checks: { id: string; ok: boolean }[] = [];
const calls: { command: string; args: Record<string, unknown> }[] = [];
const imports: { importId: string; status: string }[] = [];
const operations = new Map<string, { importId: string; state: string }>();
let picks = 0;
setTransport(async (native, args) => {
  if (native === "shell_status") return { vaultChanging: false };
  if (native === "memory_pick") { picks++; return { token: `token-${picks}`, displayName: `Synthetic-${picks}.md`, bytes: 20 }; }
  if (native !== "memory_call") throw new Error(`Unexpected native ${native}`);
  const r = args.request as { command: string; arguments: Record<string, unknown> };
  calls.push({ command: r.command, args: r.arguments }); let result: unknown;
  switch (r.command) {
    case "history_task_list": result = { identity: { commitId: "synthetic-head" }, items: [], nextCursor: null, readOnly: true }; break;
    case "operation_list": result = { items: [] }; break;
    case "workspace_status": result = { vault: { state: "open" }, pendingCandidates: 0 }; break;
    case "memory_list": result = { items: [], total: 0, nextCursor: null }; break;
    case "import_list": result = { items: imports.map(m => ({ ...m, inputKind: "markdown_file", accountScope: "fixture-account", counts: { sources_created: m.status === "completed" ? 1 : 0, attachments_missing: 0 }, warnings: [], duplicateOf: null })) }; break;
    case "import_preview": result = { displayName: "Synthetic.md", bytes: 20, inputKind: "markdown_file", recognized: true, units: 1, warnings: [], duplicateOf: null }; break;
    case "import_start": {
      const importId = `import-${imports.length + 1}`, operationId = `operation-${importId}`;
      imports.push({ importId, status: "parsing" }); operations.set(operationId, { importId, state: "running" });
      result = { operationId, kind: "import" }; break;
    }
    case "operation_get": {
      const op = operations.get(r.arguments.operationId as string)!;
      result = { operationId: r.arguments.operationId, kind: "import", state: op.state, cancelRequested: false, progress: { done: op.state === "running" ? 0 : 1, total: 1 }, result: null }; break;
    }
    default: throw new Error(`Unexpected command ${r.command}`);
  }
  return { kind: "memory_page", result };
});
const root = createRoot(fixture);
root.render(<MemoryStatusProvider><MemorySurface /></MemoryStatusProvider>);
const text = () => fixture.textContent ?? "";
const button = (label: string) => [...fixture.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === label);
const watchers = () => [...fixture.querySelectorAll(".mem-operation")].map(o => o.querySelector(".mem-state")?.textContent ?? "");
const rows = () => [...fixture.querySelectorAll("tbody tr")].map(row => row.querySelector("td")?.textContent ?? "");
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function wait(p: () => boolean) { for (let n = 0; n < 250; n++) { if (p()) return; await sleep(20); } throw new Error(`UI wait timed out: ${watchers().join(",")} ${text()}`); }
function check(id: string, ok: boolean) { checks.push({ id, ok }); }
function click(label: string) { const b = button(label); if (!b || b.disabled) throw new Error(`Unavailable ${label}`); b.click(); }
async function startImport(count: number) {
  await wait(() => button("Choose file…")?.disabled === false); click("Choose file…");
  await wait(() => button("Start import")?.disabled === false); click("Start import");
  await wait(() => calls.filter(c => c.command === "import_start").length === count && !button("Start import"));
}
try {
  await wait(() => !!button("Import")); click("Import");
  await startImport(1); await wait(() => watchers().includes("running"));
  await startImport(2); await wait(() => watchers().filter(s => s === "running").length >= 1); await sleep(50);
  check("overlapping_import_keeps_first_watcher", watchers().length === 2 && watchers().every(s => s === "running"));
  check("both_running_imports_keep_cancel", [...fixture.querySelectorAll<HTMLButtonElement>("button")].filter(b => b.textContent === "Cancel").length === 2);
  const listsBefore = calls.filter(c => c.command === "import_list").length;
  operations.get("operation-import-1")!.state = "succeeded"; imports[0].status = "completed";
  await wait(() => watchers().includes("succeeded") || calls.filter(c => c.command === "import_list").length > listsBefore).catch(() => undefined); await sleep(80);
  check("first_import_completion_refreshes_list", calls.filter(c => c.command === "import_list").length > listsBefore && rows()[0] === "completed");
  check("second_import_still_watched", watchers().includes("running"));
  operations.get("operation-import-2")!.state = "succeeded"; imports[1].status = "completed";
  await wait(() => rows().every(s => s === "completed") && !watchers().includes("running"));
  await startImport(3); await wait(() => watchers().includes("running")); await sleep(50);
  check("new_import_retires_finished_import_feedback", JSON.stringify(watchers()) === JSON.stringify(["running"]));
  check("imports_issue_only_expected_commands", calls.every(c => ["history_task_list", "operation_list", "workspace_status", "memory_list", "import_list", "import_preview", "import_start", "operation_get"].includes(c.command)));
} catch (error) { checks.push({ id: String(error), ok: false }); }
finally { root.unmount(); document.getElementById("results")!.textContent = JSON.stringify({ checks, passed: checks.every(c => c.ok) }, null, 2); }
