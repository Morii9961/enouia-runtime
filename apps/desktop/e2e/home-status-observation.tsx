// Native Home component; status is synthetic and navigation stays local.
import { createRoot } from 'react-dom/client';
import { ConnectedHome, MemoryStatusProvider, useStatus } from '../src/memory/status';
import { setTransport } from '../src/memory/client';
import '../src/quiet-runtime.css';
import '../src/memory/memory.css';

const fixture = document.getElementById('fixture')!, root = createRoot(fixture);
const checks: { id: string; ok: boolean }[] = [], calls: string[] = [], navigations: string[] = [];
let hold = true, fail = false, changing = false, exiting = false, state = 'none', pending: number | null = 0;
let release: (() => void) | null = null;
const releasePending = () => { const resolve = release; release = null; resolve?.(); };
setTransport(async (native, args) => {
  if (native === 'shell_status') return { vaultChanging: changing };
  if (native !== 'memory_call') throw new Error(`Unexpected native ${native}`);
  const r = args.request as { command: string }; calls.push(r.command);
  if (r.command !== 'workspace_status') throw new Error(`Unexpected command ${r.command}`);
  if (hold) { hold = false; await new Promise<void>(resolve => { release = resolve; }); }
  if (fail) return { kind: 'memory_error', error: { code: 'storage_failed', retryable: false, rules: [] } };
  return { kind: 'memory_page', result: { vault: { state, rootName: 'Synthetic Vault', headSequence: 7, lastCommitAt: '2026-10-16T00:00:00Z' }, pendingCandidates: pending, companion: { exiting } } };
});
function Control() {
  const { refresh, status, error, vaultChanging } = useStatus();
  return <button id="fixture-refresh" data-status={status ? `${status.vault.state}:${vaultChanging}:${status.companion.exiting}:${status.pendingCandidates}` : error ? 'failed' : 'unknown'} onClick={() => void refresh()}>Fixture: read status</button>;
}
const nav = Object.fromEntries(['memory', 'sessions', 'context'].map(name => [name, { go: () => navigations.push(name) }]));
root.render(<MemoryStatusProvider><Control /><ConnectedHome nav={nav} ring={null} /></MemoryStatusProvider>);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const home = () => fixture.querySelector<HTMLElement>('[data-screen-label="Home"]');
const text = () => home()?.textContent ?? '';
const review = () => home()?.querySelector('.qr12 .qr10')?.textContent ?? '';
async function wait(test: () => boolean) { for (let n = 0; n < 250; n++) { if (test()) return; await sleep(20); } throw new Error(`UI timeout: ${fixture.textContent}`); }
function check(id: string, ok: boolean) { checks.push({ id, ok }); }
async function refresh() {
  fixture.querySelector<HTMLButtonElement>('#fixture-refresh')!.click();
  await wait(() => fixture.querySelector('#fixture-refresh')?.getAttribute('data-status') === (fail ? 'failed' : `${state}:${changing}:${exiting}:${pending}`));
}
try {
  await wait(() => release != null && !!home());
  check('unobserved_status_does_not_prompt_vault_creation', review() === 'Memory status unknown' && !text().includes('Open or create a Vault to begin'));
  check('native_home_has_no_activity_entry', !text().includes('Activity'));
  fail = true; releasePending(); await wait(() => fixture.querySelector('#fixture-refresh')?.getAttribute('data-status') === 'failed');
  check('failed_status_stays_unknown_instead_of_no_vault', review() === 'Memory status unknown' && !text().includes('Open or create a Vault to begin'));
  fail = false; await refresh();
  check('observed_no_vault_offers_open_or_create', review() === 'Open or create a Vault to begin');
  state = 'locked'; await refresh();
  check('observed_locked_vault_offers_unlock', review().includes('unlock it in Memory Vault'));
  state = 'open'; pending = null; await refresh();
  check('unobserved_queue_does_not_claim_empty', review() === 'Review queue could not be read');
  pending = 0; await refresh();
  check('observed_empty_queue_reports_nothing_waiting', review() === 'Nothing waiting for review');
  pending = 2; await refresh();
  check('observed_pending_count_is_retained', review() === '2 candidates waiting for your review' && text().includes('Last commit'));
  changing = true; await refresh();
  check('host_change_precedes_open_queue_and_commit', review().includes('Finishing Memory operations') && !text().includes('Last commit'));
  exiting = true; await refresh();
  check('exit_precedes_host_change_and_open_queue', review().includes('Runtime is exiting') && !text().includes('Last commit') && home()?.querySelector('.qr12 .qr11')?.textContent === 'exiting');
  changing = false; await refresh();
  check('exit_without_host_change_still_withholds_open_details', review().includes('Runtime is exiting') && !text().includes('Last commit'));
  exiting = false; await refresh();
  check('fresh_open_status_recovers_queue_and_commit', review() === '2 candidates waiting for your review' && text().includes('Last commit'));
  for (const control of home()!.querySelectorAll<HTMLButtonElement>('.qr12')) control.click();
  check('home_routes_remain_explicit_local_navigation', navigations.join(',') === 'memory,sessions,context');
  fail = true; await refresh();
  check('lost_status_drops_previous_open_details', review() === 'Memory status unknown' && !text().includes('Last commit') && !text().includes('2 candidates waiting'));
  check('home_only_observes_workspace_status', calls.every(command => command === 'workspace_status'));
} catch (error) { checks.push({ id: String(error), ok: false }); }
finally { releasePending(); root.unmount(); document.getElementById('results')!.textContent = JSON.stringify({ checks, passed: checks.every(c => c.ok), calls, navigations }, null, 2); }
