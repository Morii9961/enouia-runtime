import test from 'node:test';
import assert from 'node:assert/strict';
import { HistoryResultOwner, historyResultOwner, historyApplicationKey, historyPreviewObservation } from '../src/memory/historyResults.ts';
import { setTransport, CallError } from '../src/memory/client.ts';
import { historyTask } from './history-task-fixture.ts';
import { historyResult, historyApplication } from './history-results-fixture.ts';

const vault = 'synthetic-vault', task = () => historyTask();
const args = { taskId: task().taskId, batchIndex: 1, responseHash: 'd'.repeat(64), cursor: 0 };
function owner() { const o = new HistoryResultOwner(vault); o.select(task(), 1); return o; }
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }

test('application keys are reproducible and separate exact Vault/task/batch/hash/cursor identities', async () => {
  const key = await historyApplicationKey(vault, args);
  assert.match(key, /^[A-Za-z0-9_-]{16,128}$/);
  assert.equal(await historyApplicationKey(vault, {...args}), key);
  for (const [field,value] of Object.entries({taskId:'another',batchIndex:0,responseHash:'e'.repeat(64),cursor:1}))
    assert.notEqual(await historyApplicationKey(vault,{...args,[field]:value}),key);
  assert.notEqual(await historyApplicationKey('another-vault',args),key);
  assert.equal(historyResultOwner(vault),historyResultOwner(vault));
  assert.notEqual(historyResultOwner(vault),historyResultOwner('another-vault'));
});

test('saved response observations bind child/input/model/source and candidate cursor prefixes; snapshots are immutable', () => {
  const raw = historyResult(1), shown = historyPreviewObservation(raw,vault,task(),1);
  assert.notEqual(shown,raw);
  assert.equal(shown.items[0].content,'Synthetic original proposal 0');
  assert.equal(shown.items[0].candidate.content,'Current candidate 0');
  assert.throws(()=>{shown.items[0].selectedText='changed';},TypeError);
  raw.items[0].quote='changed';
  assert.equal(shown.items[0].quote,'synthetic quote');
  const corruptions = [
    r=>r.taskId='another',r=>r.batchIndex=0,r=>r.sessionId='another',r=>r.runId='another',
    r=>r.responseHash='invalid',r=>r.job.input_event_id='another',r=>r.job.binding.model='another',
    r=>r.job.cursor=0,r=>r.job.sources[0].end=32769,r=>r.job.max_pending=500,
    r=>r.items[0].sourceId='another',r=>r.items[0].sourceRevision=2,
    r=>r.items[0].selectedText='unrelated context',r=>r.items[0].candidate.candidateId='another',
    r=>r.items[1].application='candidate_recorded',r=>r.items.reverse(),
    r=>r.items[0].candidate.status='canonical',r=>r.items[0].proposedType='invented',
    r=>r.items[0].speakerRole='owner',r=>r.items[0].evidenceClass='confirmed_fact',r=>r.items[0].capturedAt='2026',
  ];
  for (const corrupt of corruptions) {
    const r=historyResult(1);corrupt(r);
    assert.throws(()=>historyPreviewObservation(r,vault,task(),1),/mismatch/);
  }
});

test('the real client envelope keys apply only, requires fresh inspection/confirmation and never automatically advances', async () => {
  const o=owner(), calls=[];
  let cursor=0;
  setTransport(async (command,{request})=>{
    assert.equal(command,'memory_call');calls.push(request);
    if(request.command==='history_batch_preview')return{kind:'extraction_preview',result:historyResult(cursor)};
    assert.equal(request.command,'history_batch_apply');cursor++;
    return{kind:'extraction_job',result:historyApplication(cursor)};
  });
  assert.equal(calls.length,0);
  await assert.rejects(o.apply(o.snapshot.preview,true),/inspect/);
  await o.preview();
  await assert.rejects(o.apply(o.snapshot.preview,false),/inspect/);
  const first=await o.apply(o.snapshot.preview,true);
  assert.equal(first.job.cursor,1);
  assert.deepEqual(calls.map(r=>r.command),['history_batch_preview','history_batch_apply']);
  assert.equal(calls[0].idempotencyKey,null);
  assert.deepEqual(calls[1].arguments,args);
  assert.equal(calls[1].idempotencyKey,await historyApplicationKey(vault,args));
  assert.equal(o.snapshot.phase,'recovery_required');
  assert.equal(o.snapshot.preview,null);
  await assert.rejects(o.apply(o.snapshot.preview,true),/inspect/);
  await o.preview();
  assert.equal(o.snapshot.phase,'inspected');
  await o.apply(o.snapshot.preview,true);
  assert.deepEqual(calls[3].arguments,{...args,cursor:1});
  assert.notEqual(calls[3].idempotencyKey,calls[1].idempotencyKey);
  assert.equal(calls.length,4);
  await o.preview();
  await assert.rejects(o.apply(o.snapshot.preview,true),/inspect/);
});

