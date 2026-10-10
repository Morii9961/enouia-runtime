import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export async function errorOwnershipMain(ctx) {
  const { settings, out, pkg, manifest, fixtureTree, launch, connect, check,
    press, fillDialog, waitFor, has, overview, shot, sleep } = ctx;
  if(existsSync(settings))throw Error('Error drill requires fresh owned settings');
  const store=fixtureTree(manifest.dataRoot), manifestBytes=readFileSync(join(pkg,'install.json'));
  let app,s;
  const busy=has('The Activity producer is busy');
  const retry="[...document.querySelectorAll('.mem-error button')].some(b=>b.textContent.trim()==='Retry')";
  const activity=()=>s.evaluate("document.querySelector('nav button[aria-label=\"Activity\"]').click()");
  const refresh=async()=>{
    const before=await s.evaluate('window.__errorReads');
    await press(s,'Refresh');await waitFor(s,`window.__errorReads>=${before+2}`,'error refresh replies');await sleep(100);
  };
  const release=async(success=true)=>{
    await s.evaluate(`window.__statusHolds.shift()(${success});true`);await sleep(100);
  };
  const startCase=async()=>{
    await s.evaluate("document.querySelector('nav button[aria-label=\"Home\"]').click()");
    await s.evaluate('window.__statusHolds.forEach(resolve=>resolve(true));window.__statusHolds=[];window.__statusMode="first_busy";window.__readBusy=false;window.__readCode="busy";window.__errorStarts=0;window.__errorQueries=0;true');
    await activity();await waitFor(s,"document.querySelectorAll('.act-source').length===3",'error actual healthy reads');
    await press(s,'Run now');await waitFor(s,busy,'modeled run-status busy');
    await waitFor(s,'window.__statusHolds.length===1','owned held status read');
  };
  const recover=async()=>{
    await s.evaluate('window.__readBusy=false;window.__statusMode="completed";window.__statusHolds.forEach(resolve=>resolve(true));window.__statusHolds=[];true');
    await waitFor(s,"document.querySelector('.act-run')?.textContent.includes('Completed')&&document.querySelectorAll('.act-source').length===3",'terminal read recovery');
  };
  try {
    app=launch();s=await connect();await activity();await waitFor(s,has('Connect the installed Activity producer'),'error gate');
    await press(s,'Choose installed package…');fillDialog(app.pid,pkg);
    await waitFor(s,"document.querySelectorAll('.act-source').length===3",'error initial actual reads');
    const sources=(await overview(s)).sources, saved=readFileSync(settings);
    check('EO.actual_package_starts_healthy',Object.keys(sources).sort().join(',')==='claude,codex,github');
    await s.evaluate(`(()=>{
      window.__statusMode='completed';window.__readBusy=false;window.__readCode='busy';window.__statusHolds=[];
      window.__errorStarts=0;window.__errorQueries=0;window.__errorReads=0;
      const real=window.fetch,url=window.__TAURI_INTERNALS__.convertFileSrc('activity_call','ipc');
      const failure={schemaVersion:1,kind:'activity_error',error:{code:'busy',component:'activity_archive',retryable:true}};
      const status=stage=>({schemaVersion:1,kind:'activity_run_status',runId:'run-error-owned',stage,error:null});
      window.fetch=async(u,o)=>{
        if(u!==url)return real(u,o);
        const {request}=JSON.parse(o.body);let reply;
        if(['activity_run_now','activity_retry_pending'].includes(request.operation)){
          window.__errorStarts++;reply={schemaVersion:1,kind:'activity_run_accepted',runId:'run-error-owned'};
        }else if(request.operation==='activity_get_run'){
          window.__errorQueries++;
          if(window.__statusMode==='first_busy'){window.__statusMode='hold';reply=failure;}
          else if(window.__statusMode==='hold'){const success=await new Promise(resolve=>window.__statusHolds.push(resolve));reply=success?status(window.__statusMode==='completed'?'completed':'running'):failure;}
          else reply=status(window.__statusMode==='completed'?'completed':'running');
        }else if(['activity_get_overview','activity_preview_public_payload'].includes(request.operation)){
          if(window.__readBusy)reply={...failure,error:{...failure.error,code:window.__readCode,retryable:window.__readCode==='busy'}};
          else{const response=await real(u,o);await response.clone().json();window.__errorReads++;return response;}
          window.__errorReads++;
        }else return real(u,o);
        return new Response(JSON.stringify(reply),{headers:{'Content-Type':'application/json','Tauri-Response':'ok'}});
      };return true;
    })()`);
    const probe=await s.evaluate("window.__TAURI_INTERNALS__.invoke('activity_call',{request:{operation:'activity_run_now'}})");
    check('EO.modeled_start_is_proved_before_page_mutation',probe.runId==='run-error-owned'&&await s.evaluate('window.__errorStarts===1'));

    await startCase();
    check('EO.status_failure_is_visible',await s.evaluate(busy));
    await release(true);
    check('EO.status_recovery_clears_its_own_error',!(await s.evaluate(busy)));
    check('EO.status_recovery_keeps_one_start',await s.evaluate('window.__errorStarts===1'));
    await recover();

    await startCase();await s.evaluate('window.__readBusy=true;true');await refresh();
    check('EO.failed_refresh_retains_retry',await s.evaluate(busy)&&await s.evaluate(retry));
    check('EO.equal_error_text_is_not_duplicated',await s.evaluate("[...document.querySelectorAll('.mem-error')].filter(e=>e.textContent.includes('The Activity producer is busy')).length===1"));
    await release(true);
    check('EO.status_recovery_preserves_same_text_read_failure',await s.evaluate(busy)&&await s.evaluate(retry));
    check('EO.failed_refresh_keeps_mutations_disabled',await s.evaluate("[...document.querySelectorAll('button')].filter(b=>['Run now','Pause activity sync'].includes(b.textContent.trim())).every(b=>b.disabled)"));
    check('EO.first_collision_keeps_one_start',await s.evaluate('window.__errorStarts===1'));
    const retainedRetry=await s.evaluate(retry);
    await s.evaluate('window.__readBusy=false;true');await press(s,retainedRetry?'Retry':'Refresh');
    await waitFor(s,"document.querySelectorAll('.act-source').length===3",'read retry recovery');
    check('EO.actual_read_retry_clears_read_failure',retainedRetry&&!(await s.evaluate(busy)));
    await recover();

    await startCase();await s.evaluate('window.__readBusy=true;true');await refresh();await release(false);
    await waitFor(s,'window.__statusHolds.length===1','second held status retry');await release(true);
    check('EO.repeated_status_failures_cannot_erase_read_failure',await s.evaluate(busy)&&await s.evaluate(retry));
    check('EO.repeated_status_failure_keeps_one_start',await s.evaluate('window.__errorStarts===1'));
    await recover();

    await startCase();await refresh();
    check('EO.healthy_refresh_preserves_unrecovered_status_failure',await s.evaluate(busy));
    check('EO.healthy_refresh_keeps_three_sources',await s.evaluate("document.querySelectorAll('.act-source').length===3"));
    await release(true);
    check('EO.final_status_recovery_clears_only_its_error',!(await s.evaluate(busy)));
    await recover();

    await startCase();await s.evaluate('window.__readBusy=true;window.__readCode="source_invalid";true');await refresh();
    const invalid=has('A source returned data that failed validation');
    check('EO.distinct_errors_remain_independently_visible',await s.evaluate(busy)&&await s.evaluate(invalid));
    check('EO.nonretryable_read_error_has_no_retry',!(await s.evaluate(retry)));
    await release(true);
    check('EO.distinct_read_failure_survives_status_recovery',await s.evaluate(invalid)&&!(await s.evaluate(busy)));
    await recover();
    check('EO.all_scenarios_preserve_exact_saved_choice',readFileSync(settings).equals(saved));
    check('EO.recovered_histories_match_real_producer',JSON.stringify((await overview(s)).sources)===JSON.stringify(sources));
    check('EO.entire_store_and_manifest_remain_exact',fixtureTree(manifest.dataRoot)===store&&readFileSync(join(pkg,'install.json')).equals(manifestBytes));
    await shot(s,'01-error-ownership-recovered');
    await press(s,'Change package');await waitFor(s,has('Connect the installed Activity producer'),'error final clear');
    check('EO.final_clear_removes_only_owned_choice',!existsSync(settings)&&fixtureTree(manifest.dataRoot)===store);
  } finally {
    if(s){try{await s.evaluate('window.__statusHolds?.forEach(resolve=>resolve(true));true');}catch{}s.close();}
    if(app){app.kill();await app.exited;}
  }
}
