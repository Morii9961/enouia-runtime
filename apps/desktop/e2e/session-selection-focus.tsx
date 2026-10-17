// Real Sessions with synthetic reads. Chromium/WebView2 moves focus from a control that becomes
// disabled to the document (observed natively in Keyboard-journey-v1); Happy DOM does not, so this
// fixture reproduces only that platform blur and never changes component behavior.
import { createRoot } from "react-dom/client";
import { Sessions } from "../src/memory/SessionsSurface";
import { setTransport } from "../src/memory/client";
import "../src/quiet-runtime.css";
import "../src/memory/memory.css";

const fixture = document.getElementById("fixture")!;
const outside = document.createElement("input"); document.body.appendChild(outside);
const checks: { id: string; ok: boolean }[] = [];
const calls: { command: string; args: Record<string, unknown> }[] = [];
let hold = false, release: (() => void) | null = null;
const releasePending = () => { const resolve = release; release = null; resolve?.(); };
// Chromium's focus fixup: a focused control that has become disabled loses focus to the document.
const focusFixup = () => {
  if (!(document.activeElement as HTMLButtonElement | null)?.disabled) return;
  // Happy DOM ignores blur() on a disabled control; removing a focused stand-in leaves the document focused.
  const standIn = document.createElement("span"); standIn.tabIndex = -1; document.body.appendChild(standIn); standIn.focus(); standIn.remove();
};
setTransport(async (native, args) => {
  if (native === "memory_provider_setup") return { state: "absent" };
  if (native !== "memory_call") throw new Error(native);
  const r = args.request as { command: string; arguments: Record<string, unknown> }; calls.push({ command: r.command, args: r.arguments });
  let result: unknown;
  if (["session_list", "session_detail"].includes(r.command) && hold) { hold = false; await new Promise<void>(resolve => { release = resolve; }); }
  if (r.command === "operation_list") result = { items: [] };
  else if (r.command === "provider_status") result = { configured: false, destinations: [], grants: [] };
  else if (r.command === "session_list") result = { items: [
    { sessionId: "ses_one", updatedAt: "2026-10-15T00:00:00Z", branches: [{ branchId: "br_one", lastEventSeq: 1 }] },
    { sessionId: "ses_two", updatedAt: "2026-10-14T00:00:00Z", branches: [{ branchId: "br_two", lastEventSeq: 1 }] }] };
  else if (r.command === "session_detail") result = { ...r.arguments, transcript: [{ eventId: `evt_${r.arguments.sessionId}`, kind: "user_message", deliveryState: "not_applicable", text: `Saved ${r.arguments.sessionId}` }],
    turns: [], checkpoints: [], invocations: [], extractionJobs: [], lastSavedEventId: `evt_${r.arguments.sessionId}` };
  else throw new Error(`Unexpected command ${r.command}`);
  return { kind: "memory_page", result };
});
const root = createRoot(fixture); root.render(<Sessions inspect={() => { throw new Error("Unexpected navigation"); }} />);
const text = () => fixture.textContent ?? "";
const row = (sessionId: string) => [...fixture.querySelectorAll<HTMLButtonElement>(".mem-session-row")].find(b => b.title.startsWith(sessionId));
const button = (label: string) => [...fixture.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === label);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function wait(p: () => boolean) { for (let n = 0; n < 250; n++) { if (p()) return; await sleep(20); } throw new Error(`UI timeout: ${document.activeElement?.tagName} ${text().slice(0, 300)}`); }
function check(id: string, ok: boolean) { checks.push({ id, ok }); }
async function begin(control: HTMLButtonElement | undefined) { if (!control || control.disabled) throw new Error("Unavailable control"); hold = true; control.focus(); control.click(); await wait(() => release != null); await sleep(20); focusFixup(); }
const settle = async (p: () => boolean) => { releasePending(); await wait(p); await sleep(40); };
try {
  await wait(() => !!row("ses_one") && !!row("ses_two"));
  await begin(row("ses_one"));
  check("platform_blur_reaches_document_while_reading", document.activeElement === document.body);
  await settle(() => text().includes("Saved ses_one") && row("ses_one")?.disabled === false);
  check("selected_row_regains_focus_after_read", document.activeElement === row("ses_one"));
  await begin(button("Refresh saved session")); await settle(() => button("Refresh saved session")?.disabled === false);
  check("session_refresh_regains_focus", document.activeElement === button("Refresh saved session"));
  await begin(button("Refresh session list")); await settle(() => button("Refresh session list")?.disabled === false);
  check("list_refresh_regains_focus", document.activeElement === button("Refresh session list"));
  await begin(row("ses_two")); outside.focus(); await settle(() => text().includes("Saved ses_two") && row("ses_two")?.disabled === false);
  check("selection_respects_moved_focus", document.activeElement === outside);
  await begin(row("ses_one")); root.unmount(); releasePending(); await sleep(40);
  check("unmount_discards_pending_focus", document.activeElement === document.body);
  check("selection_issues_only_reads", calls.every(c => ["session_list", "session_detail", "operation_list", "provider_status"].includes(c.command)));
} catch (error) { checks.push({ id: String(error), ok: false }); }
finally { releasePending(); root.unmount(); outside.remove(); document.getElementById("results")!.textContent = JSON.stringify({ checks, passed: checks.every(c => c.ok) }, null, 2); }
