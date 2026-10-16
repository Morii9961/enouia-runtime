// Actual Memory surface -> Import route. No native picker, file or Vault is used.
import { createRoot } from 'react-dom/client';
import MemorySurface from '../src/memory/MemorySurface';
import { MemoryStatusProvider } from '../src/memory/status';
import { setTransport } from '../src/memory/client';
import '../src/quiet-runtime.css';
import '../src/memory/memory.css';

type Request = { command: string; arguments: Record<string, unknown>; idempotencyKey: string | null };
const fixture = document.getElementById('fixture')!;
const checks: { id: string; ok: boolean }[] = [], calls: Request[] = [];
const root = createRoot(fixture);
let holdList = true, failList = true, failWrite = false, failPreview = false, duplicate: string | null = 'import-synthetic', status = 'completed', empty = false;
let release: (() => void) | null = null, picks = 0, operationKind = 'import';
const releasePending = () => { const resolve = release; release = null; resolve?.(); };
setTransport(async (native, args) => {
  if (native === 'shell_status') return { vaultChanging: false };
  if (native === 'memory_pick') { picks++; return { token: 'token-synthetic', displayName: 'Synthetic.md', bytes: 20 }; }
  if (native !== 'memory_call') throw new Error(`Unexpected native ${native}`);
  const r = args.request as Request; calls.push(r); let result: unknown;
  switch (r.command) {
    case 'workspace_status': result = { vault: { state: 'open' }, pendingCandidates: 0 }; break;
    case 'memory_list': result = { items: [], total: 0, nextCursor: null }; break;
    case 'import_list':
      if (holdList) { holdList = false; await new Promise<void>(resolve => { release = resolve; }); }
      if (failList) return { kind: 'memory_error', error: { code: 'storage_failed', retryable: false, rules: [] } };
      result = { items: empty ? [] : [{ importId: 'import-synthetic', status, inputKind: 'markdown_file', accountScope: 'fixture-account', counts: { sources_created: 1, attachments_missing: 0 }, warnings: [], duplicateOf: null }] }; break;
    case 'import_preview':
      if (failPreview) return { kind: 'memory_error', error: { code: 'busy', retryable: true, rules: [] } };
      result = { displayName: 'Synthetic.md', bytes: 20, inputKind: 'markdown_file', recognized: true, units: 1, warnings: [], duplicateOf: duplicate }; break;
    case 'import_start': case 'import_resume':
      if (failWrite) return { kind: 'memory_error', error: { code: 'busy', retryable: true, rules: [] } };
      operationKind = r.command === 'import_start' ? 'import' : 'import_resume'; status = 'completed';
      result = { operationId: `operation-${operationKind}`, kind: operationKind }; break;
    case 'operation_get': result = { operationId: r.arguments.operationId, kind: operationKind, state: 'succeeded', cancelRequested: false, progress: { done: 1, total: 1 }, result: null }; break;
    default: throw new Error(`Unexpected command ${r.command}`);
  }
  return { kind: 'memory_page', result };
});
const text = () => fixture.textContent ?? '';
const button = (label: string) => [...fixture.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === label);
const refresh = () => button('Read import list again') ?? button('Refresh import list');
const alias = () => fixture.querySelector<HTMLInputElement>('#mem-alias')!;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function wait(test: () => boolean) { for (let n = 0; n < 250; n++) { if (test()) return; await sleep(20); } throw new Error(`UI timeout: ${text()}`); }
function click(control: HTMLButtonElement | undefined) { if (!control || control.disabled) throw new Error('Unavailable control'); control.click(); }
function check(id: string, ok: boolean) { checks.push({ id, ok }); }
async function editAlias(value: string) { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(alias(), value); alias().dispatchEvent(new Event('input', { bubbles: true })); await sleep(30); }
async function mount(key: string) {
  root.render(<div key={key} data-case={key}><MemoryStatusProvider><MemorySurface /></MemoryStatusProvider></div>);
  await wait(() => fixture.firstElementChild?.getAttribute('data-case') === key && !!button('Import'));
  click(button('Import')); await wait(() => !!button('Choose file…'));
}
async function recover() { failList = false; click(refresh()); await sleep(30); await wait(() => !!refresh() && !refresh()!.disabled && !text().includes('Previous import observation')); }
try {
  await mount('initial'); await wait(() => release != null); await sleep(30);
  check('initial_pending_list_is_unknown_instead_of_zero', !text().includes('0 recorded') && text().includes('Waiting for imports') && text().includes('Reading imports…'));
  releasePending(); await wait(() => !!fixture.querySelector('[role="alert"]'));
  check('initial_failed_list_has_unknown_count_and_explicit_read', !text().includes('0 recorded') && text().includes('Imports unavailable') && !!refresh() && !refresh()!.disabled);
  if (refresh()) {
    failPreview = true; click(button('Choose file…')); await wait(() => !!button('Retry'));
    check('read_only_picker_retry_remains_available_with_unknown_list', !button('Retry')!.disabled && text().includes('Imports unavailable'));
    failPreview = false; click(button('Retry')); await wait(() => !!button('Start import') && refresh()?.disabled === false);
    check('preview_recovery_still_waits_before_any_write', button('Start import')!.disabled && calls.every(r => !['import_start', 'import_resume'].includes(r.command)));
    const before = calls.length, beforePicks = picks; await recover();
    check('explicit_list_recovery_uses_only_a_saved_read', picks === beforePicks && calls.slice(before).every(r => ['import_list', 'workspace_status'].includes(r.command)) && text().includes('1 recorded'));
  }

  failList = false; await mount('preview'); await wait(() => text().includes('1 recorded'));
  holdList = true; failList = true; click(button('Choose file…')); await wait(() => release != null && !!button('Start import')); await sleep(30);
  check('preview_waits_for_current_list_before_start', button('Start import')!.disabled && !text().includes('it will be recorded as a duplicate'));
  releasePending(); await wait(() => !!fixture.querySelector('[role="alert"]'));
  await editAlias('fixture-later');
  check('failed_refresh_retains_rows_preview_and_alias_but_blocks_start', fixture.querySelectorAll('tbody tr').length === 1 && text().includes('Previous import observation') && text().includes('Synthetic.md') && alias().value === 'fixture-later' && button('Start import')!.disabled);
  if (refresh()) {
    status = 'archived'; await recover();
    check('fresh_interrupted_record_requires_resume', button('Start import')!.disabled && button('Resume')?.disabled === false && text().includes('which was interrupted'));
    for (const command of ['import_resume', 'import_start']) {
      if (command === 'import_start') { duplicate = null; click(button('Choose file…')); await wait(() => button('Start import')?.disabled === false); await editAlias('fixture-original'); }
      const before = calls.length; failWrite = true; click(button(command === 'import_start' ? 'Start import' : 'Resume')); await wait(() => !!button('Retry'));
      await editAlias('fixture-after-error'); holdList = true; failList = true; click(refresh()); await wait(() => release != null); await sleep(30);
      check(`${command}_held_retry_waits_for_list_read`, !button('Retry') && button('Start import')!.disabled && (command !== 'import_resume' || button('Resume')!.disabled));
      releasePending(); await wait(() => text().includes('Previous import observation'));
      check(`${command}_held_retry_waits_after_failed_list`, !button('Retry') && alias().value === 'fixture-after-error');
      await recover(); await wait(() => !!button('Retry'));
      check(`${command}_list_recovery_does_not_replay_write`, calls.slice(before).filter(r => r.command === command).length === 1);
      failWrite = false; click(button('Retry')); await wait(() => !button('Retry') && !button('Start import') && text().includes('succeeded'));
      const writes = calls.slice(before).filter(r => r.command === command);
      check(`${command}_retry_keeps_original_payload_and_key`, writes.length === 2 && writes[0].idempotencyKey != null && writes[0].idempotencyKey === writes[1].idempotencyKey && JSON.stringify(writes[0].arguments) === JSON.stringify(writes[1].arguments));
      click(button('Choose file…')); await wait(() => !!alias() && !refresh()!.disabled);
      check(`${command}_acknowledgement_preserves_later_alias`, alias().value === 'fixture-after-error');
    }
    duplicate = 'import-missing'; click(button('Choose file…')); await wait(() => !!button('Start import') && !refresh()!.disabled);
    check('unobserved_duplicate_record_does_not_allow_start_or_claim_duplicate_outcome', button('Start import')!.disabled && !text().includes('it will be recorded as a duplicate'));
    duplicate = null; empty = true; await mount('empty'); await wait(() => text().includes('0 recorded'));
    check('zero_is_reported_only_after_successful_empty_observation', text().includes('No recorded imports yet.') && !fixture.querySelector('[role="alert"]'));
  }
  check('journey_uses_only_existing_local_import_and_read_commands', calls.every(r => ['workspace_status', 'memory_list', 'import_list', 'import_preview', 'import_start', 'import_resume', 'operation_get'].includes(r.command)));
} catch (error) { checks.push({ id: String(error), ok: false }); }
finally { releasePending(); root.unmount(); document.getElementById('results')!.textContent = JSON.stringify({ checks, passed: checks.every(c => c.ok), picks, writes: calls.filter(r => ['import_start', 'import_resume'].includes(r.command)) }, null, 2); }
