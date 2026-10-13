// Candidate pages and read failures are synthetic, not storage recovery.
import { createRoot } from "react-dom/client";
import { Inbox } from "../src/memory/MemorySurface";
import { MemoryStatusProvider } from "../src/memory/status";
import { setTransport } from "../src/memory/client";
import "../src/quiet-runtime.css";
import "../src/memory/memory.css";

const fixture = document.getElementById("fixture")!;
const checks: { id: string; ok: boolean }[] = [];
const calls: { command: string; args: Record<string, unknown> }[] = [];
let releasePage: (() => void) | null = null;
const releasePending = () => releasePage?.();
let stale = true;
let failRefresh = false;
let initialFailure = false;
let revision = 1;
const candidate = (n: number) => ({ candidateId: `synthetic-candidate-${n}`, revision, content: `Synthetic proposal ${n} r${revision}`, proposalKind: "create", proposedType: "fact", sensitivity: "normal", originKind: "extraction", createdAt: "2026-10-13T00:00:00Z", evidence: [], conflicts: [], target: null });
const failure = (rule: string) => ({ kind: "memory_error", error: { code: "revision_conflict", retryable: false, rules: [rule] } });
setTransport(async (native, args) => {
  if (native === "shell_status") return { vaultChanging: false };
  if (native !== "memory_call") throw new Error(`Unexpected native command ${native}`);
  const r = args.request as { command: string; arguments: Record<string, unknown> };
  calls.push({ command: r.command, args: r.arguments });
  if (r.command === "workspace_status") return { kind: "memory_page", result: { vault: { state: "open" }, pendingCandidates: 51 }, error: null };
  if (r.command !== "candidate_list") throw new Error(`Unexpected mutation ${r.command}`);
  if (r.arguments.limit !== 50) throw new Error("Candidate pages must stay bounded");
  if (r.arguments.cursor != null) {
    if (r.arguments.cursor !== `synthetic-cursor-r${revision}`) throw new Error("Wrong cursor");
    await new Promise<void>(resolve => { releasePage = resolve; });
    if (stale) return failure("workspace.cursor_stale");
    return { kind: "memory_page", result: { items: [candidate(50)], nextCursor: null, total: 51 }, error: null };
  }
  if (failRefresh || initialFailure) return failure("fixture.read_failed");
  return { kind: "memory_page", result: { items: Array.from({ length: 50 }, (_, n) => candidate(n)), nextCursor: `synthetic-cursor-r${revision}`, total: 51 }, error: null };
});
let root = createRoot(fixture);
const render = () => root.render(<MemoryStatusProvider><Inbox /></MemoryStatusProvider>);
const text = () => fixture.textContent ?? "";
const button = (label: string) => [...fixture.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === label);
const rows = () => fixture.querySelectorAll("article.mem-candidate");
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function wait(p: () => boolean) { for (let n = 0; n < 250; n++) { if (p()) return; await sleep(20); } throw new Error(`UI wait timed out: ${text().slice(-500)}`); }
function check(id: string, ok: boolean) { checks.push({ id, ok }); if (!ok) throw new Error(id); }
function click(label: string) { const b = button(label); if (!b || b.disabled) throw new Error(`Unavailable ${label}`); b.focus(); b.click(); }
function edit(selector: string, value: string) {
  const input = fixture.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
  Object.getOwnPropertyDescriptor(input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
try {
  render(); await wait(() => rows().length === 50);
  check("first_page_offers_remaining_candidates", !!button("Load more candidates") && text().includes("51 waiting") && text().includes("50 shown"));
  edit("article textarea", "Unsent candidate correction"); edit("#mem-remember", "Unsent statement"); edit("#mem-claim", "fixture.unsent"); await sleep(30);
  click("Load more candidates"); await wait(() => releasePage != null); await sleep(30);
  check("pending_page_preserves_rows_and_blocks_writes", rows().length === 50 && button("Accept with edits…")!.disabled && button("Save as candidate")!.disabled && button("Refresh candidates")!.disabled);
  releasePending(); await wait(() => !!fixture.querySelector('[role="alert"]'));
  check("stale_cursor_retains_observation_without_empty_claim", rows().length === 50 && text().includes("Previous candidate observation") && !text().includes("Nothing waiting for review"));
  check("stale_cursor_requires_refresh_before_writes", button("Load more candidates")!.disabled && button("Accept with edits…")!.disabled && button("Save as candidate")!.disabled && !button("Refresh candidates")!.disabled);
  const beforeRefresh = calls.length; failRefresh = true; click("Refresh candidates"); await sleep(60);
  check("failed_first_page_refresh_keeps_drafts", rows().length === 50 && fixture.querySelector<HTMLTextAreaElement>("article textarea")!.value === "Unsent candidate correction" && fixture.querySelector<HTMLTextAreaElement>("#mem-remember")!.value === "Unsent statement");
  failRefresh = false; stale = false; revision = 2; click("Refresh candidates"); await wait(() => !fixture.querySelector('[role="alert"]') && !button("Refresh candidates")!.disabled);
  check("refresh_restarts_without_appending_old_rows", rows().length === 50 && calls.slice(beforeRefresh).filter(c => c.command === "candidate_list").every(c => c.args.cursor === null));
  check("successful_refresh_preserves_both_unsent_drafts", fixture.querySelector<HTMLTextAreaElement>("article textarea")!.value === "Unsent candidate correction" && fixture.querySelector<HTMLInputElement>("#mem-claim")!.value === "fixture.unsent");
  releasePage = null; click("Load more candidates"); await wait(() => releasePage != null); releasePending(); await wait(() => rows().length === 51);
  check("last_page_appends_without_duplicate_candidates", new Set([...rows()].map(r => r.getAttribute("aria-label"))).size === 51 && !button("Load more candidates") && text().includes("51 shown"));
  await wait(() => document.activeElement === fixture.querySelector("#mem-center-title"));
  check("last_page_keeps_keyboard_focus_in_inbox", document.activeElement === fixture.querySelector("#mem-center-title"));
  check("pagination_starts_no_review_or_remember", calls.every(c => ["candidate_list", "workspace_status"].includes(c.command)));

  root.unmount(); root = createRoot(fixture); initialFailure = true; render(); await wait(() => !!fixture.querySelector('[role="alert"]'));
  check("initial_nonretryable_read_has_explicit_recovery", !!button("Refresh candidates") && !button("Refresh candidates")!.disabled && text().includes("Candidates unavailable") && !text().includes("0 waiting") && !text().includes("Nothing waiting for review"));
  initialFailure = false; click("Refresh candidates"); await wait(() => rows().length === 50);
  check("explicit_read_recovers_initial_failure", !fixture.querySelector('[role="alert"]') && !!button("Load more candidates"));
} catch (error) { checks.push({ id: String(error), ok: false }); }
finally { releasePending(); root.unmount(); document.getElementById("results")!.textContent = JSON.stringify({ checks, passed: checks.every(c => c.ok), calls }, null, 2); }
