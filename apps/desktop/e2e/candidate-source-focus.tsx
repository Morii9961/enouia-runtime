// Actual citation reader. DOM focus assertions do not claim physical input.
import { createRoot } from 'react-dom/client';
import { CandidateSource } from '../src/memory/CandidateSource';
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
function click(label: string) { const control = button(label); if (!control || control.disabled) throw new Error(`Unavailable ${label}`); control.focus(); control.click(); }
async function begin(label: string) { click(label); await wait(() => release != null); }
async function finish() { releasePending(); await wait(() => !text().includes('Reading the source…')); await sleep(20); }
async function mount(revision: number) {
  root.render(<ul data-revision={revision}><CandidateSource key={revision} evidence={{ sourceId: 'synthetic-source', sourceRevision: revision, supports: 'content', locator: { kind: 'byte_range', start: 3, end: 8 } }} readPage={request} /></ul>);
  await wait(() => fixture.firstElementChild?.getAttribute('data-revision') === String(revision) && !!button('Show evidence source'));
}
try {
  outside.focus(); await mount(1);
  check('mount_does_not_read_or_move_focus', calls.length === 0 && document.activeElement === outside);
  await begin('Show evidence source'); await finish();
  check('explicit_read_focuses_literal_source', document.activeElement === content() && content()?.textContent === 'Synthetic part 0');
  await begin('Next source part');
  check('paging_retires_previous_part', !content()); await finish();
  check('paging_focuses_new_part', document.activeElement === content() && content()?.textContent === 'Synthetic part 4096');
  await begin('Next source part'); await finish();
  check('last_page_keeps_reading_focus_without_next_button', document.activeElement === content() && !button('Next source part'));
  await begin('Read source again'); outside.focus(); await finish();
  check('read_completion_respects_moved_focus', document.activeElement === outside && !!content());
  failure = 'permanent'; await begin('Next source part'); await finish();
  check('nonretryable_failure_focuses_explicit_read_recovery', !button('Retry') && document.activeElement === button('Read source again') && !!fixture.querySelector('[role="alert"]'));
  failure = 'none'; await begin('Read source again'); await finish();
  check('manual_recovery_returns_to_source_without_mutation', document.activeElement === content() && content()?.textContent === 'Synthetic part 0');
  failure = 'retry'; await begin('Next source part'); await finish();
  const original = calls.at(-1);
  failure = 'none'; await begin('Retry'); await finish();
  check('retry_restores_source_focus', document.activeElement === content() && content()?.textContent === 'Synthetic part 4096');
  check('retry_keeps_exact_source_revision_and_page', JSON.stringify(calls.at(-1)) === JSON.stringify(original));
  failure = 'retry'; await begin('Next source part'); outside.focus(); await finish();
  check('failure_respects_moved_focus', document.activeElement === outside);
  failure = 'none'; await begin('Retry'); outside.focus(); await finish();
  check('retry_respects_moved_focus', document.activeElement === outside && !!content());
  await begin('Read source again'); click('Hide evidence source'); await sleep(20);
  check('hide_restores_show_control_focus', document.activeElement === button('Show evidence source') && !content());
  releasePending(); await sleep(30);
  check('hidden_late_read_cannot_restore_content_or_focus', !content() && document.activeElement === button('Show evidence source'));
  await begin('Show evidence source'); outside.focus(); await mount(2); releasePending(); await sleep(30);
  check('revision_change_drops_old_focus_intent', document.activeElement === outside && !content());
  await begin('Show evidence source'); outside.focus(); root.unmount(); releasePending(); await sleep(30);
  check('unmount_drops_pending_focus_intent', document.activeElement === outside);
  check('journey_only_reads_bounded_exact_citations', calls.every(c => c.command === 'source_excerpt' && c.args.sourceId === 'synthetic-source' && [1, 2].includes(Number(c.args.sourceRevision)) && c.args.maxBytes === 4096));
} catch (error) { checks.push({ id: String(error), ok: false }); }
finally { releasePending(); root.unmount(); outside.remove(); document.getElementById('results')!.textContent = JSON.stringify({ checks, passed: checks.every(c => c.ok) }, null, 2); }
