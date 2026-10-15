// Real Sessions UI; bounded, stale and empty observations are synthetic.
import { createRoot } from "react-dom/client";
import { Sessions } from "../src/memory/SessionsSurface";
import { setTransport } from "../src/memory/client";
import "../src/quiet-runtime.css";
import "../src/memory/memory.css";

const fixture = document.getElementById("fixture")!;
const checks: { id: string; ok: boolean }[] = [];
const calls: string[] = [];
let count = 200, fail = false;
setTransport(async (native, args) => {
  if (native === "memory_provider_setup") return { state: "absent" };
  if (native !== "memory_call") throw new Error(native);
  const r = args.request as { command: string; arguments: Record<string, unknown> }; calls.push(r.command);
  let result: unknown;
  if (r.command === "operation_list") result = { items: [] };
  else if (r.command === "provider_status") result = { configured: false, destinations: [], grants: [] };
  else if (r.command === "session_list") result = { items: [{ sessionId: "synthetic-session", updatedAt: "2026-10-15T00:00:00Z", branches: [{ branchId: "synthetic-branch", lastEventSeq: 250 }] }] };
  else if (r.command === "session_detail") {
    if (fail) return { kind: "memory_error", error: { code: "storage_failed", retryable: false, rules: [] } };
    result = { sessionId: r.arguments.sessionId, branchId: r.arguments.branchId,
      transcript: Array.from({ length: count }, (_, n) => ({ eventId: `synthetic-event-${n}`, sequence: 51 + n, kind: "user_message", deliveryState: "not_applicable", text: `Literal saved event ${n}` })),
      turns: [], checkpoints: [], invocations: [], extractionJobs: [], lastSavedEventId: count ? `synthetic-event-${count - 1}` : null };
  } else throw new Error(`Unexpected write ${r.command}`);
  return { kind: "memory_page", result };
});
const root = createRoot(fixture); root.render(<Sessions inspect={() => { throw new Error("Unexpected navigation"); }} />);
const text = () => fixture.textContent ?? "";
const button = (label: string) => [...fixture.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === label);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function wait(p: () => boolean) { for (let n = 0; n < 250; n++) { if (p()) return; await sleep(20); } throw new Error(`UI timeout: ${text()}`); }
function check(id: string, ok: boolean) { checks.push({ id, ok }); if (!ok) throw new Error(id); }
try {
  await wait(() => !!fixture.querySelector('.mem-session-row'));
  fixture.querySelector<HTMLButtonElement>('.mem-session-row')!.click();
  await wait(() => !!fixture.querySelector('#mem-transcript-bound'));
  check("full_bounded_page_names_limit_without_claiming_deleted_history", text().includes("up to 200 most recent saved events") && text().includes("Older events may be outside this view"));
  check("visible_events_remain_literal_and_ordered", fixture.querySelectorAll('.mem-transcript li').length === 200 && fixture.querySelector('.mem-transcript li')!.textContent!.includes("Literal saved event 0") && fixture.querySelector('.mem-transcript li:last-child')!.textContent!.includes("Literal saved event 199"));
  check("list_is_described_by_its_read_boundary", fixture.querySelector('.mem-transcript')!.getAttribute('aria-describedby') === 'mem-transcript-bound');
  fail = true; button("Refresh saved session")!.click(); await wait(() => !!button("Read session again"));
  check("failed_replacement_keeps_bound_and_marks_previous_observation", !!fixture.querySelector('#mem-transcript-bound') && text().includes("previous successful read") && fixture.querySelectorAll('.mem-transcript li').length === 200);
  fail = false; count = 1; button("Read session again")!.click(); await wait(() => fixture.querySelectorAll('.mem-transcript li').length === 1);
  check("short_fresh_page_does_not_claim_older_omission", !fixture.querySelector('#mem-transcript-bound') && !fixture.querySelector('.mem-transcript')!.hasAttribute('aria-describedby'));
  count = 0; button("Refresh saved session")!.click(); await wait(() => fixture.querySelectorAll('.mem-transcript li').length === 0);
  check("empty_observation_keeps_boundary_absent", !fixture.querySelector('#mem-transcript-bound') && text().includes("last saved event none"));
  check("boundary_display_only_reads_existing_commands", calls.every(c => ["operation_list", "provider_status", "session_list", "session_detail"].includes(c)));
} catch (error) { checks.push({ id: String(error), ok: false }); }
finally { root.unmount(); document.getElementById("results")!.textContent = JSON.stringify({ checks, passed: checks.every(c => c.ok), calls }, null, 2); }
