// Actual Source/ExtractionPanel controls; all provider and source replies are synthetic.
import { createRoot } from 'react-dom/client';
import { Source } from '../src/memory/ui';
import { CallError, type call } from '../src/memory/client';
import '../src/quiet-runtime.css';
import '../src/memory/memory.css';

const fixture = document.getElementById('fixture')!;
const outside = document.createElement('input'); document.body.appendChild(outside);
let root = createRoot(fixture);
const checks: { id: string; ok: boolean }[] = [], calls: string[] = [];
let mode: 'off' | 'error' | 'prepared' | 'lost-send' | 'completed' = 'off';
const request: typeof call = async (command, args = {}) => {
  calls.push(command);
  switch (command) {
    case 'source_excerpt': return { sourceId: args.sourceId, sourceRevision: args.sourceRevision, sourceKind: 'message', speakerRole: 'user', byteStart: 0, byteEnd: 20, totalBytes: 20, excerpt: 'Synthetic literal source' };
    case 'provider_status':
      if (mode === 'error') throw new CallError({ code: 'storage_failed', retryable: false, rules: [] });
      return { configured: mode !== 'off', destinations: [{ api: 'openai', model: 'synthetic-model' }], grants: [{ active: true, policyId: 'synthetic-policy', purposes: ['extraction'], destinations: [{ provider: 'openai', model: 'synthetic-model' }] }] };
    case 'extraction_prepare': return { callId: 'synthetic-call', wireHash: 'synthetic-hash', sessionId: 'synthetic-session', runId: 'synthetic-run', model: 'synthetic-model', endpoint: 'Synthetic unused endpoint', body: 'Synthetic exact request' };
    case 'external_send':
      if (mode === 'lost-send') throw new CallError({ code: 'storage_failed', retryable: false, rules: [] });
      return { operationId: 'synthetic-operation', kind: 'external_send' };
    case 'operation_get': return { operationId: 'synthetic-operation', kind: 'external_send', state: 'succeeded', cancelRequested: false, progress: { done: 1, total: 1 }, result: { finish: 'completed' } };
    case 'extraction_preview': return { job: { run_id: 'synthetic-run', state: 'completed' }, items: [] };
    default: throw new Error(`Unexpected ${command}`);
  }
};
const button = (label: string) => [...fixture.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === label);
const entry = () => button('Suggest memories from this part…');
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function wait(test: () => boolean) { for (let n = 0; n < 250; n++) { if (test()) return; await sleep(20); } throw new Error(`UI timeout: ${fixture.textContent}`); }
function check(id: string, ok: boolean) { checks.push({ id, ok }); }
function click(label: string) { const control = button(label); if (!control || control.disabled) throw new Error(`Unavailable ${label}`); control.focus(); control.click(); }
async function open(nextMode: typeof mode) {
  root.unmount(); root = createRoot(fixture); mode = nextMode; outside.focus();
  root.render(<Source evidence={{ available: true, sourceId: 'synthetic-source', sourceRevision: 1, supports: 'content' }} readPage={request} />);
  await wait(() => !!button('Show source')); click('Show source'); await wait(() => !!entry());
  click('Suggest memories from this part…');
  await wait(() => !!button('Close'));
}
async function close(label: string, id: string, moveFocus = false) {
  const before = calls.length;
  click(label); if (moveFocus) outside.focus();
  await wait(() => !!entry()); await sleep(20);
  check(`${id}_returns_focus`, document.activeElement === (moveFocus ? outside : entry()));
  check(`${id}_keeps_source_and_starts_no_work`, fixture.querySelector('pre.mem-source')?.textContent === 'Synthetic literal source' && calls.length === before && !button('Send once'));
}
try {
  await open('off'); await close('Close', 'provider_off');
  await open('error'); await close('Close', 'setup_error');
  await open('prepared'); click('Prepare the request…'); await wait(() => !!button("Don't send"));
  const beforeSend = calls.filter(c => c === 'external_send').length;
  await close("Don't send", 'declined_request');
  check('declining_does_not_send', calls.filter(c => c === 'external_send').length === beforeSend);
  await open('lost-send'); click('Prepare the request…'); await wait(() => !!button('Send once')); click('Send once');
  await wait(() => !!button('Leave this request') && !button('Leave this request')!.disabled);
  await close('Leave this request', 'unconfirmed_send');
  check('leaving_unconfirmed_send_does_not_replay', calls.filter(c => c === 'external_send').length === beforeSend + 1);
  await open('completed'); click('Prepare the request…'); await wait(() => !!button('Send once')); click('Send once');
  await wait(() => calls.includes('extraction_preview') && button('Close')?.disabled === false);
  await close('Close', 'completed_run');
  await open('off'); await close('Close', 'focus_moved_elsewhere', true);
  check('no_queue_or_review_writes', calls.every(c => ['source_excerpt', 'provider_status', 'extraction_prepare', 'external_send', 'operation_get', 'extraction_preview'].includes(c)));
} catch (error) { checks.push({ id: String(error), ok: false }); }
finally { root.unmount(); outside.remove(); document.getElementById('results')!.textContent = JSON.stringify({ checks, passed: checks.every(c => c.ok) }, null, 2); }
