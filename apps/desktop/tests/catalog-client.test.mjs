import assert from 'node:assert/strict';
import test from 'node:test';
import { catalogRead, catalogSelectionKey, catalogScopeKey, CATALOG_FILTER, setCatalogTransport } from '../src/memory/catalog.ts';
import { status, page, stats, selection } from '../e2e/fixtures/catalog.mjs';

test('read-2 uses its separate native port and retains exact selection for stats',async()=>{
  const sent=[];
  setCatalogTransport(async(command,args)=>{sent.push({command,args});return args.request.query.operation==='page'?page():stats();});
  const first=await catalogRead({operation:'page',filter:CATALOG_FILTER,cursor:null,limit:2});
  await catalogRead({operation:'stats',filter:CATALOG_FILTER,selection:first.selection});
  assert.deepEqual(sent.map(s=>s.command),['memory_catalog','memory_catalog']);
  assert.equal(sent[0].args.request.capability,'memory-native-read-2');
  assert.deepEqual(sent[1].args.request.query.selection,first.selection);
  assert.equal(catalogSelectionKey(selection),catalogSelectionKey({...selection,snapshot:{deletion_watermark:1,...selection.snapshot}}));
  assert.equal(catalogScopeKey(selection),catalogScopeKey({...selection,evaluated_at:'2026-11-03T00:01:00.000Z',query_hash:'e'.repeat(64)}));
  assert.notEqual(catalogScopeKey(selection),catalogScopeKey({...selection,scope_hash:'e'.repeat(64)}));
});
test('old channels, wrong effects, unscoped counts and mismatched selections are refused',async()=>{
  for(const bad of [{...status(),capability:'memory-native-read-1'},{...status(),effect:'native_control'},{...status(),mode:'owner'}, {...status(),available:false}]){
    setCatalogTransport(async()=>bad);await assert.rejects(catalogRead({operation:'status'}));
  }
  for(const bad of [{...page(),scope:'global'},{...page(),count_exact:false},{...page(),items:[{title:'broken'}]}, {...page(),selection:{...selection,version:3}}, {...page(),next:{after:'another',selection:{...selection,query_hash:'f'.repeat(64)}}}]){
    setCatalogTransport(async()=>bad);await assert.rejects(catalogRead({operation:'page',filter:CATALOG_FILTER,cursor:null,limit:2}));
  }
  setCatalogTransport(async()=>stats({...selection,query_hash:'f'.repeat(64)}));
  await assert.rejects(catalogRead({operation:'stats',filter:CATALOG_FILTER,selection}));
});
test('Busy, stale, unknown IPC and control failures remain one send without fallback',async()=>{
  for(const operation of ['status','page','stats','lock','unlock'])for(const error of ['catalog_busy','catalog_stale','worker_failed']){
    let calls=0;setCatalogTransport(async()=>{calls++;throw error;});
    await assert.rejects(catalogRead({operation,filter:CATALOG_FILTER,cursor:null,limit:2,selection}),actual=>actual===error);
    assert.equal(calls,1);
  }
});
test('controls require their native-control acknowledgement',async()=>{
  setCatalogTransport(async()=>({...status('locked'),effect:'native_control'}));
  assert.equal((await catalogRead({operation:'lock'})).state,'locked');
  await assert.rejects(catalogRead({operation:'status'}));
  setCatalogTransport(async()=>status('locked'));await assert.rejects(catalogRead({operation:'lock'}));
});
