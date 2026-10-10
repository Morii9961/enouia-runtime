import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export async function futureAgeMain(ctx) {
  const { settings, pkg, manifest, fixtureTree, launch, connect, check,
    press, fillDialog, waitFor, has, overview, shot, sleep } = ctx;
  if (existsSync(settings)) throw Error('Future-age drill requires fresh owned settings');
  const store = fixtureTree(manifest.dataRoot), manifestBytes = readFileSync(join(pkg, 'install.json'));
  let app, s;
  try {
    app = launch(); s = await connect();
    await s.evaluate("document.querySelector('nav button[aria-label=\"Activity\"]').click()");
    await waitFor(s, has('Connect the installed Activity producer'), 'future-age gate');
    await press(s, 'Choose installed package…'); fillDialog(app.pid, pkg);
    await waitFor(s, "document.querySelectorAll('.act-source').length===3", 'future-age healthy sources');
    const base = await overview(s), saved = readFileSync(settings);
    check('FA.actual_package_starts_healthy', Object.keys(base.sources).sort().join(',') === 'claude,codex,github');
    await s.evaluate(`(() => {
      window.__futureBase=${JSON.stringify(base)};window.__futureMode='future';window.__futureReads=0;window.__futureMutations=0;
      window.__futureAt=new Date(Date.now()+3600000).toISOString();window.__pastAt=new Date(Date.now()-7200000).toISOString();
      const real=window.fetch,url=window.__TAURI_INTERNALS__.convertFileSrc('activity_call','ipc');
      window.fetch=async(u,o)=>{
        if(u!==url)return real(u,o);const {request}=JSON.parse(o.body);
        if(['activity_run_now','activity_retry_pending','activity_set_paused'].includes(request.operation)){window.__futureMutations++;throw Error('Future-age drill never mutates');}
        if(request.operation!=='activity_get_overview')return real(u,o);
        const reply=structuredClone(window.__futureBase),at=window.__futureMode==='future'?window.__futureAt:window.__futureMode==='past'?window.__pastAt:'2026-10-09';
        const d=new Date(at),pad=n=>String(n).padStart(2,'0');
        window.__futureExpectedLabel=window.__futureMode==='date'?at:d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+' '+pad(d.getHours())+':'+pad(d.getMinutes());
        for(const source of Object.values(reply.sources))source.lastSuccessAt=at;
        reply.delivery.pendingSequence=1;reply.pending={sequence:1,createdAt:at,ageSeconds:0,exactSha256:'b'.repeat(64),failureCount:0,nextEligibleAt:null,lastErrorCode:null};
        window.__futureReads++;return new Response(JSON.stringify(reply),{headers:{'Content-Type':'application/json','Tauri-Response':'ok'}});
      };return true;
    })()`);
    check('FA.future_reply_is_proved', (await overview(s)).pending.createdAt === await s.evaluate('window.__futureAt'));
    const refresh = async () => {
      const before = await s.evaluate('window.__futureReads'); await press(s, 'Refresh');
      await waitFor(s, `window.__futureReads>${before}`, 'future-age read');
      await waitFor(s, "(()=>{const terms=[...document.querySelectorAll('.act-source dt')].filter(e=>e.textContent==='Last success');return terms.length===3&&terms.every(e=>e.nextElementSibling.textContent.startsWith(window.__futureExpectedLabel));})()", 'future-age committed read');
    };
    const successes = "[...document.querySelectorAll('.act-source dt')].filter(e=>e.textContent==='Last success')";
    const pending = "[...document.querySelectorAll('.act-status dt')].find(e=>e.textContent==='Pending')?.nextElementSibling.textContent";
    await refresh();
    check('FA.future_keeps_three_source_cards', await s.evaluate("document.querySelectorAll('.act-source').length===3"));
    check('FA.future_clock_labels_are_retained', await s.evaluate(`${successes}.every(e=>/^\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}/.test(e.nextElementSibling.textContent))`));
    check('FA.future_source_ages_remain_unknown', await s.evaluate(`${successes}.every(e=>!e.nextElementSibling.textContent.includes(' ago'))`));
    check('FA.future_pending_age_remains_unknown', await s.evaluate(`${pending}.includes('#1 · — · ')`));
    await shot(s, '01-future-age');
    await s.evaluate('window.__futureMode="past";true');
    check('FA.past_reply_is_proved', (await overview(s)).pending.createdAt === await s.evaluate('window.__pastAt'));
    await refresh();
    check('FA.past_source_ages_are_preserved', await s.evaluate(`${successes}.every(e=>e.nextElementSibling.textContent.endsWith(' · 2 h ago'))`));
    check('FA.past_pending_age_is_preserved', await s.evaluate(`${pending}.includes('#1 · 2 h ago · ')`));
    await s.evaluate('window.__futureMode="date";true'); await refresh();
    check('FA.date_only_source_ages_stay_unknown', await s.evaluate(`${successes}.every(e=>e.nextElementSibling.textContent==='2026-10-09')`));
    check('FA.date_only_pending_age_stays_unknown', await s.evaluate(`${pending}.includes('#1 · — · ')`));
    check('FA.no_producer_mutation_was_attempted', await s.evaluate('window.__futureMutations===0'));
    check('FA.saved_choice_store_and_manifest_remain_exact', readFileSync(settings).equals(saved) && fixtureTree(manifest.dataRoot) === store && readFileSync(join(pkg, 'install.json')).equals(manifestBytes));
    await press(s, 'Change package'); await waitFor(s, has('Connect the installed Activity producer'), 'future-age clear');
    check('FA.final_clear_removes_only_owned_choice', !existsSync(settings) && fixtureTree(manifest.dataRoot) === store);
  } finally { if (s) s.close(); if (app) { app.kill(); await app.exited; } }
}
