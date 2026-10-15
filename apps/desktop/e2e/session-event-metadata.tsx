// Actual Sessions transcript; saved event fields and read failures are synthetic.
import { createRoot } from "react-dom/client";
import { Sessions } from "../src/memory/SessionsSurface";
import { setTransport } from "../src/memory/client";
import "../src/quiet-runtime.css";
import "../src/memory/memory.css";

const fixture = document.getElementById("fixture")!;
const checks: { id: string; ok: boolean }[] = [];
const calls: string[] = [];
let fail = false, refreshed = false;
const originalTime = "2026-10-15T00:00:01+08:00", nextTime = "2026-10-15T01:00:01+08:00";
const kinds = ["user_message", "assistant_chunk", "assistant_completed", "tool_request", "tool_result", "turn_cancelled", "turn_failed", "checkpoint_created", "provider_switched"];
const deliveries = ["not_applicable", "partial", "completed", "not_applicable", "not_applicable", "interrupted", "failed", "not_applicable", "not_applicable"];
const literal = '<img src="synthetic" onerror="not executed"> literal saved text';
setTransport(async (native, args) => {
  if (native === "memory_provider_setup") return { state: "absent" };
  if (native !== "memory_call") throw new Error(native);
  const r = args.request as { command: string; arguments: Record<string, unknown> }; calls.push(r.command);
  let result: unknown;
  if (r.command === "operation_list") result = { items: [] };
  else if (r.command === "provider_status") result = { configured: false, destinations: [], grants: [] };
  else if (r.command === "session_list") result = { items: [{ sessionId: "synthetic-session", updatedAt: originalTime, branches: [{ branchId: "synthetic-branch", lastEventSeq: 11 }] }] };
  else if (r.command === "session_detail") {
    if (fail) return { kind: "memory_error", error: { code: "storage_failed", retryable: false, rules: [] } };
    result = { ...r.arguments, transcript: [...kinds.map((kind, n) => ({ eventId: `event-${n}`, kind, deliveryState: deliveries[n], occurredAt: refreshed ? nextTime : originalTime, text: n === 0 ? literal : `Literal event ${n}` })),
      { eventId: "unknown-event", kind: "constructor", deliveryState: "private delivery text", occurredAt: "2026-10-15 (private info)", text: "Literal unknown event" },
      { eventId: "missing-time", kind: "user_message", deliveryState: "not_applicable", text: "Literal event without a time" }],
      turns: [], checkpoints: [], invocations: [], extractionJobs: [], lastSavedEventId: "missing-time" };
  } else throw new Error(`Unexpected write ${r.command}`);
  return { kind: "memory_page", result };
});
const root = createRoot(fixture); root.render(<Sessions inspect={() => { throw new Error("Unexpected navigation"); }} />);
const text = () => fixture.textContent ?? "";
const button = (label: string) => [...fixture.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === label);
const rows = () => [...fixture.querySelectorAll<HTMLElement>('.mem-transcript li')];
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function wait(p: () => boolean) { for (let n = 0; n < 250; n++) { if (p()) return; await sleep(20); } throw new Error(`UI timeout: ${text()}`); }
function check(id: string, ok: boolean) { checks.push({ id, ok }); if (!ok) throw new Error(id); }
try {
  await wait(() => !!fixture.querySelector('.mem-session-row')); fixture.querySelector<HTMLButtonElement>('.mem-session-row')!.click();
  await wait(() => rows().length === 11 && !fixture.querySelector<HTMLInputElement>('#mem-session-filter')!.disabled);
  const labels = ["User message", "Assistant response part", "Assistant response", "Tool request", "Tool result", "Turn cancelled", "Turn failed", "Checkpoint", "Provider changed"];
  check('all_known_event_kinds_have_readable_labels', labels.every((label, n) => rows()[n].querySelector('.mem-mono')!.textContent!.startsWith(label)));
  check('saved_times_keep_exact_iso_offset_in_semantic_time_elements', rows().slice(0, 9).every(row => row.querySelector('time')?.getAttribute('datetime') === originalTime && row.querySelector('time')?.title === originalTime));
  check('delivery_labels_keep_partial_complete_interrupted_and_failed_distinct', rows()[1].textContent!.includes('partial') && rows()[2].textContent!.includes('complete') && rows()[5].textContent!.includes('interrupted') && rows()[6].textContent!.includes('failed'));
  check('message_bytes_stay_literal_without_html_interpretation', rows()[0].textContent!.includes(literal) && !fixture.querySelector('img') && rows().slice(1, 9).every((row, n) => row.textContent!.includes(`Literal event ${n + 1}`)));
  check('unknown_metadata_uses_fixed_fallback_without_raw_private_fields', rows()[9].textContent!.includes('Recorded event') && rows()[9].textContent!.includes('delivery unavailable') && rows()[9].textContent!.includes('time unavailable') && !text().includes('private') && !rows()[9].querySelector('time'));
  check('missing_time_does_not_invent_a_current_timestamp', rows()[10].textContent!.includes('time unavailable') && !rows()[10].querySelector('time'));
  const draft = fixture.querySelector<HTMLTextAreaElement>('#mem-ask')!;
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(draft, 'Unsent retained question'); draft.dispatchEvent(new Event('input', { bubbles: true })); await sleep(20);
  fail = true; refreshed = true; button('Refresh saved session')!.click(); await wait(() => !!button('Read session again'));
  check('failed_refresh_keeps_previous_saved_metadata_and_draft', rows()[0].querySelector('time')!.getAttribute('datetime') === originalTime && draft.value === 'Unsent retained question' && text().includes('previous successful read'));
  fail = false; button('Read session again')!.click(); await wait(() => rows()[0].querySelector('time')!.getAttribute('datetime') === nextTime);
  check('fresh_observation_updates_time_without_rewriting_message_or_draft', rows()[0].textContent!.includes(literal) && draft.value === 'Unsent retained question');
  check('event_presentation_uses_existing_reads_only', calls.every(c => ['operation_list', 'provider_status', 'session_list', 'session_detail'].includes(c)));
} catch (error) { checks.push({ id: String(error), ok: false }); }
finally { root.unmount(); document.getElementById('results')!.textContent = JSON.stringify({ checks, passed: checks.every(c => c.ok), calls }, null, 2); }
