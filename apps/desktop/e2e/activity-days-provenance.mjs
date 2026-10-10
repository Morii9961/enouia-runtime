import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync,realpathSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';

export async function daysProvenanceMain(ctx) {
 const {settings,out,pkg,manifest,fixtureTree,launch,connect,check,press,fillDialog,waitFor,has,overview,shot,sleep}=ctx;
 if(existsSync(settings))throw Error('Days provenance requires fresh owned settings');
 const binary=join(pkg,'enouia-activity.exe'),manifestPath=join(pkg,'install.json');
 if(realpathSync(binary)!==join(realpathSync(pkg),'enouia-activity.exe'))throw Error('Runner escaped owned package');
 const originalBinary=readFileSync(binary),originalManifest=readFileSync(manifestPath),store=fixtureTree(manifest.dataRoot),helper=join(out,'reply-runner.exe');
 execFileSync('rustc',['--edition=2024',fileURLToPath(new URL('../src-tauri/tests/fixtures/reply-runner.rs',import.meta.url)),'-o',helper],{windowsHide:true,timeout:30000});
 const restore=async()=>{const deadline=Date.now()+10000;while(true){try{writeFileSync(binary,originalBinary);writeFileSync(manifestPath,originalManifest);return;}catch(error){if(!['EBUSY','EPERM','EACCES'].includes(error.code)||Date.now()>=deadline)throw error;await sleep(100);}}};
 let app,s;
 const navigate=label=>s.evaluate(`document.querySelector('nav button[aria-label=${JSON.stringify(label)}]').click()`);
 const call=request=>s.evaluate(`window.__TAURI_INTERNALS__.invoke('activity_call',{request:${JSON.stringify(request)}}).catch(error=>({transportError:String(error)}))`);
 const select=async()=>{await s.evaluate("window.__daysSelection=null;window.__TAURI_INTERNALS__.invoke('activity_setup',{action:'select'}).then(reply=>window.__daysSelection=reply,error=>window.__daysSelection={error:String(error)});true");fillDialog(app.pid,pkg);await waitFor(s,'window.__daysSelection!==null','actual days picker');return s.evaluate('window.__daysSelection');};
 const writePreview=reply=>writeFileSync(join(pkg,'native-preview-reply.json'),JSON.stringify(reply)+'\n');
 const request={operation:'activity_get_days',source:'codex',from:'2026-10-01',to:'2026-10-31'};
 try {
  app=launch();s=await connect();await navigate('Activity');await waitFor(s,has('Connect the installed Activity producer'),'days gate');await press(s,'Choose installed package…');fillDialog(app.pid,pkg);await waitFor(s,"document.querySelectorAll('.act-source').length===3",'healthy days setup');
  const healthy=await overview(s),base=await call({operation:'activity_preview_public_payload'}),saved=readFileSync(settings);
  check('DP.actual_producer_starts_healthy',healthy.kind==='activity_overview'&&base.kind==='activity_public_preview');
  await navigate('Home');await waitFor(s,"!document.querySelector('.act-surface')",'leave actual days producer');
  writeFileSync(join(pkg,'native-overview-reply.json'),JSON.stringify(healthy)+'\n');writePreview(base);writeFileSync(binary,readFileSync(helper));const helperHash=createHash('sha256').update(readFileSync(helper)).digest('hex');writeFileSync(manifestPath,JSON.stringify({...manifest,binaryHash:helperHash})+'\n');
  check('DP.owned_reply_runner_matches_manifest',createHash('sha256').update(readFileSync(binary)).digest('hex')===helperHash);const selected=await select();check('DP.actual_picker_selects_sandbox_helper',selected.configured===true&&selected.saved===true&&selected.mode==='sandbox');
  const cases=[
   ['wrong_preview_version',p=>p.schemaVersion=2],['wrong_data_version',p=>p.data.version=2],['missing_sources',p=>delete p.data.sources],['missing_source',p=>delete p.data.sources.codex],
   ['primitive_source',p=>p.data.sources.codex=false],['missing_days',p=>p.data.sources.codex={}],['null_days',p=>p.data.sources.codex={days:null}],['primitive_days',p=>p.data.sources.codex={days:'private-synthetic-path'}],
   ['invalid_date_type',p=>p.data.sources.codex.days=[{date:null,value:1}]],['impossible_date',p=>p.data.sources.codex.days=[{date:'2026-02-30',value:1}]],['negative_value',p=>p.data.sources.codex.days=[{date:'2026-01-01',value:-1}]],['fractional_value',p=>p.data.sources.codex.days=[{date:'2026-01-01',value:1.5}]],['unsafe_value',p=>p.data.sources.codex.days=[{date:'2026-01-01',value:9007199254740992}]],['private_day_field',p=>p.data.sources.codex.days=[{date:'2026-01-01',value:1,privatePath:'private-synthetic-path'}]],['duplicate_dates',p=>p.data.sources.codex.days=[{date:'2026-01-01',value:1},{date:'2026-01-01',value:2}]],['descending_dates',p=>p.data.sources.codex.days=[{date:'2026-01-02',value:1},{date:'2026-01-01',value:2}]],['unsafe_sum',p=>p.data.sources.codex.days=[{date:'2026-01-01',value:9007199254740991},{date:'2026-01-02',value:1}]],
  ];
  for(const [name,mutate] of cases){const reply=structuredClone(base);mutate(reply);writePreview(reply);const result=await call(request);check(`DP.${name}_refuses_before_filtering`,result.kind==='activity_error'&&result.error?.code==='contract_invalid'&&result.error.retryable===false,JSON.stringify(result));check(`DP.${name}_refusal_keeps_paths_private`,!JSON.stringify(result).includes('private-synthetic-path')&&!JSON.stringify(result).includes(pkg));}
  let valid=structuredClone(base);valid.data.sources.codex=null;writePreview(valid);check('DP.explicit_null_source_is_empty',isDeepStrictEqual((await call(request)).days,[]));
  valid=structuredClone(base);valid.data.sources.codex.days=[];writePreview(valid);check('DP.explicit_empty_array_is_empty',isDeepStrictEqual((await call(request)).days,[]));
  const entries=[{date:'2026-09-30',value:4},{date:'2026-10-01',value:0},{date:'2026-10-31',value:2},{date:'2026-11-01',value:8}];valid.data.sources.codex.days=entries;writePreview(valid);check('DP.inclusive_range_keeps_zero_and_exact_values',isDeepStrictEqual((await call(request)).days,entries.slice(1,3)));
  const maximum=[{date:'2026-10-01',value:9007199254740991}];valid.data.sources.codex.days=maximum;writePreview(valid);check('DP.maximum_safe_value_remains_exact',isDeepStrictEqual((await call(request)).days,maximum));
  const whole=[{date:'2026-10-01',value:2}];valid.data.sources.codex.days=whole;writeFileSync(join(pkg,'native-preview-reply.json'),JSON.stringify(valid).replace('"schemaVersion":1','"schemaVersion":1.0').replace('"version":1','"version":1.0').replace('"value":2','"value":2.0')+'\n');check('DP.integral_numeric_representations_remain_valid',isDeepStrictEqual((await call(request)).days,whole));
  const failure={schemaVersion:1,kind:'activity_error',error:{code:'storage_failed',component:'activity_archive',retryable:false}};writePreview(failure);check('DP.runner_error_passes_through',isDeepStrictEqual(await call(request),failure));check('DP.controlled_reads_preserve_store',fixtureTree(manifest.dataRoot)===store);
  await restore();check('DP.original_runner_and_manifest_restored',readFileSync(binary).equals(originalBinary)&&readFileSync(manifestPath).equals(originalManifest));const recovered=await select();check('DP.actual_picker_recovers_original_runner',recovered.configured===true&&recovered.saved===true);await navigate('Activity');await waitFor(s,"document.querySelectorAll('.act-source').length===3",'healthy days recovery');check('DP.recovery_retains_exact_history',isDeepStrictEqual((await overview(s)).sources,healthy.sources));check('DP.choice_remains_exact',readFileSync(settings).equals(saved));check('DP.complete_store_remains_exact',fixtureTree(manifest.dataRoot)===store);await shot(s,'01-days-provenance-recovered');
 } finally {try{if(s)s.close();if(app){app.kill();await app.exited;}}finally{await restore();}}
}
