// Actual Sessions controls; synthetic receipts, branch reads and Provider work.
import { createRoot } from 'react-dom/client';
import { Sessions } from '../src/memory/SessionsSurface';
import { setTransport } from '../src/memory/client';
import '../src/quiet-runtime.css';
import '../src/memory/memory.css';

const fixture = document.getElementById('fixture')!;
const checks: { id: string; ok: boolean }[] = [];
type Request = { command: string; arguments: Record<string, unknown>; idempotencyKey: string | null };
const calls: Request[] = [];
const root = createRoot(fixture);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
const button = (label: string) => [...fixture.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === label);
const row = (name: string) => fixture.querySelector<HTMLButtonElement>(`button[title="session-${name} · branch-${name}"]`)!;
const question = () => fixture.querySelector<HTMLTextAreaElement>('#mem-ask')!;
const checkpoint = () => fixture.querySelector<HTMLInputElement>('#mem-cp')!;
const retry = () => fixture.querySelector('[aria-label="Session inspector"] > .qr79 > .mem-error button') as HTMLButtonElement | null;
const retryAvailable = () => !!retry() && !retry()!.disabled;
async function wait(test: () => boolean) { for (let n = 0; n < 250; n++) { if (test()) return; await sleep(20); } throw new Error(`UI timeout: ${fixture.textContent}`); }
function click(control: HTMLButtonElement | undefined | null) { if (!control || control.disabled) throw new Error('Unavailable control'); control.click(); }
function edit(control: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = control instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(control, value);
  control.dispatchEvent(new Event('input', { bubbles: true }));
}
function check(id: string, ok: boolean) { checks.push({ id, ok }); }
let releaseRead: (() => void) | null = null, releaseProvider: (() => void) | null = null;
const release = () => { releaseRead?.(); releaseProvider?.(); releaseRead = null; releaseProvider = null; };
try {
  for (const command of ['session_ask', 'session_checkpoint', 'session_new']) {
    let holdRead = false, failRead = false, failWrite = true;
    setTransport(async (native, args) => {
      if (native === 'memory_provider_setup') return { state: 'ready' };
      if (native !== 'memory_call') throw new Error(`Unexpected native ${native}`);
      const r = args.request as Request;
      calls.push(r);
      let result: unknown;
      if (r.command === command) {
        if (failWrite) return { kind: 'memory_error', error: { code: 'busy', retryable: true, rules: [] } };
        result = command === 'session_ask' ? { status: 'no_supported_evidence', statements: ['Synthetic answer'], sources: [], capsuleId: 'capsule-one' }
          : { sessionId: 'session-one', branchId: 'branch-one' };
      } else switch (r.command) {
        case 'operation_list': result = { items: [] }; break;
        case 'session_list': result = { items: ['one', 'two'].map(name => ({ sessionId: `session-${name}`, updatedAt: '2026-10-15T00:00:00Z', branches: [{ branchId: `branch-${name}`, lastEventSeq: 1 }] })) }; break;
        case 'session_detail':
          if (holdRead) { holdRead = false; await new Promise<void>(resolve => { releaseRead = resolve; }); }
          if (failRead) return { kind: 'memory_error', error: { code: 'storage_failed', retryable: false, rules: [] } };
          result = { sessionId: r.arguments.sessionId, branchId: r.arguments.branchId, transcript: [], turns: [], checkpoints: [], invocations: [], extractionJobs: [], lastSavedEventId: null }; break;
        case 'provider_status': result = { configured: true, destinations: [{ api: 'openai', model: 'synthetic-model', streaming: 'unsupported', maxOutputTokens: 4096 }], grants: [{ active: true, policyId: 'synthetic-policy', maxSensitivity: 'private', destinations: [{ provider: 'openai', model: 'synthetic-model' }] }] }; break;
        case 'external_prepare':
          await new Promise<void>(resolve => { releaseProvider = resolve; });
          result = { callId: 'synthetic-call', wireHash: 'synthetic-wire', endpoint: 'synthetic endpoint', model: 'synthetic-model', body: r.arguments.text, estimatedInputTokens: 10, outputTokens: 128 }; break;
        default: throw new Error(`Unexpected command ${r.command}`);
      }
      return { kind: 'memory_page', result };
    });
    root.render(<div key={command} data-case={command}><Sessions inspect={() => { throw new Error('Unexpected navigation'); }} /></div>);
    await wait(() => fixture.firstElementChild?.getAttribute('data-case') === command && !!row('one')); click(row('one'));
    await wait(() => !!question() && !question().disabled && !!button('Prepare the question for openai…'));
    edit(question(), 'Original question'); edit(checkpoint(), 'Original checkpoint'); await frame();
    const submit = command === 'session_ask' ? 'Send' : command === 'session_checkpoint' ? 'Save checkpoint' : 'New session';
    const start = calls.length;
    click(button(submit)); await wait(retryAvailable);
    check(`${command}_failure_retains_both_unsent_drafts`, question().value === 'Original question' && checkpoint().value === 'Original checkpoint');
    holdRead = true; failRead = true; click(row('two')); await wait(() => releaseRead != null); await frame();
    check(`${command}_retry_waits_for_pending_branch_read`, !retryAvailable() && button('Send')!.disabled);
    releaseRead!(); releaseRead = null; await wait(() => button('Read session again')?.disabled === false); await frame();
    check(`${command}_retry_waits_for_successful_session_observation`, !retryAvailable() && row('one').getAttribute('aria-pressed') === 'true' && question().value === 'Original question');
    failRead = false; click(row('one')); await frame(); await wait(() => retryAvailable() && !question().disabled && button('Prepare the question for openai…')?.disabled === false);
    check(`${command}_same_branch_recovery_restores_held_retry_without_writing`, calls.slice(start).filter(r => r.command === command).length === 1);
    click(button('Prepare the question for openai…')); await wait(() => releaseProvider != null); await frame();
    check(`${command}_retry_waits_for_provider_ownership`, !retryAvailable() && button('Send')!.disabled && row('two').disabled);
    releaseProvider!(); releaseProvider = null; await wait(() => !!button('Send once') && !question().disabled);
    await wait(retryAvailable);
    edit(question(), 'Later unsent question'); edit(checkpoint(), 'Later unsent checkpoint'); await frame();
    failWrite = false; click(retry()); await wait(() => !retry() && !question().disabled && button('New session')?.disabled === false);
    const writes = calls.slice(start).filter(r => r.command === command);
    check(`${command}_retry_keeps_original_arguments_and_key`, writes.length === 2 && writes[0].idempotencyKey != null && writes[0].idempotencyKey === writes[1].idempotencyKey && JSON.stringify(writes[0].arguments) === JSON.stringify(writes[1].arguments));
    check(`${command}_acknowledgement_preserves_later_drafts`, question().value === 'Later unsent question' && checkpoint().value === 'Later unsent checkpoint');
    failWrite = true; click(button(submit)); await wait(retryAvailable);
    click(row('two')); await wait(() => row('two').getAttribute('aria-pressed') === 'true' && !question().disabled);
    check(`${command}_successful_branch_switch_discards_previous_retry`, !retry() && question().value === '' && checkpoint().value === '');
  }
  check('no_provider_send_or_other_write_was_admitted', calls.every(r => ['operation_list', 'session_list', 'session_detail', 'provider_status', 'session_ask', 'session_checkpoint', 'session_new', 'external_prepare'].includes(r.command)));
} catch (error) { checks.push({ id: String(error), ok: false }); }
finally { release(); root.unmount(); document.getElementById('results')!.textContent = JSON.stringify({ checks, passed: checks.every(c => c.ok), writes: calls.filter(r => r.idempotencyKey != null) }, null, 2); }
