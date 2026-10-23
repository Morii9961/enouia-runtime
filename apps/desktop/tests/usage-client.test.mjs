import assert from 'node:assert/strict';
import test from 'node:test';
import {usage,setUsageTransport,UsageFailure,describeUsage,exactToken} from '../src/usage/client.ts';
import {overview,candidate,sealed,review} from './usage-fixtures.mjs';
const scope={package:'usage-choice-0',ledger:'usage-choice-1',source:'codex_local'};
test('manual usage uses its own native namespace and opaque choices',async()=>{
  const calls=[];setUsageTransport(async(command,args)=>{calls.push({command,args});if(command==='usage_pick')return{token:'usage-choice-2'};if(command==='usage_cancel')return{stopped:true};return{version:1,result:overview(scope.source)};});
  assert.equal(await usage.pick('codex_root'),'usage-choice-2');await usage.call(scope,{operation:'scan',roots:['usage-choice-2'],models:['fictional-model']});assert.equal(await usage.cancel(),true);
  assert.deepEqual(calls.map(c=>c.command),['usage_pick','usage_call','usage_cancel']);assert.deepEqual(calls[1].args,{request:{...scope,action:{operation:'scan',roots:['usage-choice-2'],models:['fictional-model']}}});
});
test('unknown fields, private paths, unsafe counts and source mismatches are refused',async()=>{
  for(const change of [v=>v.private_path='C:\\PRIVATE_PATH',v=>v.counts.input_total=9007199254740992,v=>v.source='claude_local',v=>v.health.last_attempt='PRIVATE_PATH',v=>v.health.coverage.files=-1,v=>v.notice='PRIVATE_PATH']){
    const v=overview(scope.source);change(v);setUsageTransport(async()=>({version:1,result:v}));await assert.rejects(()=>usage.call(scope,{operation:'overview'}),e=>e instanceof UsageFailure&&e.code==='usage_contract_invalid');
  }
  assert.equal(exactToken('9007199254740993'),'9,007,199,254,740,993');assert.equal(exactToken(null),'未报告');
});
test('review and page receipts belong to their exact requested identity and source',async()=>{
  const c=candidate();setUsageTransport(async()=>({version:1,result:review(c)}));assert.ok('review_token'in await usage.call(scope,{operation:'inspect',candidate:c}));
  setUsageTransport(async()=>({version:1,result:review(candidate('e'))}));await assert.rejects(()=>usage.call(scope,{operation:'inspect',candidate:c}));
  setUsageTransport(async()=>({version:1,result:{page:{items:[c],next_cursor:sealed('page',c,'claude_local')}}}));await assert.rejects(()=>usage.call(scope,{operation:'candidates',cursor:null}));
});
test('cancellation, stale review and unknown native errors have fixed recovery text',async()=>{
  setUsageTransport(async()=>{throw'usage_stale_read';});const e=await usage.call(scope,{operation:'overview'}).catch(e=>e);assert.match(describeUsage(e),/重新审阅/);
  setUsageTransport(async()=>{throw'usage_private_user_name';});const unknown=await usage.cancel().catch(e=>e);assert.equal(unknown.code,'usage_call_failed');assert(!describeUsage(unknown).includes('private_user'));
  setUsageTransport(async()=>({cancelled:true}));assert.equal(await usage.pick('ledger'),null);
});
