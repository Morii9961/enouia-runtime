import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync,realpathSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';

export async function daysMetadataMain(ctx) {
 const {settings,out,pkg,manifest,fixtureTree,launch,connect,check,press,fillDialog,waitFor,has,overview,sleep}=ctx;
 if(existsSync(settings))throw Error('Days metadata requires fresh owned settings');
 const binary=join(pkg,'enouia-activity.exe'),manifestPath=join(pkg,'install.json');
 if(realpathSync(binary)!==join(realpathSync(pkg),'enouia-activity.exe'))throw Error('Runner escaped owned package');
 const originalBinary=readFileSync(binary),originalManifest=readFileSync(manifestPath),store=fixtureTree(manifest.dataRoot),helper=join(out,'reply-runner.exe');
 execFileSync('rustc',['--edition=2024',fileURLToPath(new URL('../src-tauri/tests/fixtures/reply-runner.rs',import.meta.url)),'-o',helper],{windowsHide:true,timeout:30000});
 const restore=async()=>{const deadline=Date.now()+10000;while(true){try{writeFileSync(binary,originalBinary);writeFileSync(manifestPath,originalManifest);return;}catch(error){if(!['EBUSY','EPERM','EACCES'].includes(error.code)||Date.now()>=deadline)throw error;await sleep(100);}}};
 let app,s;
 const navigate=label=>s.evaluate(`document.querySelector('nav button[aria-label=${JSON.stringify(label)}]').click()`);
 const call=request=>s.evaluate(`window.__TAURI_INTERNALS__.invoke('activity_call',{request:${JSON.stringify(request)}}).catch(error=>({transportError:String(error)}))`);
 const select=async()=>{await s.evaluate("window.__metadataSelection=null;window.__TAURI_INTERNALS__.invoke('activity_setup',{action:'select'}).then(reply=>window.__metadataSelection=reply,error=>window.__metadataSelection={error:String(error)});true");fillDialog(app.pid,pkg);await waitFor(s,'window.__metadataSelection!==null','actual metadata picker');return s.evaluate('window.__metadataSelection');};
 const writePreview=reply=>writeFileSync(join(pkg,'native-preview-reply.json'),JSON.stringify(reply)+'\n');
 const request=source=>({operation:'activity_get_days',source,from:'2026-10-01',to:'2026-10-31'});
 const entries=[{date:'2026-10-01',value:0},{date:'2026-10-31',value:2}];
 try {
  app=launch();s=await connect();await navigate('Activity');await waitFor(s,has('Connect the installed Activity producer'),'metadata gate');await press(s,'Choose installed package…');fillDialog(app.pid,pkg);await waitFor(s,"document.querySelectorAll('.act-source').length===3",'metadata healthy setup');
  const healthy=await overview(s),base=await call({operation:'activity_preview_public_payload'}),saved=readFileSync(settings);check('DM.actual_producer_starts_healthy',healthy.kind==='activity_overview'&&base.kind==='activity_public_preview');
  await navigate('Home');await waitFor(s,"!document.querySelector('.act-surface')",'leave metadata producer');writeFileSync(join(pkg,'native-overview-reply.json'),JSON.stringify(healthy)+'\n');writePreview(base);writeFileSync(binary,readFileSync(helper));const helperHash=createHash('sha256').update(readFileSync(helper)).digest('hex');writeFileSync(manifestPath,JSON.stringify({...manifest,binaryHash:helperHash})+'\n');check('DM.owned_reply_runner_matches_manifest',createHash('sha256').update(readFileSync(binary)).digest('hex')===helperHash);const selected=await select();check('DM.actual_picker_selects_sandbox_helper',selected.configured===true&&selected.saved===true&&selected.mode==='sandbox');
  const cases=[['github_boundary','github','timezone','Asia/Shanghai'],['codex_boundary','codex','timezone','GitHub'],['claude_boundary','claude','timezone','Codex'],['github_unit','github','metric','tokens'],['codex_unit','codex','metric','contributions'],['claude_unit','claude','metric','contributions'],['missing_boundary','codex','timezone',undefined],['missing_unit','github','metric',undefined],['private_boundary','claude','timezone','private-synthetic-path'],['private_unit','github','metric','private-synthetic-path']];
  for(const[name,source,field,value]of cases){const preview=structuredClone(base);preview.data.sources[source].days=entries;if(value===undefined)delete preview.data.sources[source][field];else preview.data.sources[source][field]=value;writePreview(preview);const result=await call(request(source));check(`DM.${name}_refuses_conflicting_metadata`,result.kind==='activity_error'&&result.error?.code==='contract_invalid'&&result.error.retryable===false,JSON.stringify(result));check(`DM.${name}_refusal_keeps_paths_private`,!JSON.stringify(result).includes('private-synthetic-path')&&!JSON.stringify(result).includes(pkg));}
  for(const source of ['github','codex','claude']){const preview=structuredClone(base);preview.data.sources[source].days=entries;writePreview(preview);const result=await call(request(source));check(`DM.${source}_correct_metadata_preserves_days`,result.source===source&&isDeepStrictEqual(result.days,entries));preview.data.sources[source]=null;writePreview(preview);const empty=await call(request(source));check(`DM.${source}_explicit_null_remains_empty`,empty.source===source&&isDeepStrictEqual(empty.days,[]));}
  const failure={schemaVersion:1,kind:'activity_error',error:{code:'storage_failed',component:'activity_archive',retryable:false}};writePreview(failure);check('DM.runner_error_passes_through',isDeepStrictEqual(await call(request('codex')),failure));check('DM.controlled_reads_preserve_store',fixtureTree(manifest.dataRoot)===store);
  await restore();check('DM.original_runner_and_manifest_restored',readFileSync(binary).equals(originalBinary)&&readFileSync(manifestPath).equals(originalManifest));const recovered=await select();check('DM.actual_picker_recovers_original_runner',recovered.configured===true&&recovered.saved===true);await navigate('Activity');await waitFor(s,"document.querySelectorAll('.act-source').length===3",'metadata healthy recovery');check('DM.recovery_retains_exact_history',isDeepStrictEqual((await overview(s)).sources,healthy.sources));check('DM.choice_remains_exact',readFileSync(settings).equals(saved));check('DM.complete_store_remains_exact',fixtureTree(manifest.dataRoot)===store);
 } finally {try{if(s)s.close();if(app){app.kill();await app.exited;}}finally{await restore();}}
}