test('lost or invalid receipts retain the original request through navigation and explicit same-key recovery', async () => {
  const o=owner(), calls=[];
  const request=async(command,a,key)=>{
    calls.push([command,a,key]);
    if(command==='history_batch_preview')return historyResult();
    throw 'worker_failed';
  };
  await o.preview(request);
  await assert.rejects(o.apply(o.snapshot.preview,true,request),e=>e==='worker_failed');
  const pending=o.snapshot.pending;
  assert.deepEqual(pending.args,args);assert.equal(pending.acknowledged,false);
  assert.throws(()=>{pending.args.cursor=1;},TypeError);
  await assert.rejects(o.recover(o.snapshot.preview,true,undefined,request),/inspect/);
  o.invalidate();o.select(task(),1);
  assert.deepEqual(o.snapshot.pending.args,args);
  await o.preview(request);
  await assert.rejects(o.apply(o.snapshot.preview,true,request),/inspect/);
  await assert.rejects(o.recover(o.snapshot.preview,false,undefined,request),/inspect/);
  await assert.rejects(o.recover(o.snapshot.preview,true,{...args,cursor:1},request),/inspect/);
  const recovered=await o.recover(o.snapshot.preview,true,undefined,async(command,a,key)=>{
    calls.push([command,a,key]);return historyApplication();
  });
  assert.equal(recovered.job.cursor,1);
  assert.deepEqual(calls[1],calls.at(-1));
  assert.equal(o.snapshot.pending.acknowledged,true);
  await o.preview(async()=>historyResult(1));
  assert.equal(o.snapshot.pending,null);
});

test('a fresh owner recovers supplied original metadata with the original key; old cursors never select the next item', async () => {
  const reopened=owner(),calls=[];
  await reopened.preview(async()=>historyResult(1));
  await reopened.recover(reopened.snapshot.preview,true,{...args},async(...call)=>{calls.push(call);return historyApplication(1);});
  assert.deepEqual(calls,[['history_batch_apply',args,await historyApplicationKey(vault,args)]]);
  assert.equal(reopened.snapshot.preview,null);
  assert.equal(reopened.snapshot.pending.args.cursor,0);
});

test('refresh can observe an uncertain step already advanced, without replaying a write or asserting candidate publication', async () => {
  const o=owner();
  await o.preview(async()=>historyResult());
  await assert.rejects(o.apply(o.snapshot.preview,true,async()=>{throw new Error('reply lost after commit');}));
  let reads=0;
  await o.preview(async command=>{assert.equal(command,'history_batch_preview');reads++;return historyResult(1);});
  assert.equal(reads,1);assert.equal(o.snapshot.pending,null);
  assert.equal(o.snapshot.preview.job.cursor,1);
  // Empty saved responses may complete at cursor zero without a candidate.
  const empty=owner(),r=historyResult();r.items=[];
  await empty.preview(async()=>r);
  const done=historyApplication(0);done.job.state='completed';
  await empty.apply(empty.snapshot.preview,true,async()=>done);
  const complete={...r,job:done.job};
  await empty.preview(async()=>complete);
  assert.equal(empty.snapshot.pending,null);
  await assert.rejects(empty.apply(empty.snapshot.preview,true),/inspect/);
});

test('A -> B -> A and invalidation during Web Crypto suppress writes, and delayed previews cannot restore authority', async () => {
  const o=owner();
  await o.preview(async()=>historyResult());
  let writes=0;
  const applying=o.apply(o.snapshot.preview,true,async()=>{writes++;return historyApplication();});
  o.select(task(),0);o.select(task(),1);
  assert.equal(await applying,null);assert.equal(writes,0);assert.equal(o.snapshot.pending,null);
  const gate=deferred(),reading=o.preview(async()=>gate.promise);
  o.invalidate();o.select(task(),1);
  gate.resolve(historyResult());
  assert.equal(await reading,null);assert.equal(o.snapshot.preview,null);
  await assert.rejects(o.apply(o.snapshot.preview,true),/inspect/);
});

test('late write receipts update only retained request metadata and cannot enable another cursor after navigation', async () => {
  const o=owner(),gate=deferred(),started=deferred();
  await o.preview(async()=>historyResult());
  const applying=o.apply(o.snapshot.preview,true,async()=>{started.resolve();return gate.promise;});
  await started.promise;
  await assert.rejects(o.preview(async()=>historyResult()),/unavailable/);
  o.invalidate();o.select(task(),1);
  gate.resolve(historyApplication());
  assert.equal(await applying,null);
  assert.equal(o.snapshot.preview,null);assert.equal(o.snapshot.pending.acknowledged,true);
  await assert.rejects(o.apply(o.snapshot.preview,true),/inspect/);
  await o.preview(async()=>historyResult(1));
  assert.equal(o.snapshot.pending,null);
});

