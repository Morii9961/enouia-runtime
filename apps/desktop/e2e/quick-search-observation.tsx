// Actual main.tsx overlay component; SDK mocks keep every host action synthetic.
import { createRoot } from 'react-dom/client';
import { mockIPC, clearMocks } from '@tauri-apps/api/mocks';
import { emit } from '@tauri-apps/api/event';
import QuickSearch from '../src/shell/QuickSearch';
import { setTransport } from '../src/memory/client';
import '../src/quiet-runtime.css';
import '../src/memory/memory.css';

const fixture = document.getElementById('fixture')!;
const checks: { id: string; ok: boolean }[] = [];
const calls: { command: string; args: Record<string, unknown>; key: unknown }[] = [];
let release: (() => void) | null = null;
const releasePending = () => { const resolve = release; release = null; resolve?.(); };
let fail = false, hidden = 0, holdNext = false, mounted = true;
mockIPC(async native => {
  if (native === 'shell_hide') { hidden++; return null; }
  throw new Error(`Unexpected host action ${native}`);
}, { shouldMockEvents: true });
setTransport(async (native, args) => {
  if (native !== 'memory_call') throw new Error(`Unexpected native command ${native}`);
  const r = args.request as { command: string; arguments: Record<string, unknown>; idempotencyKey: unknown };
  calls.push({ command: r.command, args: r.arguments, key: r.idempotencyKey });
  if (r.command !== 'memory_search') throw new Error(`Unexpected write ${r.command}`);
  const query = String(r.arguments.query);
  if (holdNext) { holdNext = false; await new Promise<void>(resolve => { release = resolve; }); }
  if (fail) return { kind: 'memory_error', error: { code: 'busy', retryable: true, rules: [] } };
  return { kind: 'memory_page', result: { items: query === 'No matches' ? [] : [{ memoryId: 'mem_synthetic', snippet: `Saved match for ${query}`, currency: 'current' }], nextCursor: null } };
});
const root = createRoot(fixture); root.render(<QuickSearch />);
const text = () => fixture.textContent ?? '';
const input = () => fixture.querySelector<HTMLInputElement>('#quick-query')!;
const button = (label: string) => [...fixture.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === label);
const outside = () => document.getElementById('outside')!;
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function wait(test: () => boolean) { for (let n = 0; n < 250; n++) { if (test()) return; await sleep(20); } throw new Error(`UI timeout: ${text()}`); }
async function settled() { await wait(() => fixture.querySelector('main')!.getAttribute('aria-busy') === 'false'); await frame(); }
async function edit(value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input(), value);
  input().dispatchEvent(new Event('input', { bubbles: true })); await frame();
}
const submit = () => fixture.querySelector<HTMLFormElement>('form')!.requestSubmit();
async function start(control: HTMLButtonElement | undefined) {
  if (!control || control.disabled) throw new Error('Unavailable control');
  holdNext = true; control.focus(); control.click(); await wait(() => release != null); await frame();
}
function check(id: string, ok: boolean) { checks.push({ id, ok }); }
try {
  // Let initial window focus/clear effects settle before entering any query.
  await new Promise<void>(resolve => document.getElementById('start')!.addEventListener('click', () => resolve(), { once: true }));
  document.getElementById('start')!.remove();
  document.getElementById('results')!.textContent = 'Running synthetic checks…';
  await wait(() => !!input()); await frame();
  check('unsearched_overlay_does_not_invent_empty_results', !text().includes('No approved memories match') && fixture.querySelectorAll('li').length === 0);
  await edit('Held first query'); holdNext = true; submit(); await wait(() => release != null); await frame();
  check('submitted_query_shows_waiting_until_read_settles', text().includes('Searching…') && fixture.querySelector('main')!.getAttribute('aria-busy') === 'true');
  await edit('Second query');
  check('editing_invalidates_the_pending_query_observation', !text().includes('Searching…') && fixture.querySelector('main')!.getAttribute('aria-busy') === 'false');
  releasePending(); await frame(); await frame();
  check('late_old_query_reply_cannot_publish_under_new_input', fixture.querySelectorAll('li').length === 0 && input().value === 'Second query');
  check('editing_does_not_issue_a_search', calls.length === 1);
  submit(); await wait(() => text().includes('Saved match for Second query'));
  check('explicit_submission_reads_the_current_query', calls.length === 2 && calls.at(-1)!.args.query === 'Second query');
  await edit('No matches');
  check('editing_clears_previously_observed_matches', fixture.querySelectorAll('li').length === 0);
  submit(); await frame(); await settled();
  check('successful_empty_read_has_explicit_no_match_feedback', text().includes('No approved memories match.'));
  await edit('Error query');
  check('editing_clears_previous_no_match_observation', !text().includes('No approved memories match'));
  fail = true; submit(); await wait(() => !!button('Retry'));
  check('failed_search_offers_read_retry_without_empty_claim', !text().includes('No approved memories match') && !!fixture.querySelector('[role="alert"]'));
  const beforeEdit = calls.length;
  await edit('Recovered query');
  check('editing_invalidates_the_old_error_and_retry', !button('Retry') && !fixture.querySelector('[role="alert"]') && calls.length === beforeEdit);
  fail = false; submit(); await wait(() => text().includes('Saved match for Recovered query'));
  check('fresh_submission_uses_the_new_query_only', calls.at(-1)!.args.query === 'Recovered query');

  await edit('Button search'); await start(button('Search')); releasePending(); await settled();
  check('search_button_completion_returns_focus_to_input', document.activeElement === input());
  await start(button('Search')); releasePending(); await settled();
  check('repeated_same_query_completion_restores_input_focus', document.activeElement === input());
  fail = true; await start(button('Search')); releasePending(); await wait(() => !!button('Retry')); await frame();
  check('failed_button_search_returns_focus_to_input', document.activeElement === input());
  fail = false; await start(button('Retry')); releasePending(); await settled();
  check('retry_completion_returns_focus_to_input', document.activeElement === input());
  await start(button('Search')); outside().focus(); releasePending(); await settled();
  check('completion_respects_focus_moved_to_another_control', document.activeElement === outside());
  await start(button('Search')); await edit('Later draft'); outside().focus(); releasePending(); await frame(); await frame();
  check('editing_invalidates_pending_focus_and_results', document.activeElement === outside() && input().value === 'Later draft' && fixture.querySelectorAll('li').length === 0);
  await start(button('Search')); window.dispatchEvent(new Event('blur')); outside().focus(); releasePending(); await frame(); await frame();
  check('blur_invalidates_held_results_and_focus', input().value === '' && document.activeElement === outside() && fixture.querySelectorAll('li').length === 0 && !text().includes('Searching…'));
  window.dispatchEvent(new Event('focus')); await frame();
  check('focus_reopens_with_an_empty_focused_input', input().value === '' && document.activeElement === input());
  await edit('Before clear event'); await start(button('Search')); await emit('overlay-clear'); await frame(); outside().focus(); releasePending(); await frame(); await frame();
  check('host_clear_event_invalidates_pending_focus_and_results', input().value === '' && document.activeElement === outside() && fixture.querySelectorAll('li').length === 0);
  await edit('Before Escape'); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await frame();
  check('escape_clears_and_uses_existing_hide_command', hidden === 1 && input().value === '' && fixture.querySelectorAll('li').length === 0);
  await edit('Before unmount'); await start(button('Search')); root.unmount(); mounted = false; outside().focus(); releasePending(); await frame(); await frame();
  check('unmounted_search_cannot_return_focus_or_publish', document.activeElement === outside() && !fixture.querySelector('main'));
  check('search_keeps_existing_read_only_scope_and_limit', calls.every(c => c.command === 'memory_search' && c.key === null && c.args.includeHistorical === false && c.args.cursor === null && c.args.limit === 8));
} catch (error) { checks.push({ id: String(error), ok: false }); }
finally { releasePending(); if (mounted) root.unmount(); await Promise.resolve(); clearMocks(); document.getElementById('results')!.textContent = JSON.stringify({ checks, passed: checks.every(c => c.ok), searches: calls.length }, null, 2); }
