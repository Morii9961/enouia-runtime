import { spawn } from 'node:child_process';
import { cpSync, existsSync, readFileSync, realpathSync, writeFileSync, openSync, closeSync } from 'node:fs';
import { dirname, join } from 'node:path';

export async function savedChoiceWriteLockMain(ctx) {
  const { settings, out, pkg, manifest, fixtureTree, launch, connect, check, press, fillDialog, waitFor, has, overview, children, shot } = ctx;
  if(existsSync(settings) || realpathSync(manifest.dataRoot).toLowerCase() !== join(realpathSync(dirname(pkg)), 'data').toLowerCase()) throw Error('Requires fresh owned settings/data');
  const alternate=join(dirname(pkg),'alternate-package');
  if(existsSync(alternate))throw Error('Alternate fixture already exists');
  cpSync(pkg,alternate,{recursive:true,errorOnExist:true,force:false});
  writeFileSync(join(alternate,'install.json'),JSON.stringify({...manifest,binary:join(alternate,'enouia-activity.exe'),config:join(alternate,'activity-config.json')}));
  const tree=fixtureTree(manifest.dataRoot);
  let app=launch(),s=await connect();
  const activity=()=>s.evaluate("document.querySelector('nav button[aria-label=\"Activity\"]').click()");
  const status=()=>s.evaluate("window.__TAURI_INTERNALS__.invoke('activity_setup',{action:'status'})");
  const stop=async()=>{s.close();app.kill();await app.exited;};
  await activity();await waitFor(s,has('Connect the installed Activity producer'),'fresh gate');
  await press(s,'Choose installed package…');fillDialog(app.pid,pkg);
  await waitFor(s,"document.querySelectorAll('.act-source').length===3",'first choice');
  if(realpathSync(settings)!==join(realpathSync(out),'activity-install.json'))throw Error('Settings escaped owned output');
  const original=readFileSync(settings),expected=(await overview(s)).sources;
  check('CW.original_picker_choice_is_verified',(await status()).saved===true);
  const holder=spawn('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',['-NoProfile','-NonInteractive','-Command',
    `$ErrorActionPreference='Stop';$f=[IO.File]::Open('${settings.replace(/'/g,"''")}','Open','Read','Read');try{'locked';Start-Sleep -Seconds 120}finally{$f.Dispose()}`],
    {windowsHide:true,stdio:['ignore','pipe','pipe']});
  children.add(holder);holder.exited=new Promise(r=>holder.once('exit',c=>{children.delete(holder);r(c);}));
  try{
    await new Promise((resolve,reject)=>{let text='';const timer=setTimeout(()=>reject(Error('Write holder not ready')),10000);holder.stdout.on('data',b=>{text+=b;if(text.includes('locked')){clearTimeout(timer);resolve();}});holder.once('error',e=>{clearTimeout(timer);reject(e);});holder.once('exit',()=>{clearTimeout(timer);reject(Error('Write holder exited'));});});
    let denied=false,fd;
    try{fd=openSync(settings,'r+');}catch(e){denied=['EBUSY','EACCES','EPERM'].includes(e.code);}finally{if(fd!==undefined)closeSync(fd);}
    check('CW.actual_write_open_is_refused',denied);
    check('CW.ordinary_read_remains_available',readFileSync(settings).equals(original));
    await s.evaluate("window.__writeChoiceReply=null;window.__TAURI_INTERNALS__.invoke('activity_setup',{action:'select'}).then(r=>window.__writeChoiceReply=r);true");
    fillDialog(app.pid,alternate);
    await waitFor(s,"window.__writeChoiceReply!==null",'actual native alternate selection');
    await s.evaluate("document.querySelector('nav button[aria-label=\"Home\"]').click()");await activity();
    await waitFor(s,has('Package connected for this window'),'actual alternate save failure');
    const refused=await status();
    check('CW.real_alternate_choice_connects_but_save_refuses',refused.configured===true&&refused.folder==='alternate-package'&&refused.saved===false);
    check('CW.failed_save_retains_exact_previous_choice',readFileSync(settings).equals(original));
    check('CW.connected_alternate_retains_exact_three_histories',JSON.stringify((await overview(s)).sources)===JSON.stringify(expected));
    await s.evaluate("document.querySelector('nav button[aria-label=\"Home\"]').click()");await activity();
    await waitFor(s,has('Package connected for this window'),'failed save remount');
    check('CW.failed_save_warning_survives_remount',await s.evaluate(has('Package connected for this window')));
    await stop();app=launch();s=await connect();await activity();
    await waitFor(s,"document.querySelectorAll('.act-source').length===3",'old choice restart');
    const restarted=await status();
    check('CW.restart_loads_previous_saved_package',restarted.configured===true&&restarted.folder==='package'&&restarted.saved===true);
    check('CW.restart_preserves_exact_old_settings',readFileSync(settings).equals(original));
    check('CW.fault_and_restart_preserve_complete_store',fixtureTree(manifest.dataRoot)===tree);
  }finally{holder.kill();await holder.exited;}
await s.evaluate("window.__writeChoiceReply=null;window.__TAURI_INTERNALS__.invoke('activity_setup',{action:'select'}).then(r=>window.__writeChoiceReply=r);true");
    fillDialog(app.pid,alternate);
    await waitFor(s,"window.__writeChoiceReply!==null",'actual native alternate selection');
    await s.evaluate("document.querySelector('nav button[aria-label=\"Home\"]').click()");await activity();
  await waitFor(s,"document.querySelectorAll('.act-source').length===3",'released alternate choice');
  check('CW.release_allows_real_alternate_save',(await status()).folder==='alternate-package'&&(await status()).saved===true);
  const saved=readFileSync(settings);
  check('CW.recovered_choice_intentionally_replaces_old_bytes',!saved.equals(original));
  check('CW.recovered_choice_clears_warning',!(await s.evaluate(has('Package connected for this window'))));
  await stop();app=launch();s=await connect();await activity();
  await waitFor(s,"document.querySelectorAll('.act-source').length===3",'new saved choice restart');
  const restarted=await status();
  check('CW.restart_loads_new_verified_choice',restarted.folder==='alternate-package'&&restarted.saved===true);
  check('CW.restart_retains_exact_new_settings',readFileSync(settings).equals(saved));
  check('CW.all_save_faults_preserve_complete_store',fixtureTree(manifest.dataRoot)===tree);
  const clear=await s.evaluate("window.__TAURI_INTERNALS__.invoke('activity_setup',{action:'clear'})");
  check('CW.final_clear_removes_only_owned_choice',clear.saved===true&&clear.configured===false&&!existsSync(settings));
  await shot(s,'01-choice-write-recovered');await stop();
}