test('read errors, paused state, changed response and malformed application replies withhold write authority', async () => {
  const o=owner();
  await o.preview(async()=>historyResult(0,'paused'));
  await assert.rejects(o.apply(o.snapshot.preview,true),/inspect/);
  await o.preview(async()=>historyResult());
  await assert.rejects(o.apply(o.snapshot.preview,true,async()=>({...historyApplication(),responseHash:'e'.repeat(64)})),/mismatch/);
  const key=o.snapshot.pending.key;
  const changed=historyResult();changed.responseHash='e'.repeat(64);
  await o.preview(async()=>changed);
  await assert.rejects(o.recover(o.snapshot.preview,true),/inspect/);
  assert.equal(o.snapshot.pending.key,key);
  await assert.rejects(o.preview(async()=>{throw new CallError({code:'permission_denied',retryable:false,rules:['history.source_read']});}));
  assert.equal(o.snapshot.preview,null);assert.equal(o.snapshot.pending.key,key);
  await assert.rejects(o.recover(o.snapshot.preview,true),/inspect/);
  assert.throws(()=>o.select({...task(),identity:{...task().identity,vaultId:'wrong'}},1),/mismatch/);
  assert.equal(o.snapshot.scope,null);
});


test('explicit pinned-Core synthetic fixture passes the production inspector and both single-step receipts', {
  skip: !process.env.RUNTIME_HISTORY_RESULT_FIXTURE,
}, async () => {
  const {readFileSync}=await import('node:fs');
  const f=JSON.parse(readFileSync(process.env.RUNTIME_HISTORY_RESULT_FIXTURE,'utf8'));
  for(const name of ['preview','previewFirst','completed'])
    historyPreviewObservation(f[name],f.vaultId,f.task,1);
  const o=new HistoryResultOwner(f.vaultId);o.select(f.task,1);
  await o.preview(async()=>f.preview);
  await o.setPaused(o.snapshot.preview,true,true,async()=>f.pauseReceipt);
  await o.preview(async()=>f.pausedPreview);
  assert.equal(o.snapshot.preview.job.state,'paused');
  await o.setPaused(o.snapshot.preview,false,true,async()=>f.resumeReceipt);
  await o.preview(async()=>f.resumedPreview);
  assert.equal(o.snapshot.preview.job.cursor,0);
  await o.apply(o.snapshot.preview,true,async()=>f.first);
  assert.equal(o.snapshot.preview,null);
  await o.preview(async()=>f.previewFirst);
  assert.equal(o.snapshot.pending,null);
  await o.apply(o.snapshot.preview,true,async()=>f.second);
  await o.preview(async()=>f.completed);
  assert.equal(o.snapshot.preview.job.state,'completed');
  assert.equal(o.snapshot.pending,null);
  assert.ok(o.snapshot.preview.items.every(item=>item.candidate.status==='pending'));
});

test('refresh invalidates the confirmation captured for an older displayed preview', async () => {
  const o=owner();
  await o.preview(async()=>historyResult());
  const displayed=o.snapshot.preview;
  // A second client advances the saved job while this page refreshes.
  await o.preview(async()=>historyResult(1));
  assert.notEqual(o.snapshot.preview,displayed);
  let writes=0;
  await assert.rejects(o.apply(displayed,true,async()=>{writes++;return historyApplication(2);}),/inspect/);
  assert.equal(writes,0);
});

test('same-cursor refresh also invalidates old apply and recovery confirmations', async () => {
  const o=owner();
  await o.preview(async()=>historyResult());
  const first=o.snapshot.preview;
  await o.preview(async()=>historyResult());
  let writes=0;
  const request=async()=>{writes++;throw new Error('receipt unknown');};
  await assert.rejects(o.apply(first,true,request),/inspect/);
  assert.equal(writes,0);
  await assert.rejects(o.apply(o.snapshot.preview,true,request),/receipt unknown/);
  await o.preview(async()=>historyResult());
  const recovery=o.snapshot.preview;
  await o.preview(async()=>historyResult());
  await assert.rejects(o.recover(recovery,true,undefined,request),/inspect/);
  assert.equal(writes,1);
  await o.recover(o.snapshot.preview,true,undefined,async()=>{writes++;return historyApplication();});
  assert.equal(writes,2);
});

