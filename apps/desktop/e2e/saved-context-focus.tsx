// Actual saved-response controls; synthetic saved reads and browser focus only.
import { createRoot } from 'react-dom/client';
import { SessionEventBody } from '../src/memory/SessionEventBody';
import { call, setTransport } from '../src/memory/client';
import '../src/quiet-runtime.css';
import '../src/memory/memory.css';

const fixture = document.getElementById('fixture')!;
const checks: { id: string; ok: boolean }[] = [], calls: string[] = [];
const hash = 'a'.repeat(64), text = JSON.stringify({ status: 'no_supported_evidence', dispatch_id: 'dsp_synthetic', request_hash: hash, statements: ['Saved synthetic answer'], memories: [], sources: [] });
let failed = false, disabled = false, shown = true, navigations = 0;
let pending: (() => void) | null = null;
const release = () => { const resolve = pending; pending = null; resolve?.(); };
setTransport(async (native, args) => {
  if (native !== 'memory_call') throw new Error(native);
  const request = args.request as { command: string }; calls.push(request.command);
  if (request.command === 'dispatch_inspect') {
    await new Promise<void>(resolve => { pending = resolve; });
    if (failed) return { kind: 'memory_error', error: { code: 'busy', retryable: true, rules: [] } };
    return { kind: 'memory_page', result: { dispatchId: 'dsp_synthetic', capsuleId: 'cap_synthetic', verified: true, requestHash: hash, destination: { kind: 'local_mock' } } };
  }
  if (request.command === 'context_inspect') return { kind: 'memory_page', result: { capsule: { capsule_id: 'cap_synthetic', session_id: 'ses_synthetic', branch_id: 'br_synthetic', destination: { kind: 'local_mock' } }, inspection: { capsule_id: 'cap_synthetic' }, dispatches: [{ dispatchId: 'dsp_synthetic', requestHash: hash }] } };
  throw new Error(`Unexpected write ${request.command}`);
});
const root = createRoot(fixture);
const render = () => root.render(<><textarea id="draft" aria-label="Unsent synthetic draft" defaultValue="Unsent synthetic draft" />{shown && <SessionEventBody kind="assistant_completed" text={text} context={{ sessionId: 'ses_synthetic', branchId: 'br_synthetic', disabled, inspect: () => { navigations++; }, request: call }} />}</>);
render();
const button = (label: string) => [...fixture.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === label);
const read = () => button('Read saved answer context again') ?? button('Read saved answer context');
const inspect = () => button('Inspect saved answer context');
const draft = () => fixture.querySelector<HTMLTextAreaElement>('#draft')!;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function wait(test: () => boolean) { for (let n = 0; n < 250; n++) { if (test()) return; await sleep(20); } throw new Error('UI timeout'); }
async function frame() { await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); }
function check(id: string, ok: boolean) { checks.push({ id, ok }); }
async function start(control: HTMLButtonElement | undefined) {
  if (!control) throw new Error('Missing read control');
  await wait(() => control.isConnected && !control.disabled);
  control.focus(); control.click(); await wait(() => pending != null); await frame();
}
try {
  await wait(() => !!read()); await start(read());
  check('pending_lookup_disables_its_trigger_and_withholds_navigation', read()!.disabled && !inspect());
  release(); await wait(() => !!inspect() && !inspect()!.disabled); await frame();
  check('successful_lookup_hands_focus_to_explicit_context_navigation', document.activeElement === inspect());
  await start(read()); draft().focus(); release(); await wait(() => !!inspect() && !inspect()!.disabled); await frame();
  check('successful_lookup_respects_focus_moved_to_unsent_draft', document.activeElement === draft() && draft().value === 'Unsent synthetic draft');
  failed = true; await start(read()); release(); await wait(() => !!button('Retry')); await frame();
  check('failed_lookup_returns_focus_to_explicit_read_again', document.activeElement === read() && !inspect());
  failed = false; await start(button('Retry')); release(); await wait(() => !!inspect() && !inspect()!.disabled); await frame();
  check('retry_acknowledgement_uses_the_same_focus_handoff', document.activeElement === inspect());
  await start(read()); disabled = true; render(); await frame(); release(); await wait(() => !!inspect()); await frame();
  check('parent_ownership_does_not_focus_a_disabled_action', inspect()!.disabled && document.activeElement !== inspect());
  disabled = false; render(); await frame();
  check('releasing_parent_ownership_does_not_replay_old_focus', document.activeElement !== inspect());
  await start(read()); shown = false; render(); await frame(); draft().focus(); release(); await frame(); await frame();
  check('unmounted_lookup_cannot_move_focus_or_navigate', document.activeElement === draft() && !inspect() && navigations === 0);
  check('focus_recovery_uses_saved_reads_only', calls.every(c => ['dispatch_inspect', 'context_inspect'].includes(c)) && navigations === 0);
} catch (error) { checks.push({ id: String(error), ok: false }); }
finally { release(); root.unmount(); document.getElementById('results')!.textContent = JSON.stringify({ checks, passed: checks.every(c => c.ok), calls }, null, 2); }
