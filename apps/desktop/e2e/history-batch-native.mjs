// Real Core + owned WebView2 preparation only. Never confirms a model send.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

export function assertBatchFixture(exe, fixture, vault) {
  const manifest = JSON.parse(readFileSync(join(fixture, 'isolated-build.json'), 'utf8'));
  const root = join(fixture, 'config');
  if (manifest.purpose !== 'synthetic-history-batch-preparation' || manifest.appDirectoriesOverride !== root
    || manifest.exeSha256 !== createHash('sha256').update(readFileSync(exe)).digest('hex') || readdirSync(vault).length) {
    throw new Error('history batch mode requires its hash-bound isolated build and fresh empty synthetic Vault');
  }
  if (manifest.loaderSha256 !== createHash('sha256').update(readFileSync(join(dirname(exe), 'WebView2Loader.dll'))).digest('hex')) {
    throw new Error('history batch mode requires the same-build WebView2 loader beside the executable');
  }
  const config = JSON.parse(readFileSync(join(root, 'memory-providers.json'), 'utf8'));
  if (config.schemaVersion !== 1 || config.destinations.length !== 1 || config.destinations[0].model !== 'synthetic-history-model'
    || config.destinations[0].api !== 'openai' || config.destinations[0].streaming !== false) {
    throw new Error('history batch fixture must contain only synthetic non-streaming model metadata');
  }
}

export async function createBatchVault(s, app, { waitFor, fillOpenDialog }) {
  await waitFor(s, "document.body.innerText.includes('Memory · No Vault open')", 'fresh batch fixture starts closed');
  await s.evaluate("window.__batchRootPick=window.__TAURI_INTERNALS__.invoke('memory_pick',{kind:'vault_root'});true");
  fillOpenDialog(app.pid, app.batchVault, true);
  const picked = await s.evaluate('window.__batchRootPick');
  if (!picked?.token) throw new Error('synthetic batch root picker did not return a token');
  const created = await s.evaluate(`__t.memory('vault_create',{rootToken:${JSON.stringify(picked.token)},confirmPhrase:'create new vault'})`);
  if (created.error || created.result?.vault?.state !== 'open') throw new Error('synthetic batch Vault creation failed');
}

