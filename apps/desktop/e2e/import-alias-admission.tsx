// Actual Import route, with synthetic picks/manifests/receipts only.
import { createRoot } from 'react-dom/client';
import MemorySurface from '../src/memory/MemorySurface';
import { MemoryStatusProvider } from '../src/memory/status';
import { setTransport } from '../src/memory/client';
import '../src/quiet-runtime.css';
import '../src/memory/memory.css';

const fixture = document.getElementById('fixture')!, root = createRoot(fixture);
const checks: { id: string; ok: boolean }[] = [];
type Request = { command: string; arguments: Record<string, unknown>; idempotencyKey: string | null };
const calls: Request[] = [];
let scope: string | null = 'saved-account', fail = false, operationKind = 'import';
setTransport(async (native, args) => {
  if (native === 'shell_status') return { vaultChanging: false };
  if (native === 'memory_pick') return { token: 'synthetic-token', displayName: 'Synthetic.md', bytes: 1 };
  if (native !== 'memory_call') throw new Error(`Unexpected native ${native}`);
  const r = args.request as Request; calls.push(r); let result: unknown;
  switch (r.command) {
    case "history_task_list": result = { identity: { commitId: "synthetic-head" }, items: [], nextCursor: null, readOnly: true }; break;
    case "operation_list": result = { items: [] }; break;
    case 'workspace_status': result = { vault: { state: 'open' }, pendingCandidates: 0 }; break;
    case 'memory_list': result = { items: [], total: 0, nextCursor: null }; break;
    case 'import_list': result = { items: [{ importId: 'synthetic-import', status: 'archived', inputKind: 'markdown_file', accountScope: scope, counts: { sources_created: 1, attachments_missing: 0 }, warnings: [] }] }; break;
    case 'import_preview': result = { displayName: 'Synthetic.md', bytes: 1, inputKind: 'markdown_file', recognized: true, units: 1, warnings: [], duplicateOf: null }; break;
    case 'import_start': case 'import_resume':
      if (fail) return { kind: 'memory_error', error: { code: 'busy', retryable: true, rules: [] } };
      operationKind = r.command === 'import_start' ? 'import' : 'import_resume'; result = { operationId: `operation-${operationKind}` }; break;
    case 'operation_get': result = { operationId: r.arguments.operationId, kind: operationKind, state: 'succeeded', cancelRequested: false, progress: { done: 1, total: 1 }, result: null }; break;
    default: throw new Error(`Unexpected Core ${r.command}`);
  }
  return { kind: 'memory_page', result };
});
root.render(<MemoryStatusProvider><MemorySurface /></MemoryStatusProvider>);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const button = (label: string) => [...fixture.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === label);
const alias = () => fixture.querySelector<HTMLInputElement>('#mem-alias');
async function wait(test: () => boolean) { for (let n = 0; n < 250; n++) { if (test()) return; await sleep(20); } throw new Error(`UI timeout: ${fixture.textContent}`); }
function check(id: string, ok: boolean) { checks.push({ id, ok }); }
function click(label: string) { const control = button(label); if (!control || control.disabled) throw new Error(`Unavailable ${label}`); control.click(); }
async function edit(value: string) { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(alias(), value); alias()!.dispatchEvent(new Event('input', { bubbles: true })); await sleep(30); }
async function pick() { click('Choose file…'); await wait(() => !!alias() && button('Refresh import list')?.disabled === false); }
async function refresh() { click('Refresh import list'); await sleep(30); await wait(() => button('Refresh import list')?.disabled === false); }
try {
  await wait(() => !!button('Import')); click('Import'); await wait(() => !!button('Resume')); await pick();
  for (const value of ['', 'Bad', '_bad', '-bad', 'bad scope', '中', 'a'.repeat(65)]) {
    await edit(value);
    check(`invalid_alias_${JSON.stringify(value)}_withholds_new_start`, button('Start import')?.disabled === true && alias()?.getAttribute('aria-invalid') === 'true');
    check(`invalid_alias_${JSON.stringify(value)}_keeps_saved_scope_resume`, button('Resume')?.disabled === false);
  }
  check('invalid_alias_reads_and_preview_do_not_write', button('Refresh import list')?.disabled === false && !calls.some(r => ['import_start', 'import_resume'].includes(r.command)));
  scope = null; await refresh();
  check('fallback_resume_validates_the_current_alias', button('Resume')?.disabled === true);
  await edit('a'.repeat(64));
  check('maximum_valid_alias_restores_start_and_fallback_resume', button('Start import')?.disabled === false && button('Resume')?.disabled === false && alias()?.getAttribute('aria-invalid') === 'false');
  for (const command of ['import_start', 'import_resume']) {
    await edit('fixture-original'); const before = calls.length; fail = true;
    click(command === 'import_start' ? 'Start import' : 'Resume'); await wait(() => !!button('Retry'));
    await edit('');
    check(`${command}_held_valid_retry_survives_invalid_later_draft`, !!button('Retry') && button('Start import')?.disabled === true && button('Resume')?.disabled === true);
    fail = false; click('Retry'); await wait(() => !button('Retry') && !alias());
    const writes = calls.slice(before).filter(r => r.command === command);
    check(`${command}_retry_preserves_original_alias_and_key`, writes.length === 2 && writes.every(r => r.arguments.accountAlias === 'fixture-original') && writes[0].idempotencyKey != null && writes[0].idempotencyKey === writes[1].idempotencyKey);
    await pick();
    check(`${command}_receipt_retains_invalid_later_draft`, alias()?.value === '' && button('Start import')?.disabled === true);
  }
  check('alias_changes_do_not_add_commands', calls.every(r => ['history_task_list', 'operation_list', 'workspace_status', 'memory_list', 'import_list', 'import_preview', 'import_start', 'import_resume', 'operation_get'].includes(r.command)));
} catch (error) { checks.push({ id: String(error), ok: false }); }
finally { root.unmount(); document.getElementById('results')!.textContent = JSON.stringify({ checks, passed: checks.every(c => c.ok) }, null, 2); }
