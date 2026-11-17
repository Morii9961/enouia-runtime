import assert from 'node:assert/strict';
import test from 'node:test';
import { catalogRead, catalogSelectionKey, catalogScopeKey, CATALOG_FILTER, setCatalogTransport } from '../src/memory/catalog.ts';
import { status, page, stats, selection, detail, source, sourceRef, quote } from '../e2e/fixtures/catalog.mjs';

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

test('registered read-only entry has an explicit mode and bounded failure reason',async()=>{
  setCatalogTransport(async()=>({...status('failed'),mode:'registered_owner_readonly',reason:'catalog_owner_authentication_failed'}));
  assert.equal((await catalogRead({operation:'status'})).mode,'registered_owner_readonly');
  setCatalogTransport(async()=>({...status('failed'),mode:'registered_owner_readonly',reason:{home:'untrusted'}}));
  await assert.rejects(catalogRead({operation:'status'}));
});

test('native detail and scalar source ranges use read-2 without a source read on detail',async()=>{
  const sent=[];
  setCatalogTransport(async(command,args)=>{sent.push(args.request.query);return args.request.query.operation==='detail'?detail():source(args.request.query.start,args.request.query.limit);});
  const result=await catalogRead({operation:'detail',filter:CATALOG_FILTER,memory_id:'synthetic-memory-1'});
  assert.equal(result.fields.evidence[0].quote,quote);
  assert.deepEqual(sent.map(q=>q.operation),['detail']);
  let recovered='',start=0;
  for(;;){
    const part=await catalogRead({operation:'source',source:sourceRef,start,limit:3});
    recovered+=part.excerpt;
    if(part.complete_in_scope)break;
    start=part.end;
  }
  assert.equal(recovered,quote);
});

test('wrong detail identity, old process headers and malformed source ranges refuse',async()=>{
  for(const bad of [detail('synthetic-memory-2'),{...detail(),header:{...detail().header,version:1}},
    {...detail(),fields:{title:'bad',evidence:[{...detail().fields.evidence[0],end:999}]}}]){
    setCatalogTransport(async()=>bad);
    await assert.rejects(catalogRead({operation:'detail',filter:CATALOG_FILTER,memory_id:'synthetic-memory-1'}));
  }
  for(const bad of [{...source(),source:{...sourceRef,source_revision:2}},{...source(),start:1},
    {...source(),end:999},{...source(),complete_in_scope:false},{...source(),excerpt:'cut text'}]){
    setCatalogTransport(async()=>bad);
    await assert.rejects(catalogRead({operation:'source',source:sourceRef,start:0,limit:4096}));
  }
  setCatalogTransport(async()=>({...source(),source:null,source_record:null,excerpt:null,start:0,end:0,total_characters:0,complete_in_scope:true}));
  assert.equal((await catalogRead({operation:'source',source:sourceRef,start:0,limit:3})).source,null);
});
