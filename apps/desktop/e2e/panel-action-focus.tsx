// Actual Import and Vault & recovery panels with synthetic picker tokens and IPC. Chromium/WebView2
// moves focus from a control that becomes disabled to the document (Keyboard-journey-v1); Happy DOM
// does not, so this fixture applies only that platform focus fixup while an action is pending.
import { createRoot } from "react-dom/client";
import MemorySurface from "../src/memory/MemorySurface";
import { MemoryStatusProvider } from "../src/memory/status";
import { setTransport } from "../src/memory/client";
import "../src/quiet-runtime.css";
import "../src/memory/memory.css";

const fixture = document.getElementById("fixture")!;
const outside = document.createElement("input"); document.body.appendChild(outside);
const checks: { id: string; ok: boolean }[] = [];
const calls: string[] = [];
let hold = false, release: (() => void) | null = null, started = 0;
const releasePending = () => { const resolve = release; release = null; resolve?.(); };
const held = async () => { if (hold) { hold = false; await new Promise<void>(resolve => { release = resolve; }); } };
setTransport(async (native, args) => {
  if (native === "shell_status") return { vaultChanging: false };
  if (native === "memory_pick") { calls.push(`pick:${args.kind}`); await held(); return { token: `token-${calls.length}`, displayName: "Synthetic.md", bytes: 20 }; }
  if (native !== "memory_call") throw new Error(`Unexpected native ${native}`);
  const r = args.request as { command: string; arguments: Record<string, unknown> };
  calls.push(r.command); let result: unknown;
  switch (r.command) {
    case "workspace_status": result = { vault: { state: "open", rootName: "synthetic-vault", health: "ok", headSequence: 1, lastCommitAt: "2026-10-13T00:00:00Z" }, pendingCandidates: 0, operationsRunning: 0 }; break;
    case "memory_list": result = { items: [], total: 0, nextCursor: null }; break;
    case "import_list": await held(); result = { items: [] }; break;
    case "import_preview": result = { displayName: "Synthetic.md", bytes: 20, inputKind: "markdown_file", recognized: true, units: 1, warnings: [], duplicateOf: null }; break;
    case "import_start": case "vault_verify": await held(); result = { operationId: `synthetic-op-${++started}` }; break;
    case "operation_get": result = { operationId: r.arguments.operationId, kind: "vault_verify", state: "running", cancelRequested: false, progress: { done: 0, total: 1 }, result: null }; break;
    default: throw new Error(`Unexpected command ${r.command}`);
  }
  return { kind: "memory_page", result };
});
const root = createRoot(fixture);
root.render(<MemoryStatusProvider><MemorySurface /></MemoryStatusProvider>);
const text = () => fixture.textContent ?? "";
const button = (label: string) => [...fixture.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === label);
const nav = (prefix: string) => [...fixture.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent?.startsWith(prefix));
const title = () => document.getElementById("mem-center-title");
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function wait(p: () => boolean) { for (let n = 0; n < 250; n++) { if (p()) return; await sleep(20); } throw new Error(`UI timeout: ${document.activeElement?.tagName} ${text().slice(0, 300)}`); }
function check(id: string, ok: boolean) { checks.push({ id, ok }); }
const focusFixup = () => {
  if (!(document.activeElement as HTMLButtonElement | null)?.disabled) return;
  // Happy DOM ignores blur() on a disabled control; removing a focused stand-in leaves the document focused.
  const standIn = document.createElement("span"); standIn.tabIndex = -1; document.body.appendChild(standIn); standIn.focus(); standIn.remove();
};
async function begin(label: string) { const b = button(label); if (!b || b.disabled) throw new Error(`Unavailable ${label}`); hold = true; b.focus(); b.click(); await wait(() => release != null); await sleep(20); focusFixup(); }
const settle = async (p: () => boolean) => { releasePending(); await wait(p); await sleep(40); };
try {
  await wait(() => !!nav("Import")); nav("Import")!.click(); await wait(() => button("Choose file…")?.disabled === false && text().includes("0 recorded"));
  await begin("Choose file…");
  check("platform_blur_reaches_document_while_pending", document.activeElement === document.body);
  await settle(() => !!button("Start import") && button("Choose file…")?.disabled === false);
  check("preview_returns_to_choose_file", document.activeElement === button("Choose file…"));
  await begin("Refresh import list"); await settle(() => button("Refresh import list")?.disabled === false);
  check("list_refresh_returns_to_its_control", document.activeElement === button("Refresh import list"));
  await begin("Start import"); await settle(() => !button("Start import") && button("Choose file…")?.disabled === false);
  check("started_import_continues_at_import_heading", document.activeElement === title() && title()?.textContent === "Import");
  await begin("Choose file…"); outside.focus(); await settle(() => !!button("Start import") && button("Choose file…")?.disabled === false);
  check("import_action_respects_moved_focus", document.activeElement === outside);
  nav("Vault & recovery")!.click(); await wait(() => button("Verify Vault")?.disabled === false);
  await begin("Verify Vault"); await settle(() => button("Verify Vault")?.disabled === false);
  check("vault_action_returns_to_its_control", document.activeElement === button("Verify Vault"));
  check("actions_issue_only_requested_commands", calls.filter(c => !["workspace_status", "memory_list", "import_list", "operation_get"].includes(c)).join() === "pick:import_file,import_preview,import_start,pick:import_file,import_preview,vault_verify");
} catch (error) { checks.push({ id: String(error), ok: false }); }
finally { releasePending(); root.unmount(); outside.remove(); document.getElementById("results")!.textContent = JSON.stringify({ checks, passed: checks.every(c => c.ok) }, null, 2); }
