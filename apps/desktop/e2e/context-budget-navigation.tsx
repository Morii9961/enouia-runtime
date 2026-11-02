import { createRoot } from 'react-dom/client';
import { Context } from '../src/memory/ContextSurface';
import { setTransport } from '../src/memory/client';

const fixture = document.getElementById('fixture')!, root = createRoot(fixture);
const checks: { id: string; ok: boolean }[] = [], calls: string[] = [];
let mode = 'normal', fail = false;
setTransport(async (native, args) => {
  if (native !== 'memory_call') throw Error(native);
  const r = args.request as { command: string }; calls.push(r.command);
  if (r.command !== 'context_inspect') throw Error(`Unexpected write/read ${r.command}`);
  if (fail) return { kind: 'memory_error', error: { code: 'storage_failed', retryable: false, rules: [] } };
  return { kind: 'memory_page', result: { capsule: { capsule_id: 'cap-synthetic-budget', query: 'Exact saved synthetic question', destination: { kind: 'local_mock' },
    budget: mode === 'unknown' ? null : { estimated_tokens: mode === 'over' ? 150 : 50, max_tokens: mode === 'zero' ? 0 : 100, counting_method: 'utf8_bytes_v1' } },
    inspection: { capsule_id: 'cap-synthetic-budget', decisions: [0, 1, 2].map(i => ({ record_id: `synthetic-record-${i}`, record_kind: 'memory', revision: 1, decision: i < 2 ? 'included' : 'excluded', reason: `Exact saved reason ${i}`, rank: i, source_reachable: true })) },
    delivery: 'preview_not_sent', dispatches: [] } };
});
root.render(<Context capsuleId="cap-synthetic-budget" />);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const text = () => fixture.textContent ?? '';
const button = () => [...fixture.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === 'Read saved capsule again')!;
const plot = () => fixture.querySelector('.native-capsule-budget');
async function wait(test: () => boolean) { for (let i = 0; i < 250; i++) { if (test()) return; await sleep(20); } throw Error('context budget fixture timeout'); }
function check(id: string, ok: boolean) { checks.push({ id, ok }); if (!ok) throw Error(id); }
async function refresh() { button().click(); await wait(() => !button().disabled); await sleep(30); }
try {
  await wait(() => !!plot());
  check('saved_budget_plot_keeps_real_method_and_counts', plot()!.getAttribute('aria-label')!.includes('50 of 100 units (utf8_bytes_v1)') && plot()!.querySelector<HTMLElement>('.qr94')!.style.width === '50%');
  check('navigation_counts_only_observed_decisions', fixture.querySelector('a[href="#mem-context-included"]')?.textContent === 'Included (2)' && fixture.querySelector('a[href="#mem-context-excluded"]')?.textContent === 'Excluded (1)');
  const before = calls.length; fixture.querySelector<HTMLAnchorElement>('a[href="#mem-context-excluded"]')!.click(); await sleep(20);
  check('section_navigation_does_not_prepare_or_reread_capsules', calls.length === before && text().includes('Exact saved reason 2'));
  mode = 'over'; await refresh();
  check('over_budget_keeps_actual_count_while_capping_only_fill', plot()!.getAttribute('aria-label')!.includes('150 of 100 units') && plot()!.querySelector<HTMLElement>('.qr94')!.style.width === '100%');
  mode = 'unknown'; await refresh();
  check('unknown_budget_does_not_plot_a_zero', !plot() && text().includes('Exact saved synthetic question'));
  mode = 'zero'; await refresh();
  check('zero_limit_has_no_invented_ratio', !plot());
  fail = true; await refresh();
  check('failed_read_retires_budget_and_section_observations', !plot() && !fixture.querySelector('a[href="#mem-context-included"]') && !text().includes('Exact saved synthetic question'));
  fail = false; mode = 'normal'; await refresh(); await wait(() => !!plot());
  check('fresh_saved_read_recovers_without_domain_write', text().includes('Exact saved synthetic question') && calls.every(c => c === 'context_inspect'));
} catch (error) { checks.push({ id: String(error), ok: false }); }
finally { root.unmount(); document.getElementById('results')!.textContent = JSON.stringify({ checks, passed: checks.every(c => c.ok), calls }, null, 2); }
