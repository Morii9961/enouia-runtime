import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { HistoryComparisonOwner, comparisonBindings, historyComparisonObservation } from "../src/memory/historyComparison.ts";
import { setTransport } from "../src/memory/client.ts";
import { historyComparisonFixture } from "./history-comparison-fixture.ts";

const fixture = historyComparisonFixture, vault = "synthetic-vault";
function owner() { const f=fixture(), o=new HistoryComparisonOwner(vault);o.select(f.choices);return { f,o }; }
function deferred() { let resolve; const promise=new Promise(r=>{resolve=r;});return {promise,resolve}; }

test("only observed current-Vault distinct batches may be selected; mount and selection make no calls", () => {
  const {f,o}=owner();assert.equal(o.snapshot.preview,null);
  const bindings=comparisonBindings(vault,f.choices);
  assert.equal(bindings.length,2);
  f.task.batches[0].sessionId="mutated";
  assert.equal(o.snapshot.bindings[1].sessionId,"synthetic-child-1");
  assert.throws(()=>comparisonBindings("another",fixture().choices));
  assert.throws(()=>comparisonBindings(vault,[]));
  const c=fixture().choices[0];
  assert.throws(()=>comparisonBindings(vault,[c,c]));
  assert.throws(()=>comparisonBindings(vault,[{...c,batchIndex:999}]));
});
test("immutable result retains unknown time, non-user evidence, original and edited candidate separately", () => {
  const f=fixture(), shown=historyComparisonObservation(f.response,comparisonBindings(vault,f.choices));
  assert.equal(shown.topics[0].entries[0].occurredAt,null);
  assert.equal(shown.topics[0].entries[0].content,"Original synthetic proposal 0");
  assert.equal(shown.topics[0].entries[0].candidate.content,"Current owner edited synthetic wording");
  assert.equal(shown.topics[0].entries[1].evidenceClass,"model_claim");
  assert.equal(shown.topics[0].comparisons[0].difference,"UnorderedDifference");
  assert.throws(()=>{shown.topics[0].entries[0].content="mutated";},TypeError);
  f.response.topics[0].entries[0].content="mutated";
  assert.notEqual(shown.topics[0].entries[0].content,"mutated");
});
test("foreign binding, broken coverage, impossible state, bad time and comparison links are rejected", () => {
  const corruptions=[
    r=>r.batches[0].taskId="foreign",r=>r.runs[0].selection.run_id="foreign",
    r=>r.runs[0].response_hash="invalid",r=>r.runs[0].applied=2,
    r=>r.runs[0].sources[0].context.text="unrelated",r=>r.runs[0].sources[0].suggestion_indices=[],
    r=>r.runs[0].sources[0].context.source_context.occurred_at="2026",
    r=>r.runs[0].sources[0].context.source_context.time_precision="inferred",
    r=>r.topics[0].entries[0].sourceRevision=2,r=>r.topics[0].entries[0].sessionId="foreign",
    r=>r.topics[0].entries[0].quote="unrelated",r=>r.topics[0].entries[0].candidate.status="canonical",
    r=>r.topics[0].entries[0].flags=["invented"],r=>r.topics[0].entries.pop(),
    r=>r.topics[0].comparisons[0].right=9,r=>r.topics[0].comparisons=[],
    r=>r.topics[0].comparisons[0].difference="latest_wins",
    r=>r.topics[0].comparisons.push(structuredClone(r.topics[0].comparisons[0])),
  ];
  for(const corrupt of corruptions) {
    const f=fixture();corrupt(f.response);
    assert.throws(()=>historyComparisonObservation(f.response,comparisonBindings(vault,f.choices)),/mismatch/);
  }
});
test("actual client sends only explicit task/batch IDs and a null key; refresh failure withdraws text", async () => {
  const {f,o}=owner(), calls=[];
  setTransport(async(native,{request})=>{
    assert.equal(native,"memory_call");calls.push(request);
    if(calls.length===2)return {kind:"memory_error",error:{code:"permission_denied",retryable:false,rules:["history.source_read"]}};
    return {kind:"history_comparison",result:f.response};
  });
  await o.read();
  assert.equal(calls[0].idempotencyKey,null);
  assert.equal(calls[0].command,"history_compare");
  assert.deepEqual(calls[0].arguments,{batches:f.response.batches.map(({taskId,batchIndex})=>({taskId,batchIndex}))});
  await assert.rejects(o.read(),/permission_denied/);
  assert.equal(o.snapshot.preview,null);
  assert.equal(calls.length,2);
});
test("selection round trips and disabled/unmounted owners suppress late success and late errors", async () => {
  for(const failed of [false,true]) {
    const {f,o}=owner(), wait=deferred();
    const reading=o.read(async()=>{await wait.promise;if(failed)throw Error("old");return f.response;});
    o.invalidate();o.select(f.choices);wait.resolve();
    assert.equal(await reading,null);assert.equal(o.snapshot.preview,null);
    assert.equal(o.snapshot.reading,false);
  }
});
test("an old read cannot clear a newer read's busy state or install a preview", async () => {
  const {f,o}=owner(), old=deferred(), fresh=deferred();
  const first=o.read(async()=>{await old.promise;return f.response;});
  o.select(f.choices);
  const second=o.read(async()=>{await fresh.promise;return f.response;});
  old.resolve();assert.equal(await first,null);assert.equal(o.snapshot.reading,true);
  await assert.rejects(o.read(),/unavailable/);
  fresh.resolve();await second;assert.equal(o.snapshot.preview.topics.length,1);
});
test("actual Memory Core output is accepted without altering saved semantics", {skip:!process.env.MEMORY_HISTORY_COMPARE_FIXTURE}, () => {
  const {batches,response}=JSON.parse(readFileSync(process.env.MEMORY_HISTORY_COMPARE_FIXTURE,"utf8"));
  const bindings=response.batches;
  assert.deepEqual(bindings.map(({taskId,batchIndex})=>({taskId,batchIndex})),batches);
  const shown=historyComparisonObservation(response,bindings);
  assert.equal(shown.topics[0].comparisons[0].difference,"DatedDifference");
  assert.equal(shown.topics[0].entries[0].candidate.status,"pending");
  assert.notEqual(shown.topics[0].entries[0].content,shown.topics[0].entries[0].candidate.content);
});
