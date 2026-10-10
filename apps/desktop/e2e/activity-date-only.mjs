import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export async function dateOnlyMain(ctx) {
  const { settings, out, pkg, manifest, fixtureTree, launch, connect, check,
    press, fillDialog, waitFor, has, overview, shot, sleep } = ctx;
  if(existsSync(settings))throw Error('Date-only drill requires fresh owned settings');
  const store=fixtureTree(manifest.dataRoot),manifestBytes=readFileSync(join(pkg,'install.json'));
  let app,s;
  try {
    app=launch();s=await connect();await s.evaluate("document.querySelector('nav button[aria-label=\"Activity\"]').click()");
    await waitFor(s,has('Connect the installed Activity producer'),'date-only gate');
    await press(s,'Choose installed package…');fillDialog(app.pid,pkg);await waitFor(s,"document.querySelectorAll('.act-source').length===3",'date-only real sources');
    const base=await overview(s),saved=readFileSync(settings);
    check('DO.actual_package_starts_healthy',Object.keys(base.sources).sort().join(',')==='claude,codex,github');
    await s.evaluate(`(()=>{
      window.__dateBase=${JSON.stringify(base)};window.__dateReads=0;window.__dateMutations=0;window.__dateMode='date';
      const real=window.fetch,url=window.__TAURI_INTERNALS__.convertFileSrc('activity_call','ipc');
      window.fetch=async(u,o)=>{
        if(u!==url)return real(u,o);const {request}=JSON.parse(o.body);
        if(['activity_run_now','activity_retry_pending','activity_set_paused'].includes(request.operation)){window.__dateMutations++;throw Error('Date-only drill never mutates');}
        if(request.operation!=='activity_get_overview')return real(u,o);
        const reply=structuredClone(window.__dateBase),at=day=>window.__dateMode==='date'?day:day+'T12:34:00+09:00';
        reply.generatedAt=at('2026-10-10');
        for(const source of Object.values(reply.sources)){source.lastAttemptAt=at('2026-10-09');source.lastSuccessAt=at('2026-10-09');}
        reply.schedule.nextTriggerAt=at('2026-10-11');
        reply.delivery.lastTransportAt=at('2026-10-08');reply.delivery.publicationObservedAt=at('2026-10-07');reply.delivery.publicHash='a'.repeat(64);
        reply.delivery.pendingSequence=1;reply.pending={sequence:1,createdAt:at('2026-10-06'),ageSeconds:0,exactSha256:'b'.repeat(64),failureCount:0,nextEligibleAt:at('2026-10-12'),lastErrorCode:null};
        window.__dateReads++;
        return new Response(JSON.stringify(reply),{headers:{'Content-Type':'application/json','Tauri-Response':'ok'}});
      };return true;
    })()`);
    check('DO.date_only_reply_is_proved_before_display',(await overview(s)).generatedAt==='2026-10-10');
    const refresh=async()=>{const before=await s.evaluate('window.__dateReads');await press(s,'Refresh');await waitFor(s,`window.__dateReads>${before}`,'date-only read');await sleep(150);};
    await refresh();
    check('DO.date_only_keeps_source_cards',await s.evaluate("document.querySelectorAll('.act-source').length===3"));
    check('DO.updated_header_keeps_date_precision',await s.evaluate("document.querySelector('.act-badges').textContent.includes('Updated 2026-10-10')&&!/2026-10-10 \\d{2}:\\d{2}/.test(document.querySelector('.act-badges').textContent)"));
    for(const[label,date]of[['Next trigger','2026-10-11'],['Next retry','2026-10-12'],['Last transport','2026-10-08']]){
      check(`DO.${label.replaceAll(' ','_').toLowerCase()}_keeps_date_precision`,await s.evaluate(`(()=>{const term=[...document.querySelectorAll('.act-status dt')].find(e=>e.textContent===${JSON.stringify(label)});return term?.nextElementSibling.textContent===${JSON.stringify(date)};})()`));
    }
    check('DO.publication_keeps_date_precision',await s.evaluate("[...document.querySelectorAll('.act-status dt')].find(e=>e.textContent==='Published')?.nextElementSibling.textContent.startsWith('2026-10-07 · ')"));
    check('DO.source_observations_do_not_invent_clock_times',await s.evaluate("[...document.querySelectorAll('.act-source')].every(card=>card.textContent.includes('2026-10-09')&&!/2026-10-09 \\d{2}:\\d{2}/.test(card.textContent))"));
    check('DO.source_date_only_ages_remain_unknown',await s.evaluate("[...document.querySelectorAll('.act-source dt')].filter(e=>e.textContent==='Last success').every(e=>e.nextElementSibling.textContent==='2026-10-09')"));
    check('DO.pending_date_only_age_remains_unknown',await s.evaluate("[...document.querySelectorAll('.act-status dt')].find(e=>e.textContent==='Pending')?.nextElementSibling.textContent.includes('#1 · — · ')"));
    await shot(s,'01-date-only-precision');
    await s.evaluate('window.__dateMode="instant";true');await refresh();
    check('DO.explicit_offset_observations_keep_clock_display',await s.evaluate("[...document.querySelectorAll('.act-status dt')].filter(e=>['Next trigger','Next retry','Last transport'].includes(e.textContent)).every(e=>/\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}/.test(e.nextElementSibling.textContent))"));
    check('DO.explicit_offset_source_cards_stay_healthy',await s.evaluate("document.querySelectorAll('.act-source').length===3"));
    check('DO.no_producer_mutation_was_attempted',await s.evaluate('window.__dateMutations===0'));
    check('DO.saved_choice_store_and_manifest_remain_exact',readFileSync(settings).equals(saved)&&fixtureTree(manifest.dataRoot)===store&&readFileSync(join(pkg,'install.json')).equals(manifestBytes));
    await press(s,'Change package');await waitFor(s,has('Connect the installed Activity producer'),'date-only final clear');
    check('DO.final_clear_removes_only_owned_choice',!existsSync(settings)&&fixtureTree(manifest.dataRoot)===store);
  } finally {if(s)s.close();if(app){app.kill();await app.exited;}}
}
