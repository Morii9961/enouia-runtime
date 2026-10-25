// Real component, mocked native port, synthetic public fixtures. No browser/OS proof.
import { createRoot } from 'react-dom/client';
import { AutomaticMemory } from '../src/memory/AutomaticMemory';
import basePage from './fixtures/core8/page.json';
import baseDetail from './fixtures/core8/detail.json';
import baseSimulation from './fixtures/core8/simulation.json';
const fixture = document.getElementById('fixture')!;
const root = createRoot(fixture);
const checks: { id: string; ok: boolean }[] = [];
const calls: string[] = [];
let state = 'open', holdDetail = false, holdStatus = false, failBusyStatus = false;
let releaseDetail: (() => void) | null = null, releaseStatus: (() => void) | null = null;
const page = structuredClone(basePage);
const original = 'Synthetic source text <img id="core8-injected" src="invalid">';
const read = async (query: Record<string, unknown>) => {
  const operation = String(query.operation); calls.push(operation);
  const status = { schema_version: 2, capability: 'memory-native-read-1', effect: 'native_read', kind: 'runtime_memory_automation_status', mode: 'synthetic_only', state, snapshot: page.snapshot };
  if (operation === 'status') {
    if (failBusyStatus) { failBusyStatus = false; throw 'automation_busy'; }
    if (holdStatus) { holdStatus = false; await new Promise<void>(resolve => { releaseStatus = resolve; }); }
    return status;
  }
  if (operation === 'page') return structuredClone(page);
  if (operation === 'detail') {
    const detail = structuredClone(baseDetail);
    if (query.include_source_text) detail.sources[0].text = original;
    if (holdDetail) { holdDetail = false; await new Promise<void>(resolve => { releaseDetail = resolve; }); }
    return detail;
  }
  if (operation === 'simulate') return { ...structuredClone(baseSimulation), effect: 'native_read' };
  if (operation === 'lock' || operation === 'unlock') { state = operation === 'lock' ? 'locked' : 'open'; return { ...status, state, effect: 'native_control' }; }
  throw new Error('Unexpected synthetic operation');
};
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const text = () => fixture.textContent ?? '';
const button = (label: string) => [...fixture.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === label);
const click = (label: string) => { const b = button(label); if (!b || b.disabled) throw new Error(`Unavailable ${label}`); b.click(); };
async function wait(test: () => boolean) { for (let n = 0; n < 300; n++) { if (test()) return; await sleep(20); } throw new Error(`UI timeout: ${text()}`); }
const check = (id: string, ok: boolean) => checks.push({ id, ok });
try {
  root.render(<AutomaticMemory read={read} />);
  const content = page.items[0].content;
  await wait(() => !!button(content));
  check('synthetic_mode_and_separate_state_axes', text().includes('Isolated synthetic library') && text().includes('System adopted') && text().includes('validity unspecified') && text().includes('attention active'));
  click(content);
  await wait(() => !!button('Read selected original sources'));
  check('source_body_not_read_implicitly', !text().includes(original));
  check('learned_and_captured_times_stay_separate', text().includes('Learned at:') && text().includes('Source captured at:'));
  click('Read selected original sources');
  await wait(() => text().includes(original));
  check('selected_source_is_plain_text', !fixture.querySelector('#core8-injected'));
  const input = fixture.querySelector<HTMLInputElement>('input')!;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'ceramics');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(30);
  fixture.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await wait(() => text().includes('Native read · no saved experiment'));
  check('simulation_has_explicit_read_only_effect', text().includes(baseSimulation.rendered_context));
  holdDetail = true; click(content);
  await wait(() => releaseDetail !== null);
  failBusyStatus = true;
  await wait(() => !failBusyStatus);
  releaseDetail!(); releaseDetail = null;
  await sleep(50);
  check('busy_observation_hides_body_until_scope_is_reconfirmed', !text().includes('Learned at:'));
  await sleep(1700);
  check('transient_status_busy_does_not_lose_authorized_selection', text().includes('Learned at:'));
  holdDetail = true; click(content);
  await wait(() => releaseDetail !== null);
  state = 'locked';
  await wait(() => text().includes('Library: locked'));
  releaseDetail!(); releaseDetail = null; await sleep(60);
  check('late_detail_does_not_reappear_after_native_lock', !text().includes('Learned at:') && !button(content));
  click('Unlock synthetic library');
  await wait(() => !!button(content));
  holdStatus = true; await wait(() => releaseStatus !== null);
  click('Lock synthetic library');
  await wait(() => text().includes('Library: locked'));
  releaseStatus!(); releaseStatus = null; await sleep(60);
  check('late_open_status_cannot_reverse_local_lock', text().includes('Library: locked') && !button(content));
  check('simulation_never_uses_legacy_context_preview_or_writes', calls.every(c => ['status','page','detail','simulate','lock','unlock'].includes(c)));
} catch (error) { checks.push({ id: String(error), ok: false }); }
finally { releaseDetail?.(); releaseStatus?.(); root.unmount(); document.getElementById('results')!.textContent = JSON.stringify({ checks, passed: checks.every(c => c.ok), calls }); }
