// Independent browser fixture for screenshots: the real Memory surface and
// persona panel with every reply mocked from Enouia Memory's synthetic
// fixtures (pin 731edd5). No native connection, picker, folder or Vault.
// ?state=options|preview|refused|held|receipt  ?theme=dark|light  ?lang=en|zh|ja
import { createRoot } from 'react-dom/client';
import { mockIPC } from '@tauri-apps/api/mocks';
import MemorySurface from '../src/memory/MemorySurface';
import { MemoryStatusProvider } from '../src/memory/status';
import { setTransport } from '../src/memory/client';
import { ready, useLang } from '../src/i18n';
import options from '../tests/fixtures/persona/options.json';
import preview from '../tests/fixtures/persona/preview.json';
import receipt from '../tests/fixtures/persona/receipt.json';
import '../src/theme/negative-fonts.css';
import '../src/quiet-runtime.css';
import '../src/memory/memory.css';
import '../src/theme/negative.css';
import '../src/theme/palettes.css';
import '../src/theme/motion.css';
import '../src/theme/cjk-fonts.css';

const params = new URLSearchParams(location.search);
const states = ['options', 'preview', 'refused', 'held', 'receipt'];
const state = states.includes(params.get('state') ?? '') ? params.get('state')! : 'options';
document.documentElement.dataset.theme = params.get('theme') === 'light' ? 'light' : 'dark';
document.documentElement.dataset.fixtureState = state;
mockIPC(async (command) => { throw Error(`Unexpected persona fixture host action ${command}`); }, { shouldMockEvents: true });
setTransport(async (native, args) => {
  if (native === 'shell_status') return { vaultChanging: false };
  if (native === 'memory_pick') return { token: 'fixture-token', displayName: 'Fictional folder', bytes: null };
  if (native !== 'memory_call') throw Error(`Unexpected native ${native}`);
  const request = (args as { request: { command: string } }).request;
  switch (request.command) {
    case 'workspace_status': return { kind: 'memory_page', result: { vault: { state: 'open', vaultId: 'vlt-fixture', rootName: 'fixture' }, pendingCandidates: 0 } };
    case 'memory_list': return { kind: 'memory_page', result: { items: [], total: 0, nextCursor: null } };
    case 'persona_options': return { kind: 'memory_page', result: options };
    case 'persona_preview': return { kind: 'memory_page', result: preview };
    case 'persona_export':
      if (state === 'refused') return { kind: 'memory_error', error: { code: 'invalid_request', retryable: false, rules: ['persona.destination_rejected', 'root.inside_repository'] } };
      if (state === 'held') throw 'worker_failed';
      return { kind: 'memory_page', result: receipt };
    default: throw Error(`Unexpected command ${request.command}`);
  }
});
function Preview() {
  useLang();
  return <>
    <header data-fixture-watermark lang="en" style={{ height: 40, boxSizing: 'border-box', padding: '10px 16px', font: '12px/18px var(--f-lab)', borderBottom: '1px solid var(--grid-major)' }}>FICTIONAL FIXTURE · NO NATIVE CONNECTION · {state}</header>
    <div style={{ height: 'calc(100vh - 40px)' }}><MemoryStatusProvider><MemorySurface /></MemoryStatusProvider></div>
  </>;
}
await ready();
createRoot(document.getElementById('fixture')!).render(<Preview />);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function wait(test: () => boolean) { for (let i = 0; i < 250; i++) { if (test()) return; await sleep(20); } throw Error('Persona fixture did not settle'); }
const byText = (selector: string, text: string) => [...document.querySelectorAll<HTMLElement>(selector)].find(e => e.textContent?.includes(text));
await wait(() => document.querySelectorAll('.qr26').length === 9);
document.querySelectorAll<HTMLButtonElement>('.qr26')[7].click();
await wait(() => document.querySelectorAll('.mem-step').length === 6);
const stepButton = (n: number) => document.querySelectorAll('.mem-step')[n - 1].querySelector<HTMLButtonElement>('button')!;
if (state !== 'options') {
  stepButton(3).click();
  await wait(() => !!document.querySelector('pre.mem-pre-file'));
}
if (['refused', 'held', 'receipt'].includes(state)) {
  document.querySelectorAll<HTMLInputElement>('.mem-step:nth-child(4) input').forEach(input => input.click());
  await wait(() => !stepButton(5).disabled);
  stepButton(5).click();
  await wait(() => state === 'refused' ? !!byText('.mem-mono', 'persona.destination_rejected') : state === 'held' ? !!document.querySelector('.mem-held') : !!document.querySelector('.mem-receipt'));
  await sleep(100);
  const target = state === 'receipt' ? '.mem-step:nth-child(6)' : '.mem-step:nth-child(5)';
  document.querySelector(target)?.scrollIntoView({ block: 'start' });
} else if (state === 'preview') {
  document.querySelector('.mem-step:nth-child(3)')?.scrollIntoView({ block: 'start' });
}
await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
document.documentElement.dataset.fixtureReady = 'true';
