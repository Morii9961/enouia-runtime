// Actual Memory surface; two fictional Vault identities, all IPC mocked.
import { createRoot } from 'react-dom/client';
import MemorySurface from '../src/memory/MemorySurface';
import { MemoryStatusProvider, useStatus } from '../src/memory/status';
import { setTransport } from '../src/memory/client';
import '../src/quiet-runtime.css';
import '../src/memory/memory.css';

const fixture = document.getElementById('fixture')!;
const checks: { id: string; ok: boolean }[] = [], calls: { command: string; vault: string }[] = [];
let vault = 'vlt_fictional_a', state = 'open';
const label = () => vault === 'vlt_fictional_a' ? 'A' : 'B';
setTransport(async (native, args) => {
  if (native === 'shell_status') return { vaultChanging: false };
  if (native !== 'memory_call') throw new Error(`Unexpected native ${native}`);
  const r = args.request as { command: string; arguments: Record<string, unknown> }; calls.push({ command: r.command, vault });
  let result: unknown;
  const common = { type: 'fact', status: 'active', currency: 'current', revision: 1, updatedAt: '2026-11-01T10:00:00Z', evidenceCount: 0 };
  switch (r.command) {
    case 'workspace_status': result = { vault: state === 'open' ? { state, vaultId: vault, rootName: `Fictional Vault ${label()}` } : { state, rootName: `Fictional Vault ${label()}` }, pendingCandidates: 0 }; break;
    case 'memory_list': result = { items: [{ ...common, memoryId: `mem_fictional_${label()}`, snippet: `Vault ${label()} saved memory` }], nextCursor: null, total: 1 }; break;
    case 'memory_read': result = {
      record: { memory_id: r.arguments.memoryId, revision: 1, content: `Vault ${label()} detail for ${r.arguments.memoryId}`, approved_at: '2026-10-13T00:00:00Z', supersedes: [] },
      summary: { memoryId: r.arguments.memoryId, status: 'active', type: 'fact', expired: false, conflicted: false, sourceMissing: false },
      evidence: [], supersededBy: [] }; break;
    default: throw new Error(`Unexpected command ${r.command}`);
  }
  return { kind: 'memory_page', result };
});
function StatusControl() {
  const { refresh, status } = useStatus();
  return <button id="fixture-refresh" data-state={`${status?.vault?.state}:${status?.vault?.vaultId ?? ''}`} onClick={() => void refresh()}>Fixture: read status</button>;
}
const root = createRoot(fixture);
root.render(<MemoryStatusProvider><StatusControl /><MemorySurface /></MemoryStatusProvider>);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const text = () => fixture.textContent ?? '';
const rows = () => [...fixture.querySelectorAll<HTMLButtonElement>('button.qr43')];
async function wait(test: () => boolean) { for (let n = 0; n < 250; n++) { if (test()) return; await sleep(20); } throw new Error(`UI timeout: ${text()}`); }
async function settled(test: () => boolean) { for (let n = 0; n < 100; n++) { if (test()) return true; await sleep(20); } return false; }
async function refresh() {
  fixture.querySelector<HTMLButtonElement>('#fixture-refresh')!.click();
  await wait(() => fixture.querySelector('#fixture-refresh')?.getAttribute('data-state') === `${state}:${state === 'open' ? vault : ''}`);
}
function check(id: string, ok: boolean) { checks.push({ id, ok }); }
try {
  await wait(() => rows().length === 1 && rows()[0].textContent!.includes('Vault A saved memory'));
  rows()[0].click();
  await wait(() => text().includes('Vault A detail for mem_fictional_A'));
  check('vault_a_list_and_detail_are_observed', true);
  // The host switch completed between two status polls: no vaultChanging was observed.
  vault = 'vlt_fictional_b'; await refresh();
  check('switch_without_observed_change_withdraws_old_rows_and_detail', await settled(() => !text().includes('Vault A saved memory') && !text().includes('Vault A detail')));
  check('switch_reads_the_new_vault_list', await settled(() => rows().length === 1 && rows()[0].textContent!.includes('Vault B saved memory') && calls.some(c => c.command === 'memory_list' && c.vault === 'vlt_fictional_b')));
  check('new_vault_starts_without_an_inherited_selection', !text().includes('Vault B detail') && !rows().some(row => row.getAttribute('aria-pressed') === 'true'));
  rows()[0]?.click();
  await settled(() => text().includes('Vault B detail for mem_fictional_B'));
  state = 'locked'; await refresh();
  check('lock_withdraws_rows_and_detail', await settled(() => !text().includes('Vault B saved memory') && !text().includes('Vault B detail')));
  check('only_reads_were_sent', calls.every(c => ['workspace_status', 'memory_list', 'memory_read'].includes(c.command)));
} catch (error) { checks.push({ id: String(error), ok: false }); }
finally { root.unmount(); document.getElementById('results')!.textContent = JSON.stringify({ checks, passed: checks.every(c => c.ok), calls: calls.map(c => `${c.command}@${c.vault}`) }); }
