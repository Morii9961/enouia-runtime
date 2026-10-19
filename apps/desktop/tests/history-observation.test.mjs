import test from 'node:test';
import assert from 'node:assert/strict';
import { historyObservation } from '../src/memory/observationIdentity.ts';
import { historyPage, historySelection, PLAN_HASH } from './history-fixture.ts';

test('history observations retain the exact archive, Vault, parameters and page binding', () => {
  const page = historyPage();
  assert.equal(historyObservation(page, historySelection), page);
  const next = { ...historySelection, cursor: `${PLAN_HASH}:10` };
  assert.equal(historyObservation(historyPage(next), next).batches[0].batchIndex, 10);
  assert.equal(historyObservation(historyPage(next), next).nextCursor, null);
});

test('mixed history identities, parameters and invented completeness cannot be published', () => {
  const mutations = [
    x => x.identity.vaultId = 'other', x => x.identity.importId = 'other', x => x.identity.importRevision++,
    x => x.identity.messagesPerBatch++, x => x.identity.maxPathReferences++, x => x.identity.plannerVersion = 'unknown',
    x => x.identity.inputObjectHash = 'unverified', x => x.planHash = 'unverified', x => x.readOnly = false,
    x => x.coverageIsCompleteHistory = true, x => x.summary.messages = '24', x => x.summary.dated++,
    x => x.summary.undated = -1, x => x.summary.earliest = '2026-02-30T00:00:00.000Z',
    x => x.batches[0].messages[0].sourceRevision = 0, x => x.batches[0].messages[0].occurredAt = 'unknown',
    x => x.batches[0].selectedInExport = 'approved', x => x.batches[0].leaf = null,
    x => x.issues[0].unitIndex = 12, x => x.issues[0].kind = 'approved', x => x.issuesOmitted++,
  ];
  for (const mutate of mutations) { const value = historyPage(); mutate(value); assert.throws(() => historyObservation(value, historySelection), /mismatch/); }
});

test('history page gaps, duplicates and stale or nonadvancing cursors are refused', () => {
  const changes = [x => x.batches[1].batchIndex = 0, x => x.batches.pop(), x => x.nextCursor = `${PLAN_HASH}:0`,
    x => x.nextCursor = null, x => x.batches[0].messages = [], x => x.batches[0].messages = Array(16).fill(x.batches[0].leaf)];
  for (const mutate of changes) { const value = historyPage(); mutate(value); assert.throws(() => historyObservation(value, historySelection), /mismatch/); }
  const stale = { ...historySelection, cursor: `${'c'.repeat(64)}:10` };
  assert.throws(() => historyObservation(historyPage(stale), stale), /mismatch/);
});
