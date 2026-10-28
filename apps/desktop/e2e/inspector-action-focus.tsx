// The actual approved-memory inspector with synthetic replies. Chromium/WebView2 moves focus from a
// control that becomes disabled to the document (Keyboard-journey-v1); Happy DOM does not, so this
// fixture applies only that platform focus fixup while an action is pending.
import { createRoot } from "react-dom/client";
import { act } from "react";
import { MemoryDetail } from "../src/memory/MemorySurface";
import { MemoryStatusProvider } from "../src/memory/status";
import { setTransport } from "../src/memory/client";
import "../src/quiet-runtime.css";
import "../src/memory/memory.css";

const fixture = document.getElementById("fixture")!;
const outside = document.createElement("input"); document.body.appendChild(outside);
const checks: { id: string; ok: boolean }[] = [];
const calls: string[] = [];
let hold = false, release: (() => void) | null = null;
const releasePending = () => { const resolve = release; release = null; resolve?.(); };
setTransport(async (native, args) => {
  if (native === "shell_status") return { vaultChanging: false };
  if (native !== "memory_call") throw new Error(`Unexpected native ${native}`);
  const r = args.request as { command: string; arguments: Record<string, unknown> };
  calls.push(r.command); let result: unknown;
  if (r.command !== "workspace_status" && hold) { hold = false; await new Promise<void>(resolve => { release = resolve; }); }
  if (r.command === "workspace_status") result = { vault: { state: "open" }, pendingCandidates: 0 };
  else if (r.command === "memory_read") result = {
    record: { memory_id: "synthetic-memory", revision: 1, content: "Saved synthetic memory", approved_at: "2026-10-13T00:00:00Z", supersedes: [] },
    summary: { memoryId: "synthetic-memory", status: "active", type: "fact", expired: false, conflicted: false, sourceMissing: false },
    evidence: [], supersededBy: [],
  };
  else if (r.command === "correction_propose") result = { candidateId: "synthetic-candidate" };
  else if (r.command === "delete_preview") result = { targets: ["synthetic-memory"], objectCount: 1, losingProvenance: [] };
  else throw new Error(`Unexpected command ${r.command}`);
  return { kind: "memory_page", result };
});
const root = createRoot(fixture);
// Flush initial read effects before the first synthetic click can arm focus
// restoration. DOM readiness alone can precede those passive effects.
const reactTest = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousActEnvironment = reactTest.IS_REACT_ACT_ENVIRONMENT;
reactTest.IS_REACT_ACT_ENVIRONMENT = true;
try {
  await act(async () => {
    root.render(<MemoryStatusProvider><MemoryDetail id="synthetic-memory" onChanged={() => {}} /></MemoryStatusProvider>);
  });
} finally { reactTest.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment; }
const text = () => fixture.textContent ?? "";
const button = (label: string) => [...fixture.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === label);
const correction = () => fixture.querySelector<HTMLTextAreaElement>("#mem-fix");
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
const ready = () => !!button("Delete impact") && button("Read memory again")?.disabled === false && button("Delete impact")?.disabled === false;
function edit(value: string) {
  const input = correction()!;
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true }));
}
try {
  await wait(ready);
  await begin("Read memory again");
  check("platform_blur_reaches_document_while_pending", document.activeElement === document.body);
  await settle(() => ready() && document.activeElement === button("Read memory again"));
  check("reread_returns_to_read_control", document.activeElement === button("Read memory again"));
  await begin("Delete impact"); await settle(() => ready() && text().includes("A purge removes"));
  check("delete_impact_returns_to_its_control", document.activeElement === button("Delete impact"));
  edit("Corrected synthetic content"); await sleep(30);
  await begin("Propose correction"); await settle(() => ready() && text().includes("Correction proposed."));
  check("proposed_correction_continues_in_empty_correction_field", document.activeElement === correction() && correction()?.value === "");
  await begin("Delete impact"); outside.focus(); await settle(() => ready());
  check("inspector_action_respects_moved_focus", document.activeElement === outside);
  await begin("Read memory again"); root.unmount(); releasePending(); await sleep(40);
  check("unmount_discards_pending_focus", document.activeElement === document.body);
  check("inspector_issues_only_requested_commands", calls.filter(c => c !== "workspace_status").join() === "memory_read,memory_read,delete_preview,correction_propose,delete_preview,memory_read");
} catch (error) { checks.push({ id: String(error), ok: false }); }
finally { releasePending(); root.unmount(); outside.remove(); document.getElementById("results")!.textContent = JSON.stringify({ checks, passed: checks.every(c => c.ok) }, null, 2); }
