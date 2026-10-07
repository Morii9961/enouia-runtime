import test from 'node:test';
import assert from 'node:assert/strict';
import { demoData } from '../src/demo-data.ts';
import { approveDemoCandidate, reviseDemoMemory } from '../src/demo-state.ts';

const at = '2026-10-04T02:00:00.000Z';

test('candidate edits preserve the proposal and its identity/provenance; fixture remains unchanged', () => {
  const original = structuredClone(demoData.MEM);
  const result = approveDemoCandidate(demoData.MEM, 'c1', 'Reviewed fictional preference', at);
  const candidate = original.find(m => m.key === 'c1');
  const approved = result.find(m => m.key === 'c1');
  assert.equal(approved.status, 'active');
  assert.equal(approved.content, 'Reviewed fictional preference');
  assert.deepEqual(approved.originalProposal, candidate);
  assert.deepEqual(approved.src, candidate.src);
  assert.equal(approved.created, candidate.created);
  assert.deepEqual(demoData.MEM, original);
  assert.equal(demoData.EXCL.find(x => x.mem === 'c1').reason, 'candidate · no capsule path');
});

test('revision retains a linked previous version and fresh manual-save provenance', () => {
  const result = reviseDemoMemory(demoData.MEM, 'm1', 'New fictional project state', at, 'revision-a');
  const old = result.find(m => m.key === 'm1');
  const revision = result.find(m => m.key === 'revision-a');
  assert.equal(old.status, 'superseded');
  assert.equal(old.supersededBy, 'revision-a');
  assert.equal(revision.supersedes, 'm1');
  assert.equal(revision.status, 'active');
  assert.deepEqual(revision.src, { kind: 'manual_save', at });
  assert.equal(demoData.MEM.find(m => m.key === 'm1').status, 'active');
});

test('invalid actions, blank edits, checkpoints and repeated identities are refused', () => {
  assert.throws(() => approveDemoCandidate(demoData.MEM, 'm1', null, at));
  assert.throws(() => approveDemoCandidate(demoData.MEM, 'c1', ' \n ', at));
  for (const key of ['c1', 'm0', 'm7', 'missing']) assert.throws(() => reviseDemoMemory(demoData.MEM, key, 'text', at, 'new'));
  assert.throws(() => reviseDemoMemory(demoData.MEM, 'm1', '', at, 'new'));
  assert.throws(() => reviseDemoMemory(demoData.MEM, 'm1', 'text', at, 'm2'));
});

test('separate windows and a frozen compiled fixture cannot be changed by demo edits', () => {
  const a = approveDemoCandidate(demoData.MEM, 'c1', null, at);
  const b = reviseDemoMemory(demoData.MEM, 'm1', 'Window B', at, 'revision-b');
  assert.equal(a.find(m => m.key === 'm1').status, 'active');
  assert.equal(b.find(m => m.key === 'c1').status, 'candidate');
  assert.equal(Object.isFrozen(demoData.MEM[0]), true);
});