export async function historyBatchPreparation(s, detail, { waitFor, check, nav, rail, click, set, shot, statusOf }) {
  await nav(s, 'Memory'); await rail(s, 'Import');
  await waitFor(s, "!!__t.byText('button','Read task ')", 'batch task discovery');
  await click(s, 'button', 'Read task ');
  await waitFor(s, "!!__t.byText('button','Inspect batch 1 request')", 'batch task observation');
  const grant = await s.evaluate("__t.memory('egress_grant_plan',{apis:['openai'],maxSensitivity:'private',extraction:true})");
  if (grant.error) throw new Error('synthetic extraction grant plan failed');
  const policy = await s.evaluate(`__t.memory('provider_confirm',{planId:${JSON.stringify(grant.result.planId)},diffHash:${JSON.stringify(grant.result.diffHash)}},'ui-'+crypto.randomUUID())`);
  if (policy.error) throw new Error('synthetic extraction grant confirmation failed');
  const before = await statusOf(s);
  const sessionsBefore = await s.evaluate("__t.memory('session_list',{}).then(r=>r.result.items.map(s=>s.sessionId).sort())");
  await s.evaluate(`(()=>{
    window.__batchReplies=[];window.__batchRelease=null;window.__batchHold=true;window.__batchObservedHead=null;
    // Belt-and-suspenders test guard: this mode never activates Send.
    document.addEventListener('click',event=>{if(event.target.closest?.('button')?.textContent==='Send this batch once'){event.preventDefault();event.stopImmediatePropagation();throw Error('native preparation mode must not send');}},true);
    const callbacks=window.__TAURI_INTERNALS__.callbacks, previous=callbacks.set;
    callbacks.set=function(id,callback){return previous.call(this,id,value=>{
      if(value?.result?.vault?.headCommitId)window.__batchObservedHead=value.result.vault.headCommitId;
      if(value?.kind==='external_prepared' && value.result?.taskId===${JSON.stringify(detail.taskId)}){
        window.__batchReplies.push(value);
        if(window.__batchHold){window.__batchHold=false;window.__batchRelease=()=>callback(value);return;}
      }
      callback(value);
    });};
  })()`);
  await click(s, 'button', 'Inspect batch 1 request');
  await waitFor(s, `!!document.querySelector('[aria-label="Saved batch request"] option[value=${JSON.stringify(policy.result.policyId)}]')`, 'current synthetic extraction grant');
  await s.evaluate(`(()=>{const el=document.querySelector('[aria-label="Saved batch request"] select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(el,${JSON.stringify(policy.result.policyId)});el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  const outputId = await s.evaluate("[...document.querySelectorAll('label')].find(el=>el.textContent.startsWith('Output token ceiling')).htmlFor");
  await set(s, `[id=${JSON.stringify(outputId)}]`, '4097');
  await waitFor(s, `document.getElementById(${JSON.stringify(outputId)}).getAttribute('aria-invalid')==='true'`, 'configured output cap is explained');
  check('HB.invalid_output_cap_is_accessible_and_does_not_prepare', await s.evaluate(`(()=>{const el=document.getElementById(${JSON.stringify(outputId)});return document.getElementById(el.getAttribute('aria-describedby')).textContent.includes('4096') && __t.byText('button','Prepare or recover this batch request').disabled && window.__batchReplies.length===0;})()`));
  await set(s, `[id=${JSON.stringify(outputId)}]`, '256');
  await waitFor(s, "!__t.byText('button','Prepare or recover this batch request').disabled", 'batch preparation enabled');
  check('HB.selection_does_not_prepare', await s.evaluate('window.__batchReplies.length===0'));
  await s.evaluate("__t.byText('button','Prepare or recover this batch request').focus()");
  await click(s, 'button', 'Prepare or recover this batch request');
  await waitFor(s, '!!window.__batchRelease', 'actual batch preparation receipt held');
  const first = await s.evaluate('window.__batchReplies[0].result');
  const child = detail.batches.find(b => b.batchIndex === 0);
  check('HB.prepared_identity_uses_original_child', first.taskId===detail.taskId && first.batchIndex===0 && first.sessionId===child.sessionId && first.runId===child.runId && first.inputEventId===child.inputEventId);
  const after = await statusOf(s);
  check('HB.preparation_commits_local_context', after.vault.headCommitId!==before.vault.headCommitId);
  await waitFor(s, `window.__batchObservedHead===${JSON.stringify(after.vault.headCommitId)}`, 'shared status observes preparation head');
  check('HB.head_update_keeps_pending_owner', await s.evaluate("document.body.innerText.includes('Waiting for the batch request receipt') && !document.querySelector('[aria-label=\"Exact history request\"]')"));
  await s.evaluate('window.__batchRelease();window.__batchRelease=null');
  await waitFor(s, "!!document.querySelector('[aria-label=\"Exact history request\"]')", 'actual exact request rendered');
  await waitFor(s, "document.activeElement===document.querySelector('[aria-label=\"Exact history request body\"]')", 'preparation moves owned focus to exact readable body');
  check('HB.preparation_focuses_named_request_body', true);
  check('HB.exact_body_endpoint_model_hash_and_handle_rendered', await s.evaluate(`(()=>{const el=document.querySelector('[aria-label="Exact history request"]');return el.querySelector('pre').textContent===${JSON.stringify(first.body)} && ${JSON.stringify([first.endpoint,first.model,first.wireHash,first.callId])}.every(value=>el.textContent.includes(value));})()`));
  check('HB.output_ceiling_and_fresh_inspection', first.outputTokens===256 && await s.evaluate("__t.byText('button','Send this batch once').disabled && !document.querySelector('[aria-label=\"Exact history request\"] input').checked"));
  check('HB.request_fits_minimum_window', await s.evaluate("document.documentElement.scrollWidth<=innerWidth && document.querySelector('.mem-history-request').scrollWidth<=document.querySelector('.mem-history-request').clientWidth+1"));
  const overflow = await s.evaluate(`(()=>{const root=document.querySelector('[aria-label="Saved history tasks"]');return [...new Set([...document.querySelectorAll('.qr44,.qr44 *,.qr45,.qr79,.qr88'),root,...root.querySelectorAll('*')])].filter(el=>!el.closest('.mem-table-scroll') && el.clientWidth>0 && el.scrollWidth>el.clientWidth+1).map(el=>({name:el.getAttribute('aria-label')||el.className||el.tagName,width:el.clientWidth,content:el.scrollWidth,text:el.textContent.slice(0,140)}));})()`);
  check('HB.saved_task_and_request_panes_fit_minimum_window', overflow.length===0, JSON.stringify(overflow));
  check('HB.import_table_has_named_bounded_scroll_region', await s.evaluate("(()=>{const region=document.querySelector('.mem-table-scroll');return !!region && region.getAttribute('role')==='region' && region.getAttribute('aria-label')==='Recorded imports' && region.tabIndex===0 && region.scrollWidth>region.clientWidth && region.getBoundingClientRect().right<=region.parentElement.getBoundingClientRect().right;})()"));
  await s.evaluate("document.querySelector('.mem-table-scroll').focus()");
  for (const type of ['keyDown', 'keyUp']) await s.send('Input.dispatchKeyEvent', { type, key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39 });
  await waitFor(s, "document.querySelector('.mem-table-scroll').scrollLeft>0", 'owned-page arrow scrolls the import table');
  check('HB.import_table_scrolls_with_owned_page_keyboard', await s.evaluate("document.activeElement===document.querySelector('.mem-table-scroll') && document.querySelector('.qr44').scrollLeft===0"));
  await s.evaluate("document.querySelector('.mem-table-scroll').scrollLeft=0;document.querySelector('[aria-label=\"Exact history request body\"]').focus()");
  await s.evaluate("document.querySelector('[aria-label=\"Exact history request\"]').scrollIntoView({block:'center'})");
  await shot(s, 'history-batch-exact-request');
  await s.evaluate("document.querySelector('[aria-label=\"Exact history request\"] input').click()");
  await waitFor(s, "!__t.byText('button','Send this batch once').disabled", 'inspection enables only separate send control');
  const lock = await s.evaluate("__t.memory('vault_lock',{})");
  if (lock.error) throw new Error('synthetic batch Vault lock failed');
  await waitFor(s, "document.body.innerText.includes('Memory · Vault locked') && !document.querySelector('[aria-label=\"Exact history request\"]')", 'locked Vault withdraws request');
  check('HB.lock_withdraws_request_and_confirmation', true);
  const unlock = await s.evaluate("__t.memory('vault_unlock',{})");
  if (unlock.error) throw new Error('synthetic batch Vault unlock failed');
  await waitFor(s, "document.body.innerText.includes('Memory · Vault open') && !!__t.byText('button','Read task ')", 'synthetic batch Vault unlock');
  await click(s, 'button', 'Read task ');
  await waitFor(s, "!!__t.byText('button','Inspect batch 1 request')", 'saved task reread after unlock');
  await click(s, 'button', 'Inspect batch 1 request');
  await waitFor(s, "!!__t.byText('button','Prepare or recover this batch request') && !__t.byText('button','Prepare or recover this batch request').disabled", 'original preparation parameters restored');
  check('HB.unlock_does_not_reuse_old_handle_or_approval', await s.evaluate("!document.querySelector('[aria-label=\"Exact history request\"]') && window.__batchReplies.length===1"));
  await click(s, 'button', 'Prepare or recover this batch request');
  await waitFor(s, 'window.__batchReplies.length===2 && !!document.querySelector(\'[aria-label="Exact history request"]\')', 'fresh handle after lock/reopen');
  const second = await s.evaluate('window.__batchReplies[1].result');
  check('HB.reopen_reprepares_same_child_with_new_handle', second.callId!==first.callId && ['taskId','batchIndex','sessionId','runId','inputEventId','wireHash','body'].every(field=>second[field]===first[field]));
  check('HB.reprepared_handle_needs_new_inspection', await s.evaluate("__t.byText('button','Send this batch once').disabled && !document.querySelector('[aria-label=\"Exact history request\"] input').checked"));
  check('HB.preparation_does_not_create_another_session', JSON.stringify(await s.evaluate("__t.memory('session_list',{}).then(r=>r.result.items.map(s=>s.sessionId).sort())"))===JSON.stringify(sessionsBefore));
  check('HB.no_external_send_operation', await s.evaluate("__t.memory('operation_list',{}).then(r=>r.result.items.every(op=>op.kind!=='external_send'))"));
  check('HB.no_new_candidate_or_approved_memory', await s.evaluate("Promise.all([__t.memory('candidate_list',{cursor:null,limit:25}),__t.memory('memory_list',{cursor:null,limit:25,includeInactive:false})]).then(([c,m])=>c.result.total===1 && m.result.total===0)"));
  await s.evaluate("document.querySelector('[aria-label=\"Exact history request\"]').scrollIntoView({block:'center'})");
  await shot(s, 'history-batch-reopened-request');
}
