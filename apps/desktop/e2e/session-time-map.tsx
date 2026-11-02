// Connected Sessions component; synthetic saved events, no native environment.
import { createRoot } from 'react-dom/client';
import { Sessions } from '../src/memory/SessionsSurface';
import { setTransport } from '../src/memory/client';
import { useLentMap } from '../src/theme/TimeMap';

const fixture = document.getElementById('fixture')!, root = createRoot(fixture);
const checks: { id: string; ok: boolean }[] = [], calls: string[] = [];
let fail = false, mode = 'known', hold = false, release: (() => void) | null = null;
const releasePending = () => { const resolve = release; release = null; resolve?.(); };
const at = ['00:00:00', '00:02:30', '01:02:30', '01:03:00'];
setTransport(async (native, args) => {
  if (native === 'memory_provider_setup') return { state: 'absent' };
  if (native !== 'memory_call') throw Error(native);
  const r = args.request as { command: string; arguments: Record<string, unknown> }; calls.push(r.command);
  let result: unknown;
  if (r.command === 'operation_list') result = { items: [] };
  else if (r.command === 'provider_status') result = { configured: false, destinations: [], grants: [] };
  else if (r.command === 'session_list') result = { items: [{ sessionId: 'synthetic-time-session', updatedAt: '2026-11-01T01:03:00Z', branches: [{ branchId: 'synthetic-time-branch', lastEventSeq: 4 }] }] };
  else if (r.command === 'session_detail') {
    if (hold) { hold = false; await new Promise<void>(resolve => { release = resolve; }); }
    if (fail) return { kind: 'memory_error', error: { code: 'storage_failed', retryable: false, rules: [] } };
    result = { ...r.arguments, transcript: at.map((time, i) => ({ eventId: `event-${i}`, kind: i === 2 ? 'checkpoint_created' : 'user_message', deliveryState: 'not_applicable',
      occurredAt: mode === 'unknown' && i === 1 ? null : `2026-11-01T${mode === 'reversed' && i === 1 ? '00:00:00' : time}Z`, text: `Exact saved text ${i}` })),
      turns: [], checkpoints: [{ checkpoint_id: 'checkpoint-synthetic', status: 'provisional', summary: 'Exact saved checkpoint summary', covered_event_ids: ['event-0', 'event-1'], coverage_hash: 'a'.repeat(64), created_at: '2026-11-01T01:02:30Z' }], invocations: [], extractionJobs: [], lastSavedEventId: 'event-3' };
  } else throw Error(`Unexpected write ${r.command}`);
  return { kind: 'memory_page', result };
});
function Probe() {
  const spec = useLentMap();
  return <output id="map-probe" data-key={spec?.key ?? ''} data-ticks={spec?.ticks.length ?? 0} data-checkpoints={spec?.ticks.filter(t => t.tall).length ?? 0} />;
}
root.render(<><Probe /><Sessions inspect={() => { throw Error('Unexpected navigation'); }} /></>);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const probe = () => fixture.querySelector('#map-probe')!;
const rows = () => [...fixture.querySelectorAll<HTMLElement>('.mem-native-transcript>.mem-event')];
const button = (label: string) => [...fixture.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === label)!;
async function wait(test: () => boolean) { for (let i = 0; i < 250; i++) { if (test()) return; await sleep(20); } throw Error('time-map fixture timeout'); }
function check(id: string, ok: boolean) { checks.push({ id, ok }); if (!ok) throw Error(id); }
async function refresh() { button(fail ? 'Refresh saved session' : button('Read session again') ? 'Read session again' : 'Refresh saved session').click(); await wait(() => !fixture.querySelector<HTMLTextAreaElement>('#mem-ask')?.disabled && !button('Refresh saved session')?.disabled || !!button('Read session again')); await sleep(30); }
try {
  await wait(() => !!fixture.querySelector('.mem-session-row'));
  fixture.querySelector<HTMLButtonElement>('.mem-session-row')!.click();
  await wait(() => rows().length === 4 && !!probe().getAttribute('data-key'));
  check('map_is_scoped_to_the_loaded_session_and_branch', probe().getAttribute('data-key') === 'native-session:synthetic-time-session:synthetic-time-branch');
  check('map_contains_only_saved_events_and_checkpoint_kind', probe().getAttribute('data-ticks') === '4' && probe().getAttribute('data-checkpoints') === '1');
  check('real_adjacent_intervals_determine_capped_gaps', rows().map(r => r.style.getPropertyValue('--event-gap')).join(',') === '0px,5px,48px,1px');
  check('checkpoint_marks_only_its_saved_event', rows().map(r => r.hasAttribute('data-checkpoint')).join(',') === 'false,false,true,false');
  check('coverage_is_not_selected_or_inferred_from_checkpoint_event', rows().every(r => !r.hasAttribute('data-coverage')) && fixture.querySelector<HTMLSelectElement>('#mem-checkpoint-coverage')!.value === '');
  const coverage = fixture.querySelector<HTMLSelectElement>('#mem-checkpoint-coverage')!;
  coverage.value = 'checkpoint-synthetic'; coverage.dispatchEvent(new Event('change', { bubbles: true }));
  await wait(() => rows()[0].getAttribute('data-coverage') === 'start');
  check('selected_saved_ids_define_the_bracket_without_including_checkpoint_event', rows().map(r => r.getAttribute('data-coverage') ?? '').join(',') === 'start,end,,' && fixture.querySelector('.mem-transcript')!.getAttribute('aria-describedby') === 'mem-checkpoint-coverage-note');
  check('time_semantics_keep_exact_original_iso_values', rows()[1].querySelector('time')?.dateTime === '2026-11-01T00:02:30Z' && rows()[1].querySelector('time')?.title === '2026-11-01T00:02:30Z');
  hold = true; button('Refresh saved session').click(); await wait(() => release != null && probe().getAttribute('data-key') === '');
  check('pending_read_withdraws_map_and_keeps_labeled_saved_text', rows()[0].textContent!.includes('Exact saved text 0') && !probe().getAttribute('data-key'));
  check('pending_read_withdraws_coverage_without_clearing_saved_body', rows().every(r => !r.hasAttribute('data-coverage')) && fixture.querySelector<HTMLSelectElement>('#mem-checkpoint-coverage')!.disabled);
  fail = true; releasePending(); await wait(() => !!button('Read session again'));
  check('failed_read_cannot_republish_prior_map', !probe().getAttribute('data-key') && fixture.textContent!.includes('previous successful read'));
  check('failed_read_cannot_republish_prior_coverage', rows().every(r => !r.hasAttribute('data-coverage')));
  fail = false; await refresh(); await wait(() => !!probe().getAttribute('data-key'));
  check('fresh_read_recovers_known_map', probe().getAttribute('data-ticks') === '4');
  check('fresh_read_recovers_coverage_from_current_saved_ids', rows()[0].getAttribute('data-coverage') === 'start' && rows()[1].getAttribute('data-coverage') === 'end');
  mode = 'unknown'; await refresh();
  check('unknown_time_drops_map_without_inventing_an_interval', !probe().getAttribute('data-key') && rows()[1].style.getPropertyValue('--event-gap') === '0px' && rows()[2].style.getPropertyValue('--event-gap') === '0px' && rows()[1].textContent!.includes('time unavailable'));
  check('known_saved_ids_still_define_coverage_when_times_are_unknown', rows()[0].getAttribute('data-coverage') === 'start' && rows()[1].getAttribute('data-coverage') === 'end');
  mode = 'known'; await refresh(); await wait(() => !!probe().getAttribute('data-key'));
  check('refresh_does_not_rewrite_saved_body_or_event_order', rows().map(r => r.querySelector('.mem-content')?.textContent).join('|') === at.map((_, i) => `Exact saved text ${i}`).join('|'));
  root.render(<Probe />); await wait(() => probe().getAttribute('data-key') === '');
  check('leaving_transcript_retires_lent_map', !probe().getAttribute('data-key'));
  check('ruler_and_map_add_no_domain_reads_or_writes', calls.every(c => ['operation_list', 'provider_status', 'session_list', 'session_detail'].includes(c)));
} catch (error) { checks.push({ id: String(error), ok: false }); }
finally { releasePending(); root.unmount(); document.getElementById('results')!.textContent = JSON.stringify({ checks, passed: checks.every(c => c.ok), calls }, null, 2); }
