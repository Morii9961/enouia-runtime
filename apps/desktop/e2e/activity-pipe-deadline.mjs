import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function pipeDeadlineMain(ctx) {
  const { settings, out, pkg, manifest, fixtureTree, launch, connect, check,
    press, fillDialog, waitFor, has, overview, shot, sleep } = ctx;
  if (existsSync(settings) || realpathSync(manifest.dataRoot).toLowerCase() !==
      join(realpathSync(dirname(pkg)), 'data').toLowerCase()) throw Error('Pipe drill requires fresh contained settings/data');
  const binary=join(pkg,'enouia-activity.exe'), manifestPath=join(pkg,'install.json');
  if (realpathSync(binary)!==join(realpathSync(pkg),'enouia-activity.exe')) throw Error('Runner escaped owned package');
  const originalBinary=readFileSync(binary), originalManifest=readFileSync(manifestPath), store=fixtureTree(manifest.dataRoot);
  writeFileSync(join(out,'original-runner.bin'),originalBinary);
  writeFileSync(join(out,'original-install.json'),originalManifest);
  const helper=join(out,'pipe-helper.exe');
  const source=fileURLToPath(new URL('../src-tauri/tests/fixtures/pipe-child.rs',import.meta.url));
  execFileSync('rustc',['--edition=2024',source,'-o',helper],{windowsHide:true,timeout:30000});
  const controls=['overview','preview'].map(role=>join(pkg,'native-pipe-control',role));
  controls.forEach(path=>mkdirSync(path,{recursive:true}));
  let app, s;
  const activity=()=>s.evaluate("document.querySelector('nav button[aria-label=\"Activity\"]').click()");
  const status=()=>s.evaluate("window.__TAURI_INTERNALS__.invoke('activity_setup',{action:'status'})");
  const select=async()=>{
    await s.evaluate("window.__pipeSelect=null;window.__TAURI_INTERNALS__.invoke('activity_setup',{action:'select'}).then(r=>window.__pipeSelect=r,e=>window.__pipeSelect={error:String(e)});true");
    fillDialog(app.pid,pkg);await waitFor(s,'window.__pipeSelect!==null','pipe real picker');
    return s.evaluate('window.__pipeSelect');
  };
  const releaseHolders=async()=>{
    controls.forEach(path=>writeFileSync(join(path,'release'),'release'));
    const deadline=Date.now()+5000;
    while(Date.now()<deadline){
      const active=controls.filter(path=>existsSync(join(path,'ready'))).some(path=>{
        const pid=Number(readFileSync(join(path,'ready'),'utf8'));
        if(!Number.isSafeInteger(pid)||pid<=0)throw Error('Invalid owned holder PID');
        try{process.kill(pid,0);return true;}catch(error){if(error.code==='ESRCH')return false;throw error;}
      });
      if(!active)return;
      await sleep(50);
    }
    throw Error('Owned finite pipe holders did not exit');
  };
  const restorePackage=async()=>{
    // Exited Windows images can briefly retain a sharing lock. Retry only
    // exact bytes of this owned package; never delete or replace other files.
    const deadline=Date.now()+10000;
    while(true){
      try{writeFileSync(binary,originalBinary);writeFileSync(manifestPath,originalManifest);return;}
      catch(error){if(!['EBUSY','EPERM','EACCES'].includes(error.code)||Date.now()>=deadline)throw error;await sleep(100);}
    }
  };
  try {
    app=launch();s=await connect();await activity();
    await waitFor(s,has('Connect the installed Activity producer'),'fresh pipe gate');
    await press(s,'Choose installed package…');fillDialog(app.pid,pkg);
    await waitFor(s,"document.querySelectorAll('.act-source').length===3",'initial healthy pipe sources');
    const expected=(await overview(s)).sources, saved=readFileSync(settings);
    check('PP.initial_real_producer_is_healthy',(await status()).saved===true);
    await s.evaluate("document.querySelector('nav button[aria-label=\"Home\"]').click()");
    copyFileSync(helper,binary);
    const helperHash=createHash('sha256').update(readFileSync(helper)).digest('hex');
    writeFileSync(manifestPath,JSON.stringify({...manifest,binaryHash:helperHash})+'\n');
    check('PP.owned_helper_matches_selected_manifest',createHash('sha256').update(readFileSync(binary)).digest('hex')===helperHash);
    const selected=await select();
    check('PP.actual_picker_selects_only_sandbox_helper',selected.configured===true && selected.saved===true && selected.mode==='sandbox');
    // Tauri's native invoke property is read-only. Observe the actual IPC
    // fetch responses through a clone, preserving the page's response body.
    await s.evaluate("(()=>{window.__pipeReplies=[];const real=window.fetch,url=window.__TAURI_INTERNALS__.convertFileSrc('activity_call','ipc');window.fetch=async(u,o)=>{const response=await real(u,o);if(u===url)window.__pipeReplies.push(await response.clone().json());return response;};return true;})()");
    const start=performance.now();await activity();
    const readyDeadline=Date.now()+10000;
    while(!controls.every(path=>existsSync(join(path,'ready')))&&Date.now()<readyDeadline)await sleep(100);
    check('PP.both_owned_inherited_pipe_holders_are_ready',controls.every(path=>existsSync(join(path,'ready'))));
    const responseDeadline=Date.now()+65000;
    while(!(await s.evaluate('window.__pipeReplies.length>=2'))&&Date.now()<responseDeadline)await sleep(100);
    const elapsed=performance.now()-start;
    const replies=await s.evaluate('window.__pipeReplies');
    check('PP.actual_read_deadlines_return_busy',replies.length===2 && replies.every(reply=>reply.kind==='activity_error' && reply.error.code==='busy'),JSON.stringify(replies));
    check('PP.elapsed_read_window_is_bounded',elapsed>=18000 && elapsed<30000,`declared_ms=20000; elapsed_ms=${Math.round(elapsed)}`);
    check('PP.actual_timeout_feedback_is_visible',await s.evaluate(has('The Activity producer is busy')));
    check('PP.failure_replies_keep_helper_paths_private',!JSON.stringify(replies).includes(pkg) && !JSON.stringify(replies).includes('pipe-helper'));
    check('PP.timeout_retains_exact_saved_choice',readFileSync(settings).equals(saved));
    check('PP.timeout_preserves_complete_activity_store',fixtureTree(manifest.dataRoot)===store);
    await s.evaluate("document.querySelector('nav button[aria-label=\"Home\"]').click()");
    await releaseHolders();
    check('PP.owned_holders_finish_after_release',controls.every(path=>existsSync(join(path,'done'))));
    await restorePackage();
    check('PP.original_runner_and_manifest_are_restored',readFileSync(binary).equals(originalBinary) && readFileSync(manifestPath).equals(originalManifest));
    const recovered=await select();
    check('PP.actual_picker_reconnects_healthy_producer',recovered.configured===true && recovered.saved===true);
    await activity();await waitFor(s,"document.querySelectorAll('.act-source').length===3",'healthy pipe recovery');
    check('PP.recovery_keeps_exact_three_source_history',JSON.stringify((await overview(s)).sources)===JSON.stringify(expected));
    check('PP.recovery_keeps_complete_store',fixtureTree(manifest.dataRoot)===store);
    const clear=await s.evaluate("window.__TAURI_INTERNALS__.invoke('activity_setup',{action:'clear'})");
    check('PP.final_clear_removes_only_owned_choice',clear.saved===true && !existsSync(settings));
    await shot(s,'01-pipe-deadline-recovered');
  } finally {
    try { await releaseHolders(); } finally {
      try { if(s)s.close(); if(app){app.kill();await app.exited;} } finally {
        await restorePackage();
      }
    }
  }
}
