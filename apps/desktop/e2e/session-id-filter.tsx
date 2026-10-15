// Real Sessions and saved-job recovery. Filtering itself issues no IPC.
import { createRoot } from "react-dom/client";
import { Sessions } from "../src/memory/SessionsSurface";
import { setTransport } from "../src/memory/client";
import "../src/quiet-runtime.css";
import "../src/memory/memory.css";

const fixture = document.getElementById("fixture")!;
const checks: { id: string; ok: boolean }[] = [];
const calls: { command: string; args: Record<string, unknown> }[] = [];
let releaseList: (() => void) | null = null, releaseDetail: (() => void) | null = null;
const releasePending = () => { releaseList?.(); releaseDetail?.(); };
let initial = true, failList = false, hideSource = false, holdDetail = false;
const job = { run_id: "synthetic-run", input_event_id: "synthetic-input", state: "completed", cursor: 0, candidates: [] };
setTransport(async (native, args) => {
  if (native === "memory_provider_setup") return { state: "absent" };
  if (native !== "memory_call") throw new Error(native);
  const r = args.request as { command: string; arguments: Record<string, unknown> }; calls.push({ command: r.command, args: r.arguments });
  let result: unknown;
  if (r.command === "operation_list") result = { items: [] };
  else if (r.command === "provider_status") result = { configured: false, destinations: [], grants: [] };
  else if (r.command === "session_list") {
    if (initial) { initial = false; await new Promise<void>(resolve => { releaseList = resolve; }); }
    if (failList) return { kind: "memory_error", error: { code: "storage_failed", retryable: false, rules: [] } };
    result = { items: [...(hideSource ? [] : [{ sessionId: "ses_source", updatedAt: "2026-10-15T00:00:00Z", branches: ["br_source", "br_sibling"].map(branchId => ({ branchId, lastEventSeq: 1 })) }]),
      { sessionId: "ses_other", updatedAt: "2026-10-14T00:00:00Z", branches: [{ branchId: "br_other", lastEventSeq: 1 }] }] };
  } else if (r.command === "session_detail") {
    if (holdDetail) { holdDetail = false; await new Promise<void>(resolve => { releaseDetail = resolve; }); }
    result = { ...r.arguments, transcript: [{ eventId: "synthetic-event", kind: "user_message", deliveryState: "not_applicable", text: `Saved ${r.arguments.sessionId}` }],
      turns: [], checkpoints: [], invocations: [], extractionJobs: r.arguments.sessionId === "ses_source" ? [job] : [], lastSavedEventId: "synthetic-event" };
  } else if (r.command === "extraction_preview") result = { job, items: [] };
  else throw new Error(`Unexpected mutation ${r.command}`);
  return { kind: "memory_page", result };
});
const root = createRoot(fixture); root.render(<Sessions inspect={() => { throw new Error("Unexpected navigation"); }} />);
const text = () => fixture.textContent ?? "";
const input = () => fixture.querySelector<HTMLInputElement>('#mem-session-filter')!;
const rows = () => [...fixture.querySelectorAll<HTMLButtonElement>('.mem-session-row')];
const row = (title: string) => rows().find(b => b.title === title)!;
const button = (label: string) => [...fixture.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === label);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function wait(p: () => boolean) { for (let n = 0; n < 250; n++) { if (p()) return; await sleep(20); } throw new Error(`UI timeout: ${text()}`); }
function edit(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
}
function check(id: string, ok: boolean) { checks.push({ id, ok }); if (!ok) throw new Error(id); }
try {
  await wait(() => releaseList != null);
  check('unobserved_list_keeps_filter_disabled_and_unknown', input().disabled && text().includes('Reading sessions') && !text().includes('No sessions yet'));
  releaseList!(); await wait(() => rows().length === 3 && !input().disabled);
  const readsBeforeFilter = calls.length;
  edit(input(), '  SES_SOURCE  '); await wait(() => rows().length === 2);
  check('session_id_matches_all_its_branches_case_insensitively', rows().every(b => b.title.startsWith('ses_source')) && text().includes('2 matching branches'));
  edit(input(), 'BR_SOURCE'); await wait(() => rows().length === 1);
  check('branch_id_filters_without_ipc_or_selection', row('ses_source · br_source') != null && calls.length === readsBeforeFilter && !fixture.querySelector('#mem-ask'));
  row('ses_source · br_source').click(); await wait(() => !!fixture.querySelector('[aria-label="Read saved suggestions for job synthetic-run"]') && !input().disabled);
  fixture.querySelector<HTMLButtonElement>('[aria-label="Read saved suggestions for job synthetic-run"]')!.click();
  await wait(() => !!button('Read saved suggestions again'));
  check('located_source_session_reads_its_saved_run', calls.some(c => c.command === 'extraction_preview' && c.args.sessionId === 'ses_source' && c.args.runId === 'synthetic-run'));
  const draft = () => fixture.querySelector<HTMLTextAreaElement>('#mem-ask')!;
  edit(draft(), 'Unsent original draft'); await sleep(20);
  edit(input(), 'no-match'); await wait(() => rows().length === 0);
  check('no_match_does_not_impersonate_empty_workspace_or_change_draft', text().includes('No Session or branch IDs match') && !text().includes('No sessions yet') && text().includes('selected session stays open') && draft().value === 'Unsent original draft');
  button('Clear ID filter')!.click(); await wait(() => rows().length === 3);
  check('clear_restores_rows_selection_draft_and_filter_focus', row('ses_source · br_source').getAttribute('aria-pressed') === 'true' && draft().value === 'Unsent original draft' && document.activeElement === input());
  edit(input(), 'br_source'); await wait(() => rows().length === 1);
  failList = true; button('Refresh session list')!.click(); await wait(() => !!button('Read session list again'));
  check('failed_list_refresh_retains_filter_and_observed_matches', input().value === 'br_source' && rows().length === 1 && text().includes('previous successful list read'));
  failList = false; hideSource = true; button('Read session list again')!.click(); await wait(() => rows().length === 0 && !input().disabled);
  check('successful_replacement_reapplies_filter_without_discarding_selected_draft', text().includes('No Session or branch IDs match') && draft().value === 'Unsent original draft' && text().includes('selected session stays open'));
  button('Clear ID filter')!.click(); await wait(() => rows().length === 1);
  holdDetail = true; row('ses_other · br_other').click(); await wait(() => releaseDetail != null);
  check('pending_branch_read_disables_filter_and_rows', input().disabled && rows().every(b => b.disabled));
  releaseDetail!(); await wait(() => !input().disabled && draft().value === '');
  hideSource = false; button('Refresh session list')!.click(); await wait(() => rows().length === 3);
  row('ses_source · br_source').click(); await wait(() => draft().value === 'Unsent original draft' && !input().disabled);
  check('returning_to_filtered_source_restores_its_own_draft', row('ses_source · br_source').getAttribute('aria-pressed') === 'true');
  check('id_filter_flow_uses_existing_read_commands_only', calls.every(c => ['operation_list', 'provider_status', 'session_list', 'session_detail', 'extraction_preview'].includes(c.command)));
} catch (error) { checks.push({ id: String(error), ok: false }); }
finally { releasePending(); root.unmount(); document.getElementById('results')!.textContent = JSON.stringify({ checks, passed: checks.every(c => c.ok), calls }, null, 2); }
