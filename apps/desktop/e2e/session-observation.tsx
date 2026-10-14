// Actual Sessions parent; all saved records and failures are synthetic.
import { createRoot } from "react-dom/client";
import { Sessions } from "../src/memory/SessionsSurface";
import { setTransport } from "../src/memory/client";
import "../src/quiet-runtime.css";
import "../src/memory/memory.css";

const fixture = document.getElementById("fixture")!;
const checks: { id: string; ok: boolean }[] = [];
const calls: { command: string; args: Record<string, unknown> }[] = [];
let wrong: "session" | "branch" | "missing" | null = "session";
let revision = 1;
setTransport(async (native, args) => {
  if (native === "memory_provider_setup") return { state: "absent" };
  if (native !== "memory_call") throw new Error(`Unexpected native command ${native}`);
  const r = args.request as { command: string; arguments: Record<string, unknown> };
  calls.push({ command: r.command, args: r.arguments }); let result: unknown;
  switch (r.command) {
    case "operation_list": result = { items: [] }; break;
    case "provider_status": result = { configured: false, destinations: [], grants: [] }; break;
    case "session_list": result = { items: ["one", "two"].map(n => ({ sessionId: `session-${n}`, updatedAt: "2026-10-14T00:00:00Z", branches: [{ branchId: `branch-${n}`, lastEventSeq: 1 }] })) }; break;
    case "session_detail": result = {
      sessionId: wrong === "missing" ? undefined : wrong === "session" ? "other-session" : r.arguments.sessionId,
      branchId: wrong === "missing" ? undefined : wrong === "branch" ? "other-branch" : r.arguments.branchId,
      transcript: [{ eventId: `event-${revision}`, kind: "user_message", deliveryState: "saved", text: `Saved ${r.arguments.sessionId} transcript r${revision}` }],
      turns: [], checkpoints: [], invocations: [], extractionJobs: [], lastSavedEventId: `event-${revision}`,
    }; break;
    default: throw new Error(`Unexpected mutation ${r.command}`);
  }
  return { kind: "memory_page", result, error: null };
});
const root = createRoot(fixture); root.render(<Sessions inspect={() => { throw new Error("Unexpected context navigation"); }} />);
const text = () => fixture.textContent ?? "";
const button = (label: string) => [...fixture.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === label);
const row = (n: string) => fixture.querySelector<HTMLButtonElement>(`button[title="session-${n} · branch-${n}"]`)!;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function wait(p: () => boolean) { for (let n = 0; n < 250; n++) { if (p()) return; await sleep(20); } throw new Error(`UI wait timed out: ${text()}`); }
function check(id: string, ok: boolean) { checks.push({ id, ok }); if (!ok) throw new Error(id); }
function click(label: string) { const b = button(label); if (!b || b.disabled) throw new Error(`Unavailable ${label}`); b.click(); }
function edit(selector: string, value: string, prototype: object) {
  const input = fixture.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
  Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
async function settled() { await sleep(30); await wait(() => button("Read session again")?.disabled === false || button("Refresh saved session")?.disabled === false); }
const question = () => fixture.querySelector<HTMLTextAreaElement>("#mem-ask");
const checkpoint = () => fixture.querySelector<HTMLInputElement>("#mem-cp");
try {
  await wait(() => !!row("one")); row("one").click(); await settled();
  check("wrong_session_cannot_publish_or_enable_writes", !text().includes("Saved session-one transcript") && !question() && button("New session")!.disabled && !!button("Read session again"));
  for (const mode of ["branch", "missing"] as const) {
    wrong = mode; click("Read session again"); await settled();
    check(`wrong_${mode}_cannot_publish_or_enable_writes`, !question() && button("New session")!.disabled && !!fixture.querySelector('[role="alert"]'));
  }
  wrong = null; click("Read session again"); await wait(() => !!question() && !question()!.disabled);
  check("valid_identity_recovers_requested_branch", row("one").getAttribute("aria-pressed") === "true" && text().includes("Saved session-one transcript r1"));
  edit("#mem-ask", "Unsent question for one", HTMLTextAreaElement.prototype);
  edit("#mem-cp", "Unsent checkpoint for one", HTMLInputElement.prototype); await sleep(30);
  revision = 2; wrong = "branch"; click("Refresh saved session"); await settled();
  check("failed_replacement_retains_only_labeled_prior_transcript", text().includes("Saved session-one transcript r1") && !text().includes("transcript r2") && text().includes("previous successful read"));
  check("failed_replacement_preserves_drafts_and_blocks_writes", question()!.value === "Unsent question for one" && checkpoint()!.value === "Unsent checkpoint for one" && button("Send")!.disabled && button("Save checkpoint")!.disabled && button("New session")!.disabled);
  wrong = null; click("Read session again"); await wait(() => text().includes("Saved session-one transcript r2") && !question()!.disabled);
  check("refresh_recovers_both_drafts_without_replay", question()!.value === "Unsent question for one" && checkpoint()!.value === "Unsent checkpoint for one" && !button("Send")!.disabled && !button("Save checkpoint")!.disabled);
  wrong = "session"; row("two").click(); await settled();
  check("wrong_switch_keeps_previous_branch_and_drafts", row("one").getAttribute("aria-pressed") === "true" && row("two").getAttribute("aria-pressed") === "false" && !text().includes("Saved session-two transcript") && question()!.value === "Unsent question for one" && button("Send")!.disabled);
  wrong = null; click("Read session again"); await wait(() => row("two").getAttribute("aria-pressed") === "true" && !question()!.disabled);
  check("switch_recovery_reads_requested_owner_with_separate_drafts", text().includes("Saved session-two transcript r2") && question()!.value === "" && checkpoint()!.value === "" && calls.filter(c => c.command === "session_detail").at(-1)!.args.sessionId === "session-two");
  row("one").click(); await wait(() => row("one").getAttribute("aria-pressed") === "true" && !question()!.disabled);
  check("original_branch_restores_both_drafts", question()!.value === "Unsent question for one" && checkpoint()!.value === "Unsent checkpoint for one");
  check("all_recovery_is_read_only", calls.every(c => ["operation_list", "provider_status", "session_list", "session_detail"].includes(c.command)));
} catch (error) { checks.push({ id: String(error), ok: false }); }
finally { root.unmount(); document.getElementById("results")!.textContent = JSON.stringify({ checks, passed: checks.every(c => c.ok), calls }, null, 2); }
