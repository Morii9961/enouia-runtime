// Synthetic month/day behavior in the DOM model, no native calls.
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import Timeline from '../src/screens/automemory/Timeline';
import { setLang, useLang, type Lang } from '../src/i18n';
import { useLentMap } from '../src/theme/TimeMap';
import { dayStart } from '../src/screens/automemory/model';
import { panTo, peekView } from '../src/theme/timeview';
const fixture = document.getElementById('fixture')!, root = createRoot(fixture);
const checks: { id: string; ok: boolean }[] = [];
const check = (id: string, ok: boolean) => { checks.push({ id, ok }); if (!ok) throw Error(id); };
const sleep = () => new Promise(resolve => setTimeout(resolve, 15));
async function wait(test: () => boolean) { for (let n = 0; n < 150; n++) { if (test()) return; await sleep(); } throw Error('Month/day timeout'); }
try {
  document.documentElement.dataset.motion = 'reduced';
  function Surface() {
    useLang(); const [sel, select] = useState('am_05'); const map = useLentMap();
    return <><Timeline sel={sel} select={select} /><output data-selected={sel} data-map={map?.key} />
      <button data-external="unknown" onClick={() => select('am_02')}>unknown</button>
      <button data-external="october" onClick={() => select('am_09')}>october</button></>;
  }
  root.render(<Surface />);
  await wait(() => !!fixture.querySelector('[data-shown-month="2026-09"]') && fixture.querySelector('output')?.getAttribute('data-map') === 'timeline-months');
  check('months_are_default_and_map_is_lent',fixture.querySelector('[data-time-view="months"]')?.getAttribute('aria-pressed') === 'true' && fixture.querySelector('output')?.getAttribute('data-map') === 'timeline-months');
  check('exact_day_groups_only', [...fixture.querySelectorAll('[data-day]')].map(e => e.getAttribute('data-day')).join(',') === '2026-09-27,2026-09-29');
  check('coarse_month_is_never_day_one',!!fixture.querySelector('.am-month-coarse [data-month-record="am_06"]')&&!fixture.querySelector('[data-day="2026-09-01"]')&&!fixture.querySelector('.am-month-day [data-precision="month"]'));
  check('range_is_not_flattened_into_days',!!fixture.querySelector('.am-month-coarse [data-month-record="am_05"]')&&!fixture.querySelector('.am-month-day [data-precision="range"]'));
  check('unknown_outside_calendar',!!fixture.querySelector('.am-month-unknown [data-month-record="am_02"]')&&!fixture.querySelector('.am-month-paper [data-precision="unknown"]'));
  const day=fixture.querySelector<HTMLDetailsElement>('[data-day="2026-09-29"]')!;
  day.open=true;day.dispatchEvent(new Event('toggle'));await sleep();
  const record=day.querySelector<HTMLButtonElement>('[data-month-record="am_01"]')!;
  record.click();await wait(()=>fixture.querySelector('output')?.getAttribute('data-selected')==='am_01');
  check('expanded_day_updates_shared_selection',day.open&&record.getAttribute('aria-pressed')==='true');
  record.focus();
  for(const language of ['zh-Hans','ja','en']) {
    await setLang(language as Lang);await sleep();
    check(`${language}_keeps_day_record_focus_and_selection`,fixture.querySelector('[data-day="2026-09-29"]')===day&&day.open&&document.activeElement===record&&record.textContent!.includes('Short answers')&&record.getAttribute('aria-pressed')==='true');
  }
  fixture.querySelector<HTMLButtonElement>('[data-month="2026-10"]')!.click();
  await wait(()=>!!fixture.querySelector('[data-shown-month="2026-10"]'));
  check('month_navigation_keeps_selection_and_overlap',fixture.querySelector('output')?.getAttribute('data-selected')==='am_01'&&!!fixture.querySelector('.am-month-coarse [data-month-record="am_05"]')&&peekView('timeline-months')?.span===31*86400000);
  fixture.querySelector<HTMLButtonElement>('[data-external="unknown"]')!.click();await sleep();
  check('unknown_selection_does_not_invent_date',fixture.querySelector('output')?.getAttribute('data-selected')==='am_02'&&!!fixture.querySelector('[data-shown-month="2026-10"]'));
  fixture.querySelector<HTMLButtonElement>('[data-month="2026-07"]')!.click();await wait(()=>!!fixture.querySelector('[data-shown-month="2026-07"]'));
  check('coarse_only_month_does_not_invent_day',!fixture.querySelector('.am-month-paper [data-day]')&&!!fixture.querySelector('.am-month-coarse [data-month-record="am_13"]')); 
  fixture.querySelector<HTMLButtonElement>('[data-external="october"]')!.click();
  await wait(()=>!!fixture.querySelector('[data-shown-month="2026-10"]'));
  check('external_exact_selection_opens_its_day',fixture.querySelector<HTMLDetailsElement>('[data-day="2026-10-01"]')?.open===true);
  panTo('timeline-months',dayStart('2026-08-10'));await wait(()=>!!fixture.querySelector('[data-shown-month="2026-08"]'));
  check('map_movement_snaps_to_whole_calendar_month',peekView('timeline-months')?.start===dayStart('2026-08-01')&&peekView('timeline-months')?.span===31*86400000);
  fixture.querySelector<HTMLButtonElement>('[data-time-view="lanes"]')!.click();await wait(()=>!!fixture.querySelector('.am-tl'));
  check('theme_lanes_keep_original_selection_and_map',fixture.querySelector('output')?.getAttribute('data-selected')==='am_09'&&fixture.querySelector('output')?.getAttribute('data-map')==='timeline'&&!peekView('timeline-months'));
  fixture.querySelector<HTMLButtonElement>('[data-time-view="months"]')!.click();await wait(()=>!!fixture.querySelector('[data-shown-month="2026-10"]'));
  check('return_to_months_follows_selected_memory',fixture.querySelector('output')?.getAttribute('data-selected')==='am_09'&&!!fixture.querySelector('.am-month-day [data-month-record="am_09"][aria-pressed="true"]'));
} catch(error) { checks.push({ id: String(error), ok: false }); }
finally { root.unmount(); document.getElementById('results')!.textContent=JSON.stringify({checks,passed:checks.every(c=>c.ok)}); }
