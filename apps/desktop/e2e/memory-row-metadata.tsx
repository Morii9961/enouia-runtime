import { createRoot } from 'react-dom/client';
import MemorySurface from '../src/memory/MemorySurface';
import { MemoryStatusProvider } from '../src/memory/status';
import { setTransport } from '../src/memory/client';

const fixture = document.getElementById('fixture')!, root = createRoot(fixture);
const checks: { id: string; ok: boolean }[] = [], calls: string[] = [];
const title = '<b>Exact saved title</b> 中文', project = 'prj_synthetic_project_identity';
const common = { type: 'fact', status: 'active', currency: 'current', revision: 1, updatedAt: '2026-11-01T10:00:00Z' };
setTransport(async (native, args) => {
  if (native === 'shell_status') return { vaultChanging: false };
  if (native !== 'memory_call') throw Error(native);
  const r = args.request as { command: string }; calls.push(r.command);
  let result: unknown;
  if (r.command === 'workspace_status') result = { vault: { state: 'open', vaultId: 'synthetic-row-vault' }, pendingCandidates: 0 };
  else if (r.command === 'memory_list') result = { items: [
    { ...common, memoryId: 'mem_synthetic_0', title, projectId: project, evidenceCount: 0, snippet: 'Exact saved snippet zero.' },
    { ...common, memoryId: 'mem_synthetic_1', title: '   ', projectId: null, evidenceCount: 2, snippet: 'Exact saved snippet two.' },
    { ...common, memoryId: 'mem_synthetic_2', snippet: 'Legacy row without optional fields.' }], nextCursor: null, total: 3 };
  else if (r.command === 'memory_search') result = { items: [{ ...common, memoryId: 'mem_synthetic_0', projectId: project, evidenceCount: 1, snippet: 'Exact ranked search excerpt.' }], nextCursor: null };
  else throw Error(`Unexpected detail or write ${r.command}`);
  return { kind: 'memory_page', result };
});
root.render(<MemoryStatusProvider><MemorySurface /></MemoryStatusProvider>);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const rows = () => [...fixture.querySelectorAll<HTMLElement>('button.qr43')];
async function wait(test: () => boolean) { for (let i = 0; i < 250; i++) { if (test()) return; await sleep(20); } throw Error('Memory metadata fixture timeout'); }
function check(id: string, ok: boolean) { checks.push({ id, ok }); if (!ok) throw Error(id); }
try {
  await wait(() => rows().length === 3);
  check('saved_title_and_snippet_remain_literal_and_separate', rows()[0].querySelector('.mem-row-title')!.textContent === title && rows()[0].querySelector('.qr39')!.textContent === 'Exact saved snippet zero.' && !fixture.querySelector('b'));
  check('project_label_retains_exact_logical_id_without_name_lookup', rows()[0].querySelector('.mem-row-project')!.getAttribute('title') === project && !calls.some(c => c.includes('project')));
  check('zero_and_nonzero_evidence_counts_are_not_source_counts', rows()[0].querySelector('.mem-row-evidence')!.textContent === '0 evidence references' && rows()[1].querySelector('.mem-row-evidence')!.textContent === '2 evidence references');
  check('empty_or_missing_titles_do_not_generate_new_content', !rows()[1].querySelector('.mem-row-title') && !rows()[2].querySelector('.mem-row-title') && rows()[1].querySelector('.qr39')!.textContent === 'Exact saved snippet two.');
  check('missing_optional_fields_are_not_filled_with_fake_values', !rows()[2].querySelector('.mem-row-project') && !rows()[2].querySelector('.mem-row-evidence'));
  const search = fixture.querySelector<HTMLInputElement>('input[aria-label="Search memories"]')!;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(search, 'synthetic'); search.dispatchEvent(new Event('input', { bubbles: true })); await sleep(20);
  search.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await wait(() => rows().length === 1 && rows()[0].textContent!.includes('Exact ranked search excerpt.'));
  check('search_uses_its_own_metadata_and_never_borrows_saved_title', !rows()[0].querySelector('.mem-row-title') && rows()[0].querySelector('.mem-row-evidence')!.textContent === '1 evidence reference' && rows()[0].querySelector('.mem-row-project')!.getAttribute('title') === project);
  check('metadata_adds_no_reads_or_writes', calls.every(c => ['workspace_status', 'memory_list', 'memory_search'].includes(c)) && calls.filter(c => c === 'memory_list').length === 1 && calls.filter(c => c === 'memory_search').length === 1);
} catch (error) { checks.push({ id: String(error), ok: false }); }
finally { root.unmount(); document.getElementById('results')!.textContent = JSON.stringify({ checks, passed: checks.every(c => c.ok), calls }, null, 2); }
