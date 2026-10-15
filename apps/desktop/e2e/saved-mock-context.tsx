// Actual Sessions -> Context components; all saved records and timing are synthetic.
import { createRoot } from "react-dom/client";
import { Sessions } from "../src/memory/SessionsSurface";
import { Context } from "../src/memory/ContextSurface";
import { setTransport } from "../src/memory/client";
import "../src/quiet-runtime.css";
import "../src/memory/memory.css";

const fixture = document.getElementById('fixture')!;
const checks: { id: string; ok: boolean }[] = [], calls: { command: string; args: Record<string, unknown> }[] = [];
const navigations: string[] = [];
let mode = '', failDetail = false, route = false, holdDispatch = false;
let releaseDispatch: (() => void) | null = null;
const releasePending = () => releaseDispatch?.();
const hash = 'a'.repeat(64), at = '2026-10-15T00:00:00Z';
const recorded = (branch: string) => JSON.stringify({ status: 'no_supported_evidence', dispatch_id: `dsp_${branch}`, request_hash: hash, statements: ['Literal saved answer <data>'], sources: [], memories: [] });
setTransport(async (native, args) => {
  if (native === 'memory_provider_setup') return { state: 'absent' };
  if (native !== 'memory_call') throw new Error(native);
  const r = args.request as { command: string; arguments: Record<string, unknown> }; calls.push({ command: r.command, args: r.arguments });
  let result: unknown;
  if (r.command === 'operation_list') result = { items: [] };
  else if (r.command === 'provider_status') result = { configured: false, destinations: [], grants: [] };
  else if (r.command === 'session_list') result = { items: [{ sessionId: 'ses_synthetic', updatedAt: at, branches: ['one', 'two'].map(branchId => ({ branchId, lastEventSeq: 1 })) }] };
  else if (r.command === 'session_detail') {
    if (failDetail) return { kind: 'memory_error', error: { code: 'storage_failed', retryable: false, rules: [] } };
    result = { ...r.arguments, transcript: [{ eventId: 'synthetic-answer', kind: 'assistant_completed', deliveryState: 'completed', occurredAt: at, text: recorded(String(r.arguments.branchId)) }], turns: [], checkpoints: [], extractionJobs: [], invocations: [], lastSavedEventId: 'synthetic-answer' };
  } else if (r.command === 'dispatch_inspect') {
    const id = String(r.arguments.dispatchId), branch = id.slice(4);
    if (holdDispatch) { holdDispatch = false; await new Promise<void>(resolve => { releaseDispatch = resolve; }); }
    if (mode === 'read-failed') return { kind: 'memory_error', error: { code: 'storage_failed', retryable: false, rules: [] } };
    result = { dispatchId: id, capsuleId: `cap_${branch}`, verified: mode !== 'unverified', requestHash: mode === 'hash' ? 'b'.repeat(64) : hash,
      destination: { kind: mode === 'external' ? 'external_provider' : 'local_mock' }, tools: 0, messages: [{ role: 'user', text: 'Exact saved synthetic question' }] };
  } else if (r.command === 'context_inspect') {
    const id = String(r.arguments.capsuleId), branch = id.slice(4);
    result = { capsule: { capsule_id: id, session_id: mode === 'session' ? 'other-session' : 'ses_synthetic', branch_id: mode === 'branch' ? 'other-branch' : branch,
      query: 'Exact saved synthetic question', destination: { kind: 'local_mock' }, budget: { estimated_tokens: 5, max_tokens: 100 } },
      inspection: { capsule_id: id, decisions: [] }, delivery: 'dispatched', dispatches: [{ dispatchId: `dsp_${branch}`, requestHash: hash, state: 'completed', preparedAt: at, sentAt: at, completedAt: at }] };
  } else throw new Error(`Unexpected write ${r.command}`);
  return { kind: 'memory_page', result };
});
const root = createRoot(fixture);
root.render(<Sessions inspect={id => { navigations.push(id); if (route) root.render(<Context capsuleId={id} />); }} />);
const text = () => fixture.textContent ?? '';
const button = (label: string) => [...fixture.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === label);
const row = (branch: string) => fixture.querySelector<HTMLButtonElement>(`button[title="ses_synthetic · ${branch}"]`)!;
const readButton = () => button('Read saved answer context again') ?? button('Read saved answer context');
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function wait(p: () => boolean) { for (let n = 0; n < 250; n++) { if (p()) return; await sleep(20); } throw new Error(`UI timeout: ${text()}`); }
function check(id: string, ok: boolean) { checks.push({ id, ok }); if (!ok) throw new Error(id); }
function click(b: HTMLButtonElement | undefined) { if (!b || b.disabled) throw new Error('Unavailable control'); b.click(); }
try {
  await wait(() => !!row('one')); click(row('one')); await wait(() => !!readButton() && !readButton()!.disabled);
  check('saved_answer_offers_explicit_context_read_without_auto_lookup', text().includes('Local Mock') && calls.every(c => !['dispatch_inspect', 'context_inspect'].includes(c.command)) && !button('Inspect saved answer context'));
  const draft = fixture.querySelector<HTMLTextAreaElement>('#mem-ask')!;
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(draft, 'Unsent question stays here'); draft.dispatchEvent(new Event('input', { bubbles: true })); await sleep(20);
  for (const invalid of ['unverified', 'hash', 'external', 'session', 'branch', 'read-failed']) {
    mode = invalid; click(readButton());
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    await wait(() => !!fixture.querySelector('[role="alert"]') && !readButton()!.disabled);
    check(`${invalid}_cannot_offer_context_navigation`, !button('Inspect saved answer context') && navigations.length === 0 && text().includes('could not be verified') && draft.value === 'Unsent question stays here');
  }
  mode = ''; click(readButton()); await wait(() => !!button('Inspect saved answer context'));
  check('matching_saved_records_offer_separate_navigation_without_rewriting_answer_or_draft', navigations.length === 0 && text().includes('Literal saved answer <data>') && draft.value === 'Unsent question stays here');
  failDetail = true; click(button('Refresh saved session')); await wait(() => !!button('Read session again'));
  check('unobserved_parent_session_withholds_context_actions', readButton()!.disabled && button('Inspect saved answer context')!.disabled && text().includes('previous successful read'));
  failDetail = false; click(button('Read session again')); await wait(() => !readButton()!.disabled);
  holdDispatch = true; click(readButton()); await wait(() => releaseDispatch != null);
  check('reread_clears_prior_navigation_and_shows_waiting', !button('Inspect saved answer context') && text().includes("Reading this answer's saved context") && readButton()!.disabled);
  click(row('two')); await wait(() => row('two').getAttribute('aria-pressed') === 'true' && !readButton()!.disabled);
  releasePending(); await sleep(50);
  check('late_context_read_cannot_follow_or_publish_in_another_branch', !button('Inspect saved answer context') && navigations.length === 0);
  click(row('one')); await wait(() => row('one').getAttribute('aria-pressed') === 'true' && !readButton()!.disabled);
  check('returning_branch_requires_fresh_context_observation_and_keeps_its_draft', !button('Inspect saved answer context') && fixture.querySelector<HTMLTextAreaElement>('#mem-ask')!.value === 'Unsent question stays here');
  click(readButton()); await wait(() => !!button('Inspect saved answer context'));
  route = true; click(button('Inspect saved answer context')); await wait(() => text().includes('Context Surface') && text().includes('Exact saved synthetic question'));
  check('explicit_navigation_opens_observed_capsule_through_real_context_surface', navigations.length === 1 && navigations[0] === 'cap_one' && !fixture.querySelector('#mem-ask'));
  click(button('Show the actual request')); await wait(() => !!fixture.querySelector('aside pre'));
  check('actual_request_still_requires_its_own_read_and_hash_check', text().includes('hash-checked') && fixture.querySelector('aside pre')!.textContent === 'Exact saved synthetic question');
  check('recovery_journey_uses_only_existing_saved_read_commands', calls.every(c => ['operation_list', 'provider_status', 'session_list', 'session_detail', 'dispatch_inspect', 'context_inspect'].includes(c.command)));
} catch (error) { checks.push({ id: String(error), ok: false }); }
finally { releasePending(); root.unmount(); document.getElementById('results')!.textContent = JSON.stringify({ checks, passed: checks.every(c => c.ok), calls }, null, 2); }
