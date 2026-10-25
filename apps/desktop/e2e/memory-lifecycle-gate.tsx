// Actual Memory surface with synthetic lifecycle, lists and operation status.
import { createRoot } from 'react-dom/client';
import MemorySurface from '../src/memory/MemorySurface';
import { MemoryStatusProvider, useStatus } from '../src/memory/status';
import { setTransport } from '../src/memory/client';
import '../src/quiet-runtime.css';
import '../src/memory/memory.css';

const fixture = document.getElementById('fixture')!;
const root = createRoot(fixture);
const checks: { id: string; ok: boolean }[] = [], calls: string[] = [];
let changing = false, exiting = false, state = 'open', holdImport = false;
let release: (() => void) | null = null;
const releasePending = () => { const resolve = release; release = null; resolve?.(); };
setTransport(async (native, args) => {
  if (native === 'shell_status') return { vaultChanging: changing };
  if (native !== 'memory_call') throw new Error(`Unexpected native ${native}`);
  const r = args.request as { command: string }; calls.push(r.command);
  let result: unknown;
  switch (r.command) {
    case "history_task_list": result = { identity: { commitId: "synthetic-head" }, items: [], nextCursor: null, readOnly: true }; break;
    case 'workspace_status': result = { vault: { state, rootName: 'Synthetic Vault' }, pendingCandidates: 0, companion: { exiting }, components: [] }; break;
    case 'memory_list': case 'candidate_list': result = { items: [], total: 0, nextCursor: null }; break;
    case 'import_list':
      if (holdImport) { holdImport = false; await new Promise<void>(resolve => { release = resolve; }); }
      result = { items: [] }; break;
    case 'operation_list': result = { items: [] }; break;
    default: throw new Error(`Unexpected command ${r.command}`);
  }
  return { kind: 'memory_page', result };
});
function StatusControl() {
  const { refresh, status, vaultChanging } = useStatus();
  return <button id="fixture-refresh" data-state={`${status?.vault?.state}:${vaultChanging}:${status?.companion?.exiting}`}
    onClick={() => void refresh()}>Fixture: read lifecycle</button>;
}
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const text = () => fixture.textContent ?? '';
const surface = () => fixture.querySelector('[data-screen-label="Memory Vault"]');
const button = (label: string) => [...(surface()?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find(b => b.textContent?.trim() === label);
function click(label: string) { const control = button(label); if (!control || control.disabled) throw new Error(`Unavailable ${label}`); control.click(); }
async function wait(test: () => boolean) { for (let n = 0; n < 250; n++) { if (test()) return; await sleep(20); } throw new Error(`UI timeout: ${text()}`); }
async function refresh() {
  fixture.querySelector<HTMLButtonElement>('#fixture-refresh')!.click();
  await wait(() => fixture.querySelector('#fixture-refresh')?.getAttribute('data-state') === `${state}:${changing}:${exiting}`);
  await sleep(30);
}
function check(id: string, ok: boolean) { checks.push({ id, ok }); }
const routes = [
  { label: 'Current memories', control: 'Refresh results' },
  { label: 'Candidate inbox0', control: 'Save as candidate' },
  { label: 'Import', control: 'Choose file…' },
  { label: 'Vault & recoveryopen', control: 'Verify Vault' },
];
try {
  for (const [index, route] of routes.entries()) {
    changing = false; exiting = false; state = 'open';
    root.render(<div key={index} data-case={index}><MemoryStatusProvider><StatusControl /><MemorySurface /></MemoryStatusProvider></div>);
    await wait(() => fixture.firstElementChild?.getAttribute('data-case') === String(index) && !!button('Refresh results'));
    if (index) click(route.label);
    await wait(() => !!button(route.control));
    changing = true; await refresh();
    check(`${index}_open_core_during_host_change_closes_controls`, !button(route.control) && text().includes('Runtime is finishing Memory operations'));
    state = 'none'; await refresh();
    check(`${index}_detached_core_still_waits_for_host`, !button('Open an existing Vault…') && text().includes('Runtime is finishing Memory operations'));
    state = 'locked'; await refresh();
    check(`${index}_locked_core_cannot_unlock_during_change`, !button('Unlock') && text().includes('Runtime is finishing Memory operations'));
    state = 'open'; exiting = true; await refresh();
    check(`${index}_exit_takes_precedence_over_open_and_change`, !button(route.control) && text().includes('Enouia Runtime is exiting.') && !text().includes('Runtime is finishing Memory operations'));
    changing = false; exiting = false; await refresh();
    await wait(() => !!button(route.control));
    check(`${index}_recovery_restores_selected_route`, !!button(route.control) && !text().includes('Enouia Runtime is exiting.'));
  }
  // A list already in flight belongs to the old mount; reopening reads anew.
  click('Import'); await wait(() => !!button('Refresh import list'));
  holdImport = true; click('Refresh import list'); await wait(() => release != null);
  changing = true; await refresh();
  click('Current memories');
  check('navigation_while_changing_keeps_lifecycle_gate', !button('Refresh results') && !button('Choose file…') && text().includes('Runtime is finishing Memory operations'));
  releasePending(); await sleep(30);
  check('late_list_cannot_reopen_gated_surface', !button('Choose file…') && !text().includes('No recorded imports yet.'));
  changing = false; await refresh(); await wait(() => !!button('Refresh results'));
  const before = calls.filter(command => command === 'import_list').length;
  click('Import'); await wait(() => text().includes('No recorded imports yet.'));
  check('reopening_import_observes_fresh_list', calls.filter(command => command === 'import_list').length === before + 1);
  check('lifecycle_probe_never_opens_files_or_writes', calls.every(command => ['history_task_list', 'operation_list', 'workspace_status', 'memory_list', 'candidate_list', 'import_list', 'operation_list'].includes(command)));
} catch (error) { checks.push({ id: String(error), ok: false }); }
finally { releasePending(); root.unmount(); document.getElementById('results')!.textContent = JSON.stringify({ checks, passed: checks.every(c => c.ok), calls }, null, 2); }
