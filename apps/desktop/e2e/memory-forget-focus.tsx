// The actual Explorer and inspector deletion flow; plans, receipts and lists are synthetic.
import { createRoot } from "react-dom/client";
import { Explorer } from "../src/memory/MemorySurface";
import { MemoryStatusProvider } from "../src/memory/status";
import { setTransport } from "../src/memory/client";
import "../src/quiet-runtime.css";
import "../src/memory/memory.css";

const fixture = document.getElementById("fixture")!;
const outside = document.createElement("input"); document.body.appendChild(outside);
const checks: { id: string; ok: boolean }[] = [];
const calls: { command: string; args: Record<string, unknown> }[] = [];
const remaining = new Set(["synthetic-one", "synthetic-two", "synthetic-three"]);
const snippets: Record<string, string> = { "synthetic-one": "Synthetic memory one", "synthetic-two": "Synthetic memory two", "synthetic-three": "Synthetic memory three" };
let holdList = false, holdConfirm = false, planned = "", release: (() => void) | null = null;
const releasePending = () => { const resolve = release; release = null; resolve?.(); };
const held = () => new Promise<void>(resolve => { release = resolve; });
setTransport(async (native, args) => {
  if (native === "shell_status") return { vaultChanging: false };
  if (native !== "memory_call") throw new Error(`Unexpected native command ${native}`);
  const r = args.request as { command: string; arguments: Record<string, unknown> };
  calls.push({ command: r.command, args: r.arguments }); let result: unknown;
  if (r.command === "workspace_status") result = { vault: { state: "open" }, pendingCandidates: 0 };
  else if (r.command === "memory_list") {
    if (holdList) { holdList = false; await held(); }
    const items = [...remaining].map(memoryId => ({ memoryId, type: "fact", status: "active", currency: "current", snippet: snippets[memoryId], revision: 1, updatedAt: "2026-10-13T00:00:00Z" }));
    result = { items, nextCursor: null, total: items.length };
  } else if (r.command === "memory_read") {
    const id = r.arguments.memoryId as string;
    if (!remaining.has(id)) return { kind: "memory_error", error: { code: "not_found", retryable: false, rules: [] } };
    result = {
      record: { memory_id: id, revision: 1, content: snippets[id], approved_at: "2026-10-13T00:00:00Z", supersedes: [] },
      summary: { memoryId: id, status: "active", type: "fact", expired: false, conflicted: false, sourceMissing: false },
      evidence: [], supersededBy: [],
    };
  } else if (r.command === "forget_plan") {
    const id = r.arguments.memoryId as string; const purge = r.arguments.mode === "purge"; planned = id;
    result = { planId: `plan-${calls.length}`, diffHash: "synthetic-hash", confirmCode: "SYNTHETIC", expiresAt: "2026-10-13T01:00:00Z", operationKind: "forget", purge, records: [{ target: id }] };
  } else if (r.command === "review_confirm") {
    if (holdConfirm) { holdConfirm = false; await held(); }
    remaining.delete(planned);
    result = { committed: true };
  } else if (r.command === "review_discard") result = { discarded: true };
  else throw new Error(`Unexpected command ${r.command}`);
  return { kind: "memory_page", result, error: null };
});
const root = createRoot(fixture);
root.render(<MemoryStatusProvider><Explorer history={false} submitted={{ text: "", seq: 0 }} onRefresh={() => {}} /></MemoryStatusProvider>);
const text = () => fixture.textContent ?? "";
const button = (label: string) => [...fixture.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === label);
const row = (id: string) => [...fixture.querySelectorAll<HTMLButtonElement>("button.qr43")].find(b => b.textContent?.includes(snippets[id]));
const title = () => document.getElementById("mem-center-title");
const notices = () => [...fixture.querySelectorAll('[role="status"]')].map(n => n.textContent ?? "");
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function wait(p: () => boolean) { for (let n = 0; n < 250; n++) { if (p()) return; await sleep(20); } throw new Error(`UI wait timed out: ${text()}`); }
function check(id: string, ok: boolean) { checks.push({ id, ok }); }
function click(control: HTMLButtonElement | undefined, label: string) { if (!control || control.disabled) throw new Error(`Unavailable ${label}`); control.focus(); control.click(); }
async function select(id: string) { click(row(id), id); await wait(() => !!button("Forget…") && text().includes(`Synthetic memory`) && !!fixture.querySelector(".mem-content")); }
async function openPlan(label: "Forget…" | "Purge…") { click(button(label), label); await wait(() => !!fixture.querySelector("dialog[open]")); }
try {
  await wait(() => !!row("synthetic-one") && !!row("synthetic-two") && !!row("synthetic-three"));
  await select("synthetic-one"); await openPlan("Forget…");
  holdList = true; click(button("Confirm (SYNTHETIC)"), "Confirm"); await wait(() => release != null && !fixture.querySelector("dialog[open]"));
  check("confirmed_forget_clears_inspector", text().includes("Select a memory to see where it came from.") && !button("Forget…"));
  check("confirmed_forget_waits_for_current_results", document.activeElement !== title());
  releasePending(); await wait(() => !row("synthetic-one") && !!row("synthetic-two")); await sleep(30);
  check("confirmed_forget_focuses_reread_results", document.activeElement === title());
  check("confirmed_forget_is_announced", notices().some(n => n === "Forget confirmed by Memory."));
  await select("synthetic-two");
  check("new_selection_retires_deletion_notice", !notices().some(n => n.includes("confirmed by Memory")));
  await openPlan("Forget…"); click(button("Cancel"), "Cancel"); await wait(() => !fixture.querySelector("dialog[open]")); await sleep(30);
  check("cancelled_plan_keeps_trigger_focus_and_note", document.activeElement === button("Forget…") && text().includes("Confirmation cancelled.") && !notices().some(n => n.includes("confirmed by Memory")));
  await openPlan("Purge…");
  holdList = true; click(button("Confirm (SYNTHETIC)"), "Confirm"); await wait(() => release != null && !fixture.querySelector("dialog[open]"));
  outside.focus(); releasePending(); await wait(() => !row("synthetic-two") && !!row("synthetic-three")); await sleep(30);
  check("confirmed_purge_respects_moved_focus", document.activeElement === outside);
  check("confirmed_purge_is_announced_as_permanent", notices().some(n => n === "Permanent purge confirmed by Memory."));
  await select("synthetic-three"); await openPlan("Forget…");
  holdConfirm = true; click(button("Confirm (SYNTHETIC)"), "Confirm"); await wait(() => release != null);
  outside.focus(); root.unmount(); releasePending(); await sleep(50);
  check("unmount_discards_pending_focus", document.activeElement === outside);
  const plans = calls.filter(c => c.command === "forget_plan").map(c => `${c.args.memoryId}:${c.args.mode}`);
  check("plans_target_only_selected_memories", JSON.stringify(plans) === JSON.stringify(["synthetic-one:forget", "synthetic-two:forget", "synthetic-two:purge", "synthetic-three:forget"]));
  check("deletion_flow_issues_only_expected_commands", calls.every(c => ["workspace_status", "memory_list", "memory_read", "forget_plan", "review_confirm", "review_discard"].includes(c.command)));
} catch (error) { checks.push({ id: String(error), ok: false }); }
finally { releasePending(); root.unmount(); outside.remove(); document.getElementById("results")!.textContent = JSON.stringify({ checks, passed: checks.every(c => c.ok) }, null, 2); }
