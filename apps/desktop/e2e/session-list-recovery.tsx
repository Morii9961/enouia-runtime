// The actual Sessions parent with controlled list failures and a held Mock write.
import { createRoot } from "react-dom/client";
import { Sessions } from "../src/memory/SessionsSurface";
import { setTransport } from "../src/memory/client";
import "../src/quiet-runtime.css";
import "../src/memory/memory.css";

const fixture = document.getElementById("fixture")!;
const checks: { id: string; ok: boolean }[] = [];
const calls: { command: string; args: Record<string, unknown> }[] = [];
let failList = true;
let rows = ["one"];
let releaseSend: (() => void) | null = null;
const releasePending = () => releaseSend?.();
setTransport(async (native, args) => {
  if (native === "memory_provider_setup") return { state: "absent" };
  if (native !== "memory_call") throw new Error(`Unexpected native command ${native}`);
  const r = args.request as { command: string; arguments: Record<string, unknown> };
  calls.push({ command: r.command, args: r.arguments }); let result: unknown;
  switch (r.command) {
    case "operation_list": result = { items: [] }; break;
    case "provider_status": result = { configured: false, destinations: [], grants: [] }; break;
    case "session_list":
      if (failList) return { kind: "memory_error", error: { code: "storage_failed", retryable: false, rules: [] } };
      result = { items: rows.map(n => ({ sessionId: `session-${n}`, updatedAt: "2026-10-14T00:00:00Z", branches: [{ branchId: `branch-${n}`, lastEventSeq: 1 }] })) }; break;
    case "session_detail": result = { ...r.arguments, transcript: [{ eventId: "saved-event", kind: "user_message", deliveryState: "saved", text: "Previously saved session text" }], turns: [], checkpoints: [], invocations: [], extractionJobs: [], lastSavedEventId: "saved-event" }; break;
    case "session_ask":
      await new Promise<void>(resolve => { releaseSend = resolve; });
      result = { status: "supported_evidence", statements: ["Synthetic Mock answer"], sources: [], capsuleId: "synthetic-capsule" }; break;
    default: throw new Error(`Unexpected mutation ${r.command}`);
  }
  return { kind: "memory_page", result, error: null };
});
const root = createRoot(fixture); root.render(<Sessions inspect={() => {}} />);
const text = () => fixture.textContent ?? "";
const button = (label: string) => [...fixture.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === label);
const sessionRow = (n: string) => fixture.querySelector<HTMLButtonElement>(`button[title="session-${n} · branch-${n}"]`);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function wait(p: () => boolean) { for (let n = 0; n < 250; n++) { if (p()) return; await sleep(20); } throw new Error(`UI wait timed out: ${text()}`); }
function check(id: string, ok: boolean) { checks.push({ id, ok }); if (!ok) throw new Error(id); }
function click(label: string) { const b = button(label); if (!b || b.disabled) throw new Error(`Unavailable ${label}`); b.click(); }
function edit(selector: string, value: string, prototype: object) {
  const input = fixture.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
  Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true }));
}
const question = () => fixture.querySelector<HTMLTextAreaElement>("#mem-ask")!;
const checkpoint = () => fixture.querySelector<HTMLInputElement>("#mem-cp")!;
try {
  await wait(() => !!fixture.querySelector('[role="alert"]'));
  check("initial_nonretryable_list_failure_has_read_recovery", !!button("Read session list again") && !text().includes("No sessions yet") && !sessionRow("one"));
  failList = false; click("Read session list again"); await wait(() => !!sessionRow("one"));
  check("recovery_reads_without_creating_session", !fixture.querySelector('[role="alert"]') && calls.every(c => ["session_list", "operation_list"].includes(c.command)));
  sessionRow("one")!.click(); await wait(() => !!question() && !question().disabled);
  edit("#mem-ask", "Unsent question", HTMLTextAreaElement.prototype); edit("#mem-cp", "Unsent checkpoint", HTMLInputElement.prototype); await sleep(30);
  failList = true; click("Refresh session list"); await wait(() => !!button("Read session list again") && !button("Read session list again")!.disabled);
  check("failed_list_refresh_labels_previous_rows", !!sessionRow("one") && text().includes("previous successful list read"));
  check("list_failure_keeps_observed_transcript_and_drafts", text().includes("Previously saved session text") && question().value === "Unsent question" && checkpoint().value === "Unsent checkpoint" && sessionRow("one")!.getAttribute("aria-pressed") === "true");
  check("list_failure_does_not_invalidate_valid_selected_detail", !button("Send")!.disabled && !button("Save checkpoint")!.disabled && !button("Read session again"));
  failList = false; rows = ["one", "two"]; click("Read session list again"); await wait(() => !!sessionRow("two"));
  check("fresh_list_adds_rows_without_switching_or_clearing_drafts", sessionRow("one")!.getAttribute("aria-pressed") === "true" && sessionRow("two")!.getAttribute("aria-pressed") === "false" && question().value === "Unsent question" && checkpoint().value === "Unsent checkpoint" && !text().includes("previous successful list read"));
  rows = []; click("Refresh session list"); await wait(() => text().includes("No sessions yet"));
  check("observed_empty_list_is_distinct_from_unknown", !sessionRow("one") && !fixture.querySelector('[role="alert"]') && text().includes("Previously saved session text") && question().value === "Unsent question");
  check("all_list_recovery_is_read_only", calls.every(c => ["session_list", "session_detail", "operation_list", "provider_status"].includes(c.command)));
  rows = ["one"]; click("Refresh session list"); await wait(() => !!sessionRow("one")); click("Send"); await wait(() => releaseSend != null); await sleep(30);
  check("list_refresh_is_withheld_during_session_write", button("Refresh session list")!.disabled && sessionRow("one")!.disabled && button("New session")!.disabled);
  const listsBefore = calls.filter(c => c.command === "session_list").length; button("Refresh session list")!.click(); await sleep(30);
  check("disabled_list_refresh_submits_no_read", calls.filter(c => c.command === "session_list").length === listsBefore);
  releasePending(); await wait(() => !button("Refresh session list")!.disabled && text().includes("Synthetic Mock answer"));
  check("only_explicit_mock_write_occurs", calls.filter(c => c.command === "session_ask").length === 1 && calls.filter(c => c.command === "session_ask")[0].args.sessionId === "session-one" && checkpoint().value === "Unsent checkpoint");
} catch (error) { checks.push({ id: String(error), ok: false }); }
finally { releasePending(); root.unmount(); document.getElementById("results")!.textContent = JSON.stringify({ checks, passed: checks.every(c => c.ok), calls }, null, 2); }
