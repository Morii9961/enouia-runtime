// Actual candidate inbox and ordinary review dialog; all IPC is synthetic.
import { createRoot } from 'react-dom/client';
import { Inbox } from '../src/memory/MemorySurface';
import { MemoryStatusProvider } from '../src/memory/status';
import { setTransport } from '../src/memory/client';
import '../src/quiet-runtime.css';
import '../src/memory/memory.css';

type Request = { command: string; arguments: Record<string, unknown>; idempotencyKey: string | null };
const fixture = document.getElementById('fixture')!;
const checks: { id: string; ok: boolean }[] = [], calls: Request[] = [];
const root = createRoot(fixture);
let release: (() => void) | null = null;
const releasePending = () => { const resolve = release; release = null; resolve?.(); };
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const button = (label: string) => [...fixture.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === label);
const input = (selector: string) => fixture.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
const text = () => fixture.textContent ?? '';
const retryAvailable = () => !!button('Retry') && !button('Retry')!.disabled;
async function wait(test: () => boolean) { for (let n = 0; n < 250; n++) { if (test()) return; await sleep(20); } throw new Error(`UI timeout: ${text()}`); }
function click(control: HTMLButtonElement | undefined) { if (!control || control.disabled) throw new Error('Unavailable control'); control.click(); }
function edit(selector: string, value: string) {
  const control = input(selector), prototype = control instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(control, value);
  control.dispatchEvent(new Event('input', { bubbles: true }));
}
function check(id: string, ok: boolean) { checks.push({ id, ok }); }
try {
  for (const command of ['remember', 'review_plan']) {
    let holdList = false, failList = false, failAction = true;
    setTransport(async (native, args) => {
      if (native === 'shell_status') return { vaultChanging: false };
      if (native !== 'memory_call') throw new Error(`Unexpected native ${native}`);
      const r = args.request as Request; calls.push(r);
      let result: unknown;
      if (r.command === command) {
        if (failAction) return { kind: 'memory_error', error: { code: 'busy', retryable: true, rules: [] } };
        result = command === 'remember' ? { candidateId: 'candidate-created' } : { planId: 'plan-synthetic', operationKind: 'review', diffHash: 'synthetic-hash', confirmCode: 'FIXTURE', expiresAt: '2030-01-01T00:00:00Z', records: [] };
      } else switch (r.command) {
        case 'workspace_status': result = { vault: { state: 'open' }, pendingCandidates: 1 }; break;
        case 'candidate_list':
          if (holdList) { holdList = false; await new Promise<void>(resolve => { release = resolve; }); }
          if (failList) return { kind: 'memory_error', error: { code: 'storage_failed', retryable: false, rules: [] } };
          result = { items: [{ candidateId: 'candidate-synthetic', revision: 1, content: 'Original synthetic proposal', proposalKind: 'create', proposedType: 'fact', sensitivity: 'normal', originKind: 'manual', createdAt: '2026-10-15T00:00:00Z', evidence: [], conflicts: [], target: null }], total: 1, nextCursor: null }; break;
        case 'review_discard': result = null; break;
        default: throw new Error(`Unexpected command ${r.command}`);
      }
      return { kind: 'memory_page', result };
    });
    root.render(<div key={command} data-case={command}><MemoryStatusProvider><Inbox /></MemoryStatusProvider></div>);
    await wait(() => fixture.firstElementChild?.getAttribute('data-case') === command && !!fixture.querySelector('article textarea') && button('Refresh candidates')?.disabled === false);
    edit('article textarea', 'Original candidate edit'); edit('#mem-remember', 'Original statement'); edit('#mem-claim', 'fixture.original'); await sleep(30);
    const before = calls.length;
    click(button(command === 'remember' ? 'Save as candidate' : 'Accept with edits…')); await wait(retryAvailable);
    const errorText = fixture.querySelector('.mem-error')!.textContent!.replace('Retry', '').trim();
    check(`${command}_failure_keeps_all_unsent_drafts`, input('article textarea').value === 'Original candidate edit' && input('#mem-remember').value === 'Original statement' && input('#mem-claim').value === 'fixture.original');
    holdList = true; failList = true; click(button('Refresh candidates')); await wait(() => release != null); await sleep(30);
    check(`${command}_retry_waits_for_pending_candidate_read`, !retryAvailable() && text().includes(errorText) && button('Save as candidate')!.disabled && button('Accept with edits…')!.disabled);
    releasePending(); await wait(() => text().includes('Previous candidate observation') && button('Refresh candidates')?.disabled === false);
    check(`${command}_retry_waits_after_failed_candidate_observation`, !retryAvailable() && text().includes(errorText) && button('Save as candidate')!.disabled && button('Accept with edits…')!.disabled);
    edit('article textarea', 'Later candidate edit'); edit('#mem-remember', 'Later statement'); edit('#mem-claim', 'fixture.later'); await sleep(30);
    failList = false; click(button('Refresh candidates')); await sleep(30);
    await wait(() => !text().includes('Previous candidate observation') && button('Refresh candidates')?.disabled === false && retryAvailable());
    check(`${command}_fresh_observation_restores_retry_without_replay`, calls.slice(before).filter(r => r.command === command).length === 1);
    failAction = false; click(button('Retry'));
    if (command === 'review_plan') {
      await wait(() => !!fixture.querySelector('dialog[open]'));
      check('review_retry_only_opens_ordinary_confirmation', !!button('Confirm (FIXTURE)') && calls.every(r => r.command !== 'review_confirm'));
      click(button('Cancel'));
    }
    await wait(() => !button('Retry') && !fixture.querySelector('dialog[open]') && button('Refresh candidates')?.disabled === false);
    const actions = calls.slice(before).filter(r => r.command === command);
    check(`${command}_retry_keeps_original_arguments_and_key`, actions.length === 2 && JSON.stringify(actions[0].arguments) === JSON.stringify(actions[1].arguments) && actions[0].idempotencyKey === actions[1].idempotencyKey && (command === 'remember' ? actions[0].idempotencyKey != null : actions[0].idempotencyKey === null));
    check(`${command}_completion_preserves_later_drafts`, input('article textarea').value === 'Later candidate edit' && input('#mem-remember').value === 'Later statement' && input('#mem-claim').value === 'fixture.later');
  }
  check('recovery_never_confirms_review_or_issues_unrelated_commands', calls.every(r => ['workspace_status', 'candidate_list', 'remember', 'review_plan', 'review_discard'].includes(r.command)));
} catch (error) { checks.push({ id: String(error), ok: false }); }
finally { releasePending(); root.unmount(); document.getElementById('results')!.textContent = JSON.stringify({ checks, passed: checks.every(c => c.ok), actions: calls.filter(r => ['remember', 'review_plan'].includes(r.command)) }, null, 2); }
