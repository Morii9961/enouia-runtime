// Actual approved-memory source reader. All excerpts/errors are synthetic.
import { createRoot } from 'react-dom/client';
import { Source } from '../src/memory/ui';
import { CallError, type call } from '../src/memory/client';
import '../src/quiet-runtime.css';
import '../src/memory/memory.css';

const fixture = document.getElementById('fixture')!, root = createRoot(fixture);
const outside = document.createElement('input'); outside.setAttribute('aria-label', 'Other draft'); document.body.appendChild(outside);
const checks: { id: string; ok: boolean }[] = [], calls: { command: string; args: Record<string, unknown> }[] = [];
let failure: 'none' | 'retry' | 'permanent' = 'none', release: (() => void) | null = null;
const releasePending = () => { const resolve = release; release = null; resolve?.(); };
const request: typeof call = async (command, args = {}) => {
  calls.push({ command, args });
  if (command !== 'source_excerpt') throw new Error(`Unexpected ${command}`);
  const fault = failure;
  await new Promise<void>(resolve => { release = resolve; });
  if (fault !== 'none') throw new CallError({ code: 'not_found', retryable: fault === 'retry', rules: [] });
  const start = Number(args.startByte ?? 0);
  return { sourceId: args.sourceId, sourceRevision: args.sourceRevision, sourceKind: 'explicit_remember', speakerRole: 'user',
    byteStart: start, byteEnd: start + 4096, totalBytes: 12288, excerpt: `Synthetic part ${start}`, untrusted: true };
};
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const button = (label: string) => [...fixture.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === label);
const content = () => fixture.querySelector<HTMLPreElement>('pre.mem-source');
const text = () => fixture.textContent ?? '';
async function wait(test: () => boolean) { for (let n = 0; n < 250; n++) { if (test()) return; await sleep(20); } throw new Error(`UI timeout: ${text()}`); }
function check(id: string, ok: boolean) { checks.push({ id, ok }); }
async function begin(label: string) { const control = button(label); if (!control || control.disabled) throw new Error(`Unavailable ${label}`); control.focus(); control.click(); await wait(() => release != null); }
async function finish() { releasePending(); await wait(() => !text().includes('Reading the source…')); await sleep(20); }
async function mount(revision: number, available = true, sourceId = 'synthetic-source') {
  // No key: exercise Source's own identity/availability invalidation effect.
  root.render(<ul data-identity={`${sourceId}:${revision}:${available}`}><Source evidence={{ available, sourceId, sourceRevision: revision, supports: 'content' }} readPage={request} /></ul>);
  await wait(() => fixture.firstElementChild?.getAttribute('data-identity') === `${sourceId}:${revision}:${available}`); await sleep(20);
}
try {
  outside.focus(); await mount(1);
  check('mount_does_not_read_or_move_focus', calls.length === 0 && document.activeElement === outside);
  await begin('Show source'); await finish();
  check('explicit_read_focuses_literal_source', document.activeElement === content() && content()?.textContent === 'Synthetic part 0');
  await begin('Next part'); check('paging_retires_previous_part', !content()); await finish();
  check('paging_focuses_new_part', document.activeElement === content() && content()?.textContent === 'Synthetic part 4096');
  await begin('Next part'); await finish();
  check('last_page_focus_survives_removed_next_control', document.activeElement === content() && !button('Next part'));
  await begin('Show source'); outside.focus(); await finish();
  check('success_respects_moved_focus', document.activeElement === outside && !!content());
  failure = 'permanent'; await begin('Next part'); await finish();
  check('permanent_failure_focuses_manual_read_control', !button('Retry') && document.activeElement === button('Show source'));
  failure = 'none'; await begin('Show source'); await finish();
  check('manual_recovery_focuses_source', document.activeElement === content());
  failure = 'retry'; await begin('Next part'); await finish(); const original = calls.at(-1);
  failure = 'none'; await begin('Retry'); await finish();
  check('retry_focuses_exact_source_page', document.activeElement === content() && content()?.textContent === 'Synthetic part 4096' && JSON.stringify(calls.at(-1)) === JSON.stringify(original));
  failure = 'retry'; await begin('Next part'); outside.focus(); await finish();
  check('failure_respects_moved_focus', document.activeElement === outside);
  failure = 'none'; await begin('Retry'); outside.focus(); await finish();
  check('retry_respects_moved_focus', document.activeElement === outside && !!content());
  await begin('Show source'); outside.focus(); await mount(1, false); releasePending(); await sleep(30);
  check('availability_withdrawal_drops_pending_focus_and_text', document.activeElement === outside && !content() && !button('Show source'));
  const before = calls.length; await mount(1);
  check('availability_recovery_waits_for_explicit_read', calls.length === before && document.activeElement === outside && !content());
  await begin('Show source'); outside.focus(); await mount(2); releasePending(); await sleep(30);
  check('revision_change_discards_old_focus_intent_without_remount', document.activeElement === outside && !content());
  await begin('Show source'); outside.focus(); await mount(2, true, 'synthetic-source-two'); releasePending(); await sleep(30);
  check('source_change_discards_old_focus_intent_without_remount', document.activeElement === outside && !content());
  await begin('Show source'); outside.focus(); root.unmount(); releasePending(); await sleep(30);
  check('unmount_discards_pending_focus_intent', document.activeElement === outside);
  check('focus_journey_only_reads_bounded_sources', calls.every(c => c.command === 'source_excerpt' && c.args.maxBytes === 4096));
} catch (error) { checks.push({ id: String(error), ok: false }); }
finally { releasePending(); root.unmount(); outside.remove(); document.getElementById('results')!.textContent = JSON.stringify({ checks, passed: checks.every(c => c.ok) }, null, 2); }
