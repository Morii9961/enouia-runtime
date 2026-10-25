import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { HistoryBriefOwner, historyBriefObservation } from "../src/memory/historyBrief.ts";
import { historyComparisonFixture } from "./history-comparison-fixture.ts";
import { setTransport } from "../src/memory/client.ts";
const fixture=historyComparisonFixture, fence=String.fromCharCode(96).repeat(3);
function brief(comparison=fixture().response, markdown="# Synthetic navigation\n"+fence+"json\n{\"text\":\"<img src=x onerror=alert(1)>\\n# untrusted heading\"}\n"+fence) {
  return {base:structuredClone(comparison.base),batches:structuredClone(comparison.batches),maxBytes:131072,markdown,
    contentHash:createHash("sha256").update(markdown,"utf8").digest("hex")};
}
function owner(){const f=fixture(),o=new HistoryBriefOwner("synthetic-vault");o.select(f.choices,f.response);return{f,o};}
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};}
test("brief requires an observed selection and sends one explicit null-key read without paths or topic text",async()=>{
  const {f,o}=owner(),calls=[];
  setTransport(async(native,{request})=>{
    assert.equal(native,"memory_call");calls.push(request);
    return {kind:"history_brief",result:brief(f.response)};
  });
  assert.equal(calls.length,0);await o.read();
  assert.equal(calls.length,1);assert.equal(calls[0].idempotencyKey,null);
  assert.deepEqual(calls[0].arguments,{batches:f.response.batches.map(({taskId,batchIndex})=>({taskId,batchIndex})),
    comparisonCommitId:f.response.base.commitId,maxBytes:131072});
  assert.throws(()=>o.select(f.choices,{...f.response,base:null}),/mismatch/);
  await assert.rejects(o.read(),/unavailable/);
});
test("brief exact UTF-8 hash, byte budget, snapshot and native child binding are validated",async()=>{
  const f=fixture(),response=brief(f.response);
  const shown=await historyBriefObservation(response,f.response,131072);
  assert.equal(shown.markdown,response.markdown);
  assert.throws(()=>{shown.markdown="changed";},TypeError);
  for(const change of [
    r=>r.markdown+="changed",r=>r.contentHash="0".repeat(64),r=>r.base.sequence++,
    r=>r.batches[0].runId="foreign",r=>r.maxBytes=1,r=>r.batches.reverse(),
  ]){
    const raw=brief(f.response);change(raw);
    await assert.rejects(historyBriefObservation(raw,f.response,131072),/mismatch/);
  }
  const unicode=brief(f.response,"字".repeat(50000));
  await assert.rejects(historyBriefObservation(unicode,f.response,131072),/mismatch/);
});
test("failed refresh withdraws the earlier brief and never automatically retries",async()=>{
  const {f,o}=owner();await o.read(async()=>brief(f.response));
  let calls=0;await assert.rejects(o.read(async()=>{calls++;throw Error("refused");}),/refused/);
  assert.equal(o.snapshot.preview,null);assert.equal(o.snapshot.reading,false);assert.equal(calls,1);
});
test("late request and post-hash selection round trips cannot restore old text",async()=>{
  const {f,o}=owner(),wait=deferred();
  const reading=o.read(async()=>{await wait.promise;return brief(f.response);});
  o.invalidate();o.select(f.choices,f.response);wait.resolve();
  assert.equal(await reading,null);assert.equal(o.snapshot.preview,null);
  const original=crypto.subtle.digest,entered=deferred(),release=deferred();
  crypto.subtle.digest=async(...args)=>{entered.resolve();await release.promise;return original.apply(crypto.subtle,args);};
  try{
    const reading=o.read(async()=>brief(f.response));await entered.promise;
    o.invalidate();o.select(f.choices,f.response);release.resolve();
    assert.equal(await reading,null);assert.equal(o.snapshot.preview,null);
  }finally{release.resolve();crypto.subtle.digest=original;}
});
test("mutation of the transport object while hashing cannot change verified displayed text",async()=>{
  const f=fixture(),raw=brief(f.response),before=raw.markdown;
  const original=crypto.subtle.digest,entered=deferred(),release=deferred();
  crypto.subtle.digest=async(...args)=>{entered.resolve();await release.promise;return original.apply(crypto.subtle,args);};
  try{
    const reading=historyBriefObservation(raw,f.response,131072);await entered.promise;
    raw.markdown="unverified replacement";release.resolve();
    assert.equal((await reading).markdown,before);
  }finally{release.resolve();crypto.subtle.digest=original;}
});
test("actual Memory deterministic brief bytes and hash pass consumer validation",{skip:!process.env.MEMORY_HISTORY_BRIEF_FIXTURE},async()=>{
  const data=JSON.parse(readFileSync(process.env.MEMORY_HISTORY_BRIEF_FIXTURE,"utf8"));
  const shown=await historyBriefObservation(data.response,data.comparison,data.args.maxBytes);
  assert.ok(shown.markdown.includes("Synthetic comparison statement 0"));
  assert.ok(shown.markdown.includes("Synthetic owner edited content"));
  assert.ok(shown.markdown.includes("uncited_span_occurrences"));
});