test('local pause and resume bind the displayed original job without advancing a cursor or reusing a later decision key', async () => {
  const o=owner(), controls=[];
  await assert.rejects(o.setPaused(null,true,true),/inspect/);
  const stale=await o.preview(async()=>historyResult());
  await o.preview(async()=>historyResult());
  await assert.rejects(o.setPaused(stale,true,true),/inspect/);
  const change=async(command,a,key)=>{controls.push([command,a,key]);return{job:historyResult(0,a.paused?'paused':'ready').job};};
  await assert.rejects(o.setPaused(o.snapshot.preview,true,false,change),/inspect/);
  await o.setPaused(o.snapshot.preview,true,true,change);
  assert.deepEqual(controls[0].slice(0,2),['extraction_pause',{sessionId:task().batches[0].sessionId,runId:task().batches[0].runId,paused:true}]);
  assert.equal(o.snapshot.preview,null);assert.equal(o.snapshot.pausePending.acknowledged,true);
  assert.throws(()=>{o.snapshot.pausePending.args.paused=false;},TypeError);
  await assert.rejects(o.setPaused(stale,false,true,change),/inspect/);
  await o.preview(async()=>historyResult(0,'paused'));
  assert.equal(o.snapshot.pausePending,null);
  await o.setPaused(o.snapshot.preview,false,true,change);
  await o.preview(async()=>historyResult());
  await o.setPaused(o.snapshot.preview,true,true,change);
  assert.equal(controls.length,3);assert.equal(new Set(controls.map(c=>c[2])).size,3);
  assert.ok(controls.every(c=>c[0]==='extraction_pause'));
});

test('an unknown local control requires fresh observation and a new explicit decision, with no automatic retry or send', async () => {
  const o=owner();await o.preview(async()=>historyResult());
  let calls=0;
  await assert.rejects(o.setPaused(o.snapshot.preview,true,true,async()=>{calls++;throw new Error('control receipt unknown');}));
  const old=o.snapshot.pausePending;
  o.invalidate();o.select(task(),1);
  assert.equal(o.snapshot.pausePending.key,old.key);
  assert.equal(o.snapshot.pausePending.acknowledged,false);
  await assert.rejects(o.setPaused(null,true,true),/inspect/);
  await o.preview(async()=>historyResult());
  assert.equal(o.snapshot.pausePending,null);assert.equal(calls,1);
  await o.setPaused(o.snapshot.preview,true,true,async(command,a,key)=>{
    assert.equal(command,'extraction_pause');assert.notEqual(key,old.key);calls++;return{job:historyResult(0,'paused').job};
  });
  assert.equal(calls,2);
});

test('resuming a separately paused job preserves an unknown original application identity', async () => {
  const o=owner();await o.preview(async()=>historyResult());
  await assert.rejects(o.apply(o.snapshot.preview,true,async()=>{throw new Error('application unknown');}));
  const original=o.snapshot.pending;
  await o.preview(async()=>historyResult(0,'paused'));
  await o.setPaused(o.snapshot.preview,false,true,async()=>({job:historyResult().job}));
  assert.equal(o.snapshot.pending.key,original.key);
  await assert.rejects(o.recover(o.snapshot.preview,true),/inspect/);
  await o.preview(async()=>historyResult());
  await o.recover(o.snapshot.preview,true,undefined,async(command,a,key)=>{
    assert.equal(command,'history_batch_apply');assert.equal(key,original.key);assert.deepEqual(a,original.args);return historyApplication();
  });
});

test('late or mismatched local control receipts do not restore authority; changed response and completion withhold controls', async () => {
  const o=owner(),gate=deferred();await o.preview(async()=>historyResult());
  const writing=o.setPaused(o.snapshot.preview,true,true,async()=>gate.promise);
  o.invalidate();o.select(task(),1);gate.resolve({job:historyResult(0,'paused').job});
  assert.equal(await writing,null);assert.equal(o.snapshot.preview,null);assert.equal(o.snapshot.pausePending.acknowledged,true);
  await o.preview(async()=>historyResult(0,'paused'));
  const bad=historyResult();bad.job.run_id='foreign';
  await assert.rejects(o.setPaused(o.snapshot.preview,false,true,async()=>({job:bad.job})),/mismatch/);
  assert.equal(o.snapshot.pausePending.acknowledged,false);
  const changed=historyResult();changed.responseHash='e'.repeat(64);
  await o.preview(async()=>changed);
  assert.notEqual(o.snapshot.pausePending,null);
  await assert.rejects(o.apply(o.snapshot.preview,true),/inspect/);
  await o.preview(async()=>historyResult(2));
  assert.equal(o.snapshot.pausePending,null);
  await assert.rejects(o.setPaused(o.snapshot.preview,false,true),/inspect/);
});
