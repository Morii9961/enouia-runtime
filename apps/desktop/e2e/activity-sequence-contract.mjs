import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export async function sequenceContractMain(ctx) {
  const { settings, out, pkg, manifest, fixtureTree, launch, connect, check,
    press, fillDialog, waitFor, has, overview, shot, sleep } = ctx;
  if(existsSync(settings))throw Error('Sequence drill requires fresh owned settings');
  const store=fixtureTree(manifest.dataRoot), manifestBytes=readFileSync(join(pkg,'install.json'));
  let app,s;
  const reset=async(field,value)=>{
    const before=await s.evaluate('window.__sequenceReads');
    await s.evaluate(`window.__sequenceField=${JSON.stringify(field)};window.__sequenceValue=${JSON.stringify(value)};true`);
    await press(s,'Refresh');await waitFor(s,`window.__sequenceReads>${before}`,'sequence overview reply');await sleep(150);
  };
  try {
    app=launch();s=await connect();
    await s.evaluate("document.querySelector('nav button[aria-label=\"Activity\"]').click()");
    await waitFor(s,has('Connect the installed Activity producer'),'sequence gate');
    await press(s,'Choose installed package…');fillDialog(app.pid,pkg);
    await waitFor(s,"document.querySelectorAll('.act-source').length===3",'sequence actual reads');
    const base=await overview(s),saved=readFileSync(settings);
    check('SQ.initial_real_reads_are_healthy',Object.keys(base.sources).sort().join(',')==='claude,codex,github');
    await s.evaluate(`(()=>{
      window.__sequenceBase=${JSON.stringify(base)};window.__sequenceField='delivery';window.__sequenceValue=0;
      window.__sequenceReads=0;window.__sequenceMutations=0;
      const real=window.fetch,url=window.__TAURI_INTERNALS__.convertFileSrc('activity_call','ipc');
      window.fetch=async(u,o)=>{
        if(u!==url)return real(u,o);
        const {request}=JSON.parse(o.body);
        if(['activity_run_now','activity_retry_pending','activity_set_paused'].includes(request.operation)){window.__sequenceMutations++;throw Error('Sequence drill never mutates a producer');}
        if(request.operation!=='activity_get_overview')return real(u,o);
        const reply=structuredClone(window.__sequenceBase),value=window.__sequenceValue;
        if(window.__sequenceField==='empty'){reply.delivery.pendingSequence=null;reply.pending=null;reply.producer.highestReserved=0;}
        else{
          reply.delivery.pendingSequence=window.__sequenceField==='delivery'?value:1;
          reply.pending={sequence:window.__sequenceField==='delivery'?1:value,createdAt:null,ageSeconds:0,exactSha256:'b'.repeat(64),failureCount:0,nextEligibleAt:null,lastErrorCode:null};
          if(window.__sequenceField==='positive'){reply.delivery.pendingSequence=value;reply.pending.sequence=value;reply.producer.highestReserved=value;}
        }
        window.__sequenceReads++;
        return new Response(JSON.stringify(reply),{headers:{'Content-Type':'application/json','Tauri-Response':'ok'}});
      };return true;
    })()`);
    const probe=await overview(s);
    check('SQ.modeled_overview_is_proved_before_cases',probe.delivery.pendingSequence===0&&await s.evaluate('window.__sequenceReads===1'));
    for(const field of ['delivery','pending'])for(const[id,value]of[['zero',0],['negative',-1],['fraction',1.5],['unsafe',Number.MAX_SAFE_INTEGER+1],['string','1']]){
      await reset(field,value);
      const refused=await s.evaluate(has('The response did not match Activity IPC v1'));
      const disabled=await s.evaluate("[...document.querySelectorAll('button')].filter(b=>['Run now','Retry pending','Pause activity sync'].includes(b.textContent.trim())).every(b=>b.disabled)");
      check(`SQ.${field}_${id}_refuses_before_display_and_mutation`,refused&&disabled&&await s.evaluate("document.querySelectorAll('.act-source').length===0"));
    }
    for(const[id,value]of[['minimum',1],['maximum',Number.MAX_SAFE_INTEGER]]){
      await reset('positive',value);
      check(`SQ.${id}_positive_sequence_is_preserved_exactly`,await s.evaluate("document.querySelectorAll('.act-source').length===3")&&await s.evaluate(has(`sequence ${value}`))&&await s.evaluate(has(`#${value}`)));
    }
    await reset('empty',null);
    check('SQ.null_pending_and_zero_reservation_remain_valid',await s.evaluate("document.querySelectorAll('.act-source').length===3")&&await s.evaluate(has('sequence 0'))&&!(await s.evaluate(has('The response did not match Activity IPC v1'))));
    check('SQ.no_producer_mutation_was_attempted',await s.evaluate('window.__sequenceMutations===0'));
    check('SQ.saved_choice_store_and_manifest_remain_exact',readFileSync(settings).equals(saved)&&fixtureTree(manifest.dataRoot)===store&&readFileSync(join(pkg,'install.json')).equals(manifestBytes));
    await shot(s,'01-sequence-contract-empty');
    await press(s,'Change package');await waitFor(s,has('Connect the installed Activity producer'),'sequence final clear');
    check('SQ.final_clear_removes_only_owned_choice',!existsSync(settings)&&fixtureTree(manifest.dataRoot)===store);
  } finally {if(s)s.close();if(app){app.kill();await app.exited;}}
}
