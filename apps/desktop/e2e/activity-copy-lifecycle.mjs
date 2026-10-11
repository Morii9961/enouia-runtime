import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';

export async function copyLifecycleMain(ctx) {
  const { settings, out, pkg, manifest, fixtureTree, launch, connect, check,
    press, fillDialog, waitFor, has, overview, shot, sleep } = ctx;
  if(existsSync(settings))throw Error('Copy drill requires fresh owned settings');
  const store=fixtureTree(manifest.dataRoot), manifestBytes=readFileSync(join(pkg,'install.json'));
  let app,s;
  const copied=has('Sanitized summary copied'), failed=has('Copy failed');
  const noFeedback=`!(${copied})&&!(${failed})`;
  const copy=async()=>{
    const before=await s.evaluate('window.__copyCalls.length');
    await press(s,'Copy diagnostic summary');
    await waitFor(s,`window.__copyCalls.length===${before+1}`,'captured clipboard write');
    return before;
  };
  const finish=async(index,success)=>{
    await s.evaluate(`window.__copyCalls[${index}].${success?'resolve()':"reject(new Error('SYNTHETIC_PRIVATE_CLIPBOARD_ERROR'))"};true`);
    await sleep(100);
  };
  const refresh=async()=>{
    const before=await s.evaluate('window.__copyReads');
    await press(s,'Refresh');
    await waitFor(s,`window.__copyReads>=${before+2}`,'actual refreshed read pair');
    await sleep(100);
  };
  try {
    app=launch();s=await connect();
    await s.evaluate("document.querySelector('nav button[aria-label=\"Activity\"]').click()");
    await waitFor(s,has('Connect the installed Activity producer'),'copy gate');
    await press(s,'Choose installed package…');fillDialog(app.pid,pkg);
    await waitFor(s,"document.querySelectorAll('.act-source').length===3",'copy healthy sources');
    const sources=(await overview(s)).sources, saved=readFileSync(settings);
    check('CP.actual_package_starts_healthy',Object.keys(sources).join(',')==='claude,codex,github');
    await s.evaluate(`(()=>{
      window.__copyCalls=[];window.__copyReads=0;window.__copyHoldReads=false;window.__copyReadReleases=[];
      Object.defineProperty(navigator.clipboard,'writeText',{configurable:true,value:text=>new Promise((resolve,reject)=>window.__copyCalls.push({text,resolve,reject}))});
      const real=window.fetch,url=window.__TAURI_INTERNALS__.convertFileSrc('activity_call','ipc');
      window.fetch=async(u,o)=>{const response=await real(u,o);if(u===url){await response.clone().json();window.__copyReads++;if(window.__copyHoldReads)await new Promise(resolve=>window.__copyReadReleases.push(resolve));}return response;};return true;
    })()`);
    const first=await copy();
    check('CP.clipboard_substitution_is_proved_before_testing',first===0 && await s.evaluate('window.__copyCalls[0].text.length>0'));
    const text=await s.evaluate('window.__copyCalls[0].text'), exported=JSON.parse(text);
    check('CP.copy_keeps_exact_sanitized_three_source_snapshot',exported.kind==='activity_overview' && exported.schemaVersion===1 && JSON.stringify(exported.sources)===JSON.stringify(sources) && text===JSON.stringify(exported,null,2));
    check('CP.copy_contains_no_package_paths',!text.includes(pkg)&&!text.includes(realpathSync(pkg)));
    await finish(first,true);
    check('CP.current_success_is_visible',await s.evaluate(copied));
    await refresh();
    check('CP.refresh_clears_prior_copy_feedback',await s.evaluate(noFeedback));

    const lateRefresh=await copy();await refresh();await finish(lateRefresh,true);
    check('CP.pre_refresh_success_cannot_reappear',await s.evaluate(noFeedback));
    const lateFailure=await copy();await refresh();await finish(lateFailure,false);
    check('CP.pre_refresh_failure_cannot_reappear',await s.evaluate(noFeedback));

    await s.evaluate('window.__copyHoldReads=true;true');await press(s,'Refresh');
    await waitFor(s,'window.__copyReadReleases.length===2','held actual refreshed pair');
    check('CP.actual_refresh_replies_are_observed_before_timing_hold',await s.evaluate('window.__copyReadReleases.length===2'));
    const duringRefresh=await copy();
    await s.evaluate('window.__copyHoldReads=false;window.__copyReadReleases.forEach(release=>release());true');
    await sleep(200);await finish(duringRefresh,true);
    check('CP.copy_started_during_refresh_cannot_label_new_snapshot',await s.evaluate(noFeedback));

    const older=await copy(), latest=await copy();await finish(latest,true);
    check('CP.latest_concurrent_success_is_visible',await s.evaluate(copied));
    await finish(older,false);
    check('CP.older_failure_cannot_replace_latest_success',await s.evaluate(copied)&&!(await s.evaluate(failed)));
    const olderSuccess=await copy(), latestFailure=await copy();await finish(latestFailure,false);
    check('CP.latest_concurrent_failure_is_visible',await s.evaluate(failed));
    await finish(olderSuccess,true);
    check('CP.older_success_cannot_replace_latest_failure',await s.evaluate(failed)&&!(await s.evaluate(copied)));
    check('CP.private_clipboard_error_is_never_rendered',!(await s.evaluate(has('SYNTHETIC_PRIVATE_CLIPBOARD_ERROR'))));

    const lateChoice=await copy();await press(s,'Change package');
    await waitFor(s,has('Connect the installed Activity producer'),'copy actual clear');
    check('CP.actual_clear_removes_only_owned_choice',!existsSync(settings)&&fixtureTree(manifest.dataRoot)===store);
    await press(s,'Choose installed package…');fillDialog(app.pid,pkg);
    await waitFor(s,"document.querySelectorAll('.act-source').length===3",'copy picker recovery');
    await finish(lateChoice,true);
    check('CP.previous_package_copy_cannot_reappear_after_selection',await s.evaluate(noFeedback));
    const recovered=await copy();await finish(recovered,true);
    check('CP.current_copy_recovers_after_reselection',await s.evaluate(copied));
    check('CP.reselection_preserves_saved_choice_and_history',readFileSync(settings).equals(saved)&&JSON.stringify((await overview(s)).sources)===JSON.stringify(sources));
    check('CP.all_clipboard_requests_use_only_sanitized_overviews',await s.evaluate("window.__copyCalls.every(call=>{const value=JSON.parse(call.text);return value.kind==='activity_overview'&&value.schemaVersion===1&&Object.keys(value.sources).sort().join(',')==='claude,codex,github';})"));
    check('CP.entire_store_and_manifest_remain_exact',fixtureTree(manifest.dataRoot)===store && readFileSync(join(pkg,'install.json')).equals(manifestBytes));
    await shot(s,'01-copy-lifecycle-recovered');
    await press(s,'Change package');await waitFor(s,has('Connect the installed Activity producer'),'copy final clear');
    check('CP.final_clear_removes_only_owned_choice',!existsSync(settings)&&fixtureTree(manifest.dataRoot)===store);
  } finally {
    if(s){try{await s.evaluate('window.__copyReadReleases?.forEach(release=>release());window.__copyCalls?.forEach(call=>call.resolve());true');}catch{}s.close();}
    if(app){app.kill();await app.exited;}
  }
}
