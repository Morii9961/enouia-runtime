// The actual Memory surface Explorer with synthetic pages; no Vault or native IPC is used.
import { createRoot } from "react-dom/client";
import MemorySurface from "../src/memory/MemorySurface";
import { MemoryStatusProvider } from "../src/memory/status";
import { setTransport } from "../src/memory/client";
import "../src/quiet-runtime.css";
import "../src/memory/memory.css";

const fixture = document.getElementById("fixture")!;
const outside = document.createElement("input"); document.body.appendChild(outside);
const checks: { id: string; ok: boolean }[] = [];
const calls: { command: string; args: Record<string, unknown> }[] = [];
const all = Array.from({ length: 55 }, (_, i) => ({ memoryId: `synthetic-${String(i).padStart(2, "0")}`, type: "fact", status: "active", currency: "current", snippet: `Synthetic memory ${i}`, revision: 1, updatedAt: "2026-10-13T00:00:00Z" }));
let hold = false, release: (() => void) | null = null;
const releasePending = () => { const resolve = release; release = null; resolve?.(); };
setTransport(async (native, args) => {
  if (native === "shell_status") return { vaultChanging: false };
  if (native !== "memory_call") throw new Error(`Unexpected native ${native}`);
  const r = args.request as { command: string; arguments: Record<string, unknown> };
  calls.push({ command: r.command, args: r.arguments }); let result: unknown;
  if (r.command === "workspace_status") result = { vault: { state: "open" }, pendingCandidates: 0 };
  else if (r.command === "memory_list" || r.command === "memory_search") {
    if (hold) { hold = false; await new Promise<void>(resolve => { release = resolve; }); }
    const start = r.arguments.cursor ? Number(r.arguments.cursor) : 0;
    const items = all.slice(start, start + 25), next = start + 25 < all.length ? String(start + 25) : null;
    result = { items, nextCursor: next, total: all.length };
  } else throw new Error(`Unexpected command ${r.command}`);
  return { kind: "memory_page", result };
});
const root = createRoot(fixture);
root.render(<MemoryStatusProvider><MemorySurface /></MemoryStatusProvider>);
const text = () => fixture.textContent ?? "";
const button = (label: string) => [...fixture.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === label);
const rows = () => fixture.querySelectorAll("button.qr43").length;
const title = () => document.getElementById("mem-center-title");
const search = () => fixture.querySelector<HTMLInputElement>('input[aria-label="Search memories"]')!;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function wait(p: () => boolean) { for (let n = 0; n < 250; n++) { if (p()) return; await sleep(20); } throw new Error(`UI wait timed out: ${document.activeElement?.tagName} ${text().slice(0, 300)}`); }
function check(id: string, ok: boolean) { checks.push({ id, ok }); }
async function press(label: string) { const b = button(label); if (!b || b.disabled) throw new Error(`Unavailable ${label}`); hold = true; b.focus(); b.click(); await wait(() => release != null); }
const settle = async (p: () => boolean) => { releasePending(); await wait(p); await sleep(40); };
try {
  await wait(() => rows() === 25 && !!button("Load more"));
  await press("Load more"); await settle(() => rows() === 50);
  check("load_more_with_remaining_pages_keeps_trigger_focus", document.activeElement === button("Load more"));
  await press("Load more"); await settle(() => rows() === 55 && !button("Load more"));
  check("last_page_continues_at_results_heading", document.activeElement === title());
  check("results_heading_adds_no_tab_stop", title()?.tabIndex === -1);
  await press("Refresh results"); await settle(() => rows() === 25 && button("Refresh results")?.disabled === false);
  check("refresh_returns_to_new_refresh_control", document.activeElement === button("Refresh results"));
  await press("Load more"); outside.focus(); await settle(() => rows() === 50);
  check("load_more_respects_moved_focus", document.activeElement === outside);
  await press("Refresh results"); outside.focus(); await settle(() => rows() === 25 && button("Refresh results")?.disabled === false);
  check("refresh_respects_moved_focus", document.activeElement === outside);
  search().focus(); search().form!.requestSubmit(); await wait(() => rows() === 25); await sleep(40);
  check("search_submission_keeps_search_focus", document.activeElement === search());
  const reads = calls.filter(c => c.command === "memory_list").map(c => c.args.cursor ?? "first");
  check("paging_reads_only_expected_cursors", JSON.stringify(reads) === JSON.stringify(["first", "25", "50", "first", "25", "first", "first"]));
} catch (error) { checks.push({ id: String(error), ok: false }); }
finally { releasePending(); root.unmount(); outside.remove(); document.getElementById("results")!.textContent = JSON.stringify({ checks, passed: checks.every(c => c.ok) }, null, 2); }
