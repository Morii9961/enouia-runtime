import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, readFileSync, realpathSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';

export async function scheduleContainerMain(ctx) {
  const {settings,out,pkg,manifest,fixtureTree,launch,connect,check,press,fillDialog,waitFor,has,overview,shot,sleep}=ctx;
  if(existsSync(settings)) throw Error('Schedule-container drill requires fresh owned settings');
  const binary=join(pkg,'enouia-activity.exe'), manifestPath=join(pkg,'install.json');
  if(realpathSync(binary)!==join(realpathSync(pkg),'enouia-activity.exe')) throw Error('Runner escaped owned package');
  const originalBinary=readFileSync(binary), originalManifest=readFileSync(manifestPath), store=fixtureTree(manifest.dataRoot);
  const helper=join(out,'reply-runner.exe');
  execFileSync('rustc',['--edition=2024',fileURLToPath(new URL('../src-tauri/tests/fixtures/reply-runner.rs',import.meta.url)),'-o',helper],{windowsHide:true,timeout:30000});
  const restore=async()=>{
    const deadline=Date.now()+10000;
    while(true) {
      try {writeFileSync(binary,originalBinary);writeFileSync(manifestPath,originalManifest);return;}
      catch(error){if(!['EBUSY','EPERM','EACCES'].includes(error.code)||Date.now()>=deadline)throw error;await sleep(100);}
    }
  };
  let app,s;
  const navigate=async(label)=>{await s.evaluate(`document.querySelector('nav button[aria-label=${JSON.stringify(label)}]').click()`);};
  const invoke=operation=>s.evaluate(`window.__TAURI_INTERNALS__.invoke('activity_call',{request:{operation:${JSON.stringify(operation)}}}).catch(error=>({transportError:String(error)}))`);
  const select=async()=>{
    await s.evaluate("window.__scheduleSelection=null;window.__TAURI_INTERNALS__.invoke('activity_setup',{action:'select'}).then(reply=>window.__scheduleSelection=reply,error=>window.__scheduleSelection={error:String(error)});true");
    fillDialog(app.pid,pkg);await waitFor(s,'window.__scheduleSelection!==null','actual schedule picker');
    return s.evaluate('window.__scheduleSelection');
  };
  const writeOverview=reply=>writeFileSync(join(pkg,'native-overview-reply.json'),JSON.stringify(reply)+'\n');
  try {
    app=launch();s=await connect();await navigate('Activity');
    await waitFor(s,has('Connect the installed Activity producer'),'schedule gate');
    await press(s,'Choose installed package…');fillDialog(app.pid,pkg);
    await waitFor(s,"document.querySelectorAll('.act-source').length===3",'actual healthy source cards');
    const healthy=await overview(s), preview=await invoke('activity_preview_public_payload'), saved=readFileSync(settings);
    check('SC.actual_producer_starts_healthy',healthy.kind==='activity_overview'&&preview.kind==='activity_public_preview');
    await navigate('Home');await waitFor(s,"!document.querySelector('.act-surface')",'leave actual producer');
    const base=structuredClone(healthy);base.health=base.health.filter(h=>h.id!=='activity_scheduler');
    writeFileSync(join(pkg,'native-preview-reply.json'),JSON.stringify(preview)+'\n');
    writeOverview({...base,schedule:'private-synthetic-path'});
    writeFileSync(binary,readFileSync(helper));
    const helperHash=createHash('sha256').update(readFileSync(helper)).digest('hex');
    writeFileSync(manifestPath,JSON.stringify({...manifest,binaryHash:helperHash})+'\n');
    check('SC.owned_reply_runner_matches_manifest',createHash('sha256').update(readFileSync(binary)).digest('hex')===helperHash);
    const selected=await select();check('SC.actual_picker_selects_sandbox_helper',selected.configured===true&&selected.saved===true&&selected.mode==='sandbox');
    const cases=[['string','private-synthetic-path'],['boolean',false],['number',2],['array',[]],['null',null],['missing',undefined]];
    for(const [name,schedule] of cases) {
      const reply=structuredClone(base);if(schedule===undefined)delete reply.schedule;else reply.schedule=schedule;writeOverview(reply);
      const result=await invoke('activity_get_overview');
      check(`SC.${name}_schedule_returns_contract_invalid`,result.kind==='activity_error'&&result.error?.code==='contract_invalid'&&result.error.retryable===false,JSON.stringify(result));
      check(`SC.${name}_refusal_keeps_paths_private`,!JSON.stringify(result).includes('private-synthetic-path')&&!JSON.stringify(result).includes(pkg));
      if(name==='string') {
        await navigate('Activity');await waitFor(s,"!!document.querySelector('.mem-error')",'actual malformed schedule feedback');
        check('SC.client_displays_contract_refusal',await s.evaluate(has('The response did not match Activity IPC v1')));
        check('SC.contract_failure_disables_mutations',await s.evaluate("['Run now','Retry pending','Pause activity sync'].every(text=>[...document.querySelectorAll('button')].find(button=>button.textContent.trim()===text)?.disabled===true)"));
        await navigate('Home');await waitFor(s,"!document.querySelector('.act-surface')",'leave malformed schedule');
      }
    }
    writeOverview(base);const decorated=await invoke('activity_get_overview');
    check('SC.valid_object_keeps_source_history',JSON.stringify(decorated.sources)===JSON.stringify(healthy.sources));
    check('SC.valid_object_retains_schedule_mode',decorated.schedule.mode===healthy.schedule.mode);
    check('SC.valid_object_adds_one_scheduler_health',decorated.health.filter(h=>h.id==='activity_scheduler').length===1);
    const structured={schemaVersion:1,kind:'activity_error',error:{code:'storage_failed',component:'activity_archive',retryable:false}};
    writeOverview(structured);check('SC.runner_error_passes_through',isDeepStrictEqual(await invoke('activity_get_overview'),structured));
    check('SC.controlled_reads_preserve_store',fixtureTree(manifest.dataRoot)===store);
    await restore();check('SC.original_runner_and_manifest_restored',readFileSync(binary).equals(originalBinary)&&readFileSync(manifestPath).equals(originalManifest));
    const recovered=await select();check('SC.actual_picker_recovers_original_runner',recovered.configured===true&&recovered.saved===true);
    await navigate('Activity');await waitFor(s,"document.querySelectorAll('.act-source').length===3",'healthy schedule recovery');
    check('SC.recovery_retains_exact_history',JSON.stringify((await overview(s)).sources)===JSON.stringify(healthy.sources));
    check('SC.choice_remains_exact',readFileSync(settings).equals(saved));
    check('SC.complete_store_remains_exact',fixtureTree(manifest.dataRoot)===store);
    await shot(s,'01-schedule-container-recovered');
  } finally {
    try {if(s)s.close();if(app){app.kill();await app.exited;}} finally {await restore();}
  }
}
