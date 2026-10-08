import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const indexPath = 'docs/validation/B4/coverage.json';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function contained(path) {
  assert.equal(typeof path, 'string');
  assert(!isAbsolute(path) && !path.includes('\\'), 'evidence path must be repository-relative');
  const full = realpathSync(resolve(root, path));
  const rel = relative(root, full);
  assert(rel && !rel.startsWith('..') && !isAbsolute(rel), 'evidence path escapes repository');
  return full;
}

function validate(index) {
  assert.equal(index.schemaVersion, 1);
  assert.equal(index.scope, 'historical_isolated_evidence_index');
  assert.equal(index.b4SignedOff, false, 'this index cannot authorize B4 acceptance');
  assert.equal(index.b5Activated, false, 'this index cannot authorize production');
  assert.equal(index.compatibilityDecision, 'ADR-031');
  assert.deepEqual(index.cases.map(c => c.id), Array.from({ length: 18 }, (_, n) => `C${String(n + 1).padStart(2, '0')}`));
  const reports = new Map();
  for (const entry of index.reports) {
    assert(!reports.has(entry.id), 'duplicate evidence ID');
    assert.match(entry.sha256, /^[0-9a-f]{64}$/);
    const bytes = readFileSync(contained(entry.path));
    assert.equal(hash(bytes), entry.sha256, `historical report changed: ${entry.id}`);
    const report = JSON.parse(bytes);
    assert.equal(report.schemaVersion, 1);
    assert.equal(report.state, entry.state);
    const selectors = [...(report.checks ?? []), ...(report.results ?? []).map(r => r.id)];
    assert.equal(selectors.length, entry.selectorCount, `evidence count changed: ${entry.id}`);
    reports.set(entry.id, { report, selectors });
  }
  assert.equal(reports.size, 16);
  const frozen2 = reports.get('frozen2').report;
  assert.deepEqual(frozen2.unresolvedCaseIds, ['C06-duplicate-github-date', 'C06-unsafe-github-sum']);
  assert.equal(frozen2.results.find(r => r.id === 'C03-claude-down').result, 'equal', 'ADR-029 keeps the higher Claude day like legacy');
  const literal = reports.get('literal').report;
  assert.equal(literal.caseCount, 49);
  assert(literal.results.filter(r => ['metric', 'timezone'].includes(r.field)).every(r => r.result === 'match' && !r.legacyAccepted && !r.runtimeAccepted), 'unit/zone literals must be rejected by both validators');
  assert.deepEqual(literal.unresolvedCaseIds, literal.results.filter(r => r.result === 'runtime_stricter').map(r => r.id));
  assert.equal(literal.unresolvedCaseIds.length, 12);
  const regression = reports.get('regression').report;
  assert.equal(regression.cases.length, 10);
  assert(regression.cases.every(c => c.publicState === 'degraded' && !c.publicationObserved && c.runtimeExitCode === 4), 'regression candidates must stay unpublished');
  const frozen = reports.get('frozen').report;
  assert.equal(frozen.caseCount, 30);
  assert.equal(frozen.results.length, 30);
  assert.deepEqual(frozen.unresolvedCaseIds, ['C06-duplicate-github-date', 'C06-unsafe-github-sum']);
  assert.equal(frozen.results.filter(r => r.result === 'unresolved_difference').length, 2);
  const githubCases = ['C06-duplicate-github-date', 'C06-unsafe-github-sum'];
  const frozen3 = reports.get('frozen3').report;
  assert.equal(frozen3.compatibilityDecision, 'ADR-031');
  assert.equal(frozen3.caseCount, 30);
  assert.equal(frozen3.checks.length, 6);
  assert.deepEqual(frozen3.unresolvedCaseIds, []);
  assert.deepEqual(frozen3.referenceDirtyFiles, []);
  for (const current of frozen3.results) {
    const historical = frozen2.results.find(r => r.id === current.id);
    assert(historical, 'new comparison case requires explicit evidence reconciliation');
    assert.equal(current.inputSha256, historical.inputSha256, 'classification must use the same historical fixture');
    assert.equal(current.runtimeDataSha256, historical.runtimeDataSha256, 'classification cannot hide changed Runtime bytes');
    if (githubCases.includes(current.id)) {
      assert.equal(current.result, 'intentional_difference');
      assert.equal(current.policy, 'strict_github_source_validation');
      assert.deepEqual(current.differences, ['github']);
      const source = current.sources.find(s => s.id === 'github');
      const prior = historical.sources.find(s => s.id === 'github');
      assert.equal(source.runtimeOutcome.result, 'failed');
      assert.equal(source.legacyOutcome.result, 'success');
      assert.deepEqual(source.runtimeDays, prior.runtimeDays);
      assert.equal(source.runtimeUpdatedAt, prior.runtimeUpdatedAt);
      assert.equal(source.runtimeOutcome.succeededAt, source.runtimeUpdatedAt);
    } else {
      assert.equal(current.result, historical.result, 'ADR-031 may classify only its two explicit GitHub cases');
    }
  }
  const literal2 = reports.get('literal2').report;
  assert.equal(literal2.compatibilityDecision, 'ADR-031');
  assert.equal(literal2.caseCount, 49);
  assert.equal(literal2.checks.length, 75);
  assert.deepEqual(literal2.unresolvedCaseIds, []);
  assert.deepEqual(literal2.referenceDirtyFiles, []);
  assert.deepEqual(literal2.intentionalRefusalCaseIds, literal.unresolvedCaseIds);
  for (const current of literal2.results) {
    const historical = literal.results.find(r => r.id === current.id);
    assert(historical);
    for (const field of ['source', 'field', 'input', 'legacyAccepted', 'runtimeAccepted', 'runtimeExitCode', 'canonicalSha256']) assert.deepEqual(current[field], historical[field], 'classification cannot change literal validation behavior');
    assert.deepEqual(current.runtimeUnpublishableSuccessTimes, historical.runtimeUnpublishableSuccessTimes);
    if (literal.unresolvedCaseIds.includes(current.id)) {
      assert.equal(current.result, 'intentional_refusal');
      assert.equal(current.policy, 'strict_retained_timestamp');
      assert.equal(current.runtimeAccepted, false);
      assert.equal(current.runtimeExitCode, 6);
      assert.equal(current.legacyAccepted, true);
      assert.equal(current.legacyManifestTimestampAccepted, false);
    } else {
      assert.equal(current.result, historical.result, 'ADR-031 may classify only its twelve explicit timestamp cases');
      assert.equal(current.policy, null);
    }
  }
  const scheduled = reports.get('scheduler_closed_ui').report;
  const rawBytes = readFileSync(contained(scheduled.rawReport));
  assert.equal(hash(rawBytes), scheduled.rawReportSha256, 'closed-UI raw evidence changed');
  const raw = JSON.parse(rawBytes);
  assert.equal(scheduled.scope, 'isolated_real_scheduler_closed_ui');
  assert.equal(raw.state, 'passed');
  assert.equal(raw.scheduler, 'real_unique_sandbox_task');
  assert.equal(scheduled.processExitCode, 0);
  assert.equal(scheduled.checkCount, 57);
  assert.equal(raw.checks, scheduled.checkCount);
  assert.deepEqual(scheduled.closedUiSync, raw.closedUiSync);
  assert.equal(scheduled.closedUiSync.desktopClosed, true);
  assert.equal(scheduled.closedUiSync.deliveryEnabled, false);
  assert.equal(scheduled.closedUiSync.pendingRetryByteIdentical, true);
  assert.equal(scheduled.closedUiSync.retainedSources, 3);
  assert.equal(scheduled.closedUiSync.sequence, 51);
  assert.deepEqual(scheduled.closedUiSync.taskResults, [4, 4]);
  for (const digest of [scheduled.runnerSha256, scheduled.harnessSha256, scheduled.closedUiSync.exactPendingSha256]) assert.match(digest, /^[a-f0-9]{64}$/);
  const independent = reports.get('independent_package').report;
  assert.equal(independent.scope, 'isolated_installed_package_clean_environment');
  assert.equal(independent.checkCount, 21);
  assert.equal(independent.checks.length, 21);
  assert.equal(independent.taskRegistered, false);
  assert.equal(independent.deliveryEnabled, false);
  assert.equal(independent.bootstrapRemoved, true);
  assert.equal(independent.childPath, 'Windows System32 only');
  assert.equal(independent.sequence, 51);
  for (const digest of [independent.runnerSha256, independent.harnessSha256, independent.exactPendingSha256]) assert.match(digest, /^[a-f0-9]{64}$/);
  assert(independent.limitations.includes('Source checkouts still exist on the host; this is not filesystem-denial or physical-absence evidence.'));
  const isolation = reports.get('index_isolation').report;
  assert.equal(isolation.scope, 'isolated_native_memory_index_activity');
  const isolationBytes = readFileSync(contained(isolation.nativeReport));
  assert.equal(hash(isolationBytes), isolation.nativeReportSha256, 'native index-isolation evidence changed');
  const nativeIsolation = JSON.parse(isolationBytes);
  assert.equal(isolation.nativeSummary, '35/35');
  assert.equal(isolation.processExitCode, 0);
  assert.equal(nativeIsolation.summary, isolation.nativeSummary);
  assert.equal(nativeIsolation.checks.length, 35);
  assert(nativeIsolation.checks.every(c => c.ok === true));
  assert.deepEqual(isolation.checks, nativeIsolation.checks.filter(c => c.id.startsWith('I.')).map(c => c.id));
  assert.equal(isolation.checks.length, 6);
  assert.equal(isolation.memoryRevision, 'ff692ccb6fbc1c387254d5ffbef41b105eeb2a84');
  for (const digest of [isolation.harnessSha256, isolation.desktopSha256, isolation.runnerSha256]) assert.match(digest, /^[a-f0-9]{64}$/);
  assert(isolation.limitations.includes('No corrupt index, storage fault, concurrent long-running rebuild or personal Vault is tested.'));
  const missing = reports.get('missing_index').report;
  assert.equal(missing.scope, 'isolated_native_missing_index_activity');
  const missingBytes = readFileSync(contained(missing.nativeReport));
  assert.equal(hash(missingBytes), missing.nativeReportSha256, 'missing-index native evidence changed');
  const missingNative = JSON.parse(missingBytes);
  assert.equal(missing.nativeSummary, '41/41');
  assert.equal(missing.processExitCode, 0);
  assert.equal(missingNative.summary, missing.nativeSummary);
  assert.equal(missingNative.checks.length, 41);
  assert(missingNative.checks.every(c => c.ok === true));
  assert.deepEqual(missing.checks, missingNative.checks.filter(c => c.id.startsWith('R.')).map(c => c.id));
  assert.equal(missing.checks.length, 6);
  assert.equal(missing.memoryRevision, isolation.memoryRevision);
  for (const digest of [missing.harnessSha256, missing.desktopSha256, missing.runnerSha256]) assert.match(digest, /^[a-f0-9]{64}$/);
  assert(missing.limitations.includes('This is missing-cache recovery, not malformed SQLite, disk-full, permission-failure or long-running overlap acceptance.'));
  let linked = 0;
  for (const row of index.cases) {
    assert.equal(row.status, 'partial');
    assert.equal(row.signedOff, false);
    assert(row.remaining.length > 0 && row.remaining.every(s => typeof s === 'string' && s.trim()));
    assert(row.evidence.length > 0, `missing evidence for ${row.id}`);
    for (const ref of row.evidence) {
      assert(reports.has(ref.report), `unknown report: ${ref.report}`);
      assert(ref.selectors.length > 0);
      for (const selector of ref.selectors) {
        assert(reports.get(ref.report).selectors.includes(selector), `missing evidence selector: ${selector}`);
        linked++;
      }
    }
  }
  const c06 = index.cases.find(c => c.id === 'C06');
  const linkedTo = (row, report) => row.evidence.filter(e => e.report === report).flatMap(e => e.selectors);
  assert(githubCases.every(id => linkedTo(c06, 'frozen3').includes(id)), 'C06 must link both current GitHub safety cases');
  assert(literal2.intentionalRefusalCaseIds.every(id => linkedTo(c06, 'literal2').includes(id)), 'C06 must link all twelve current timestamp refusals');
  const c17 = index.cases.find(c => c.id === 'C17');
  assert(linkedTo(c17, 'scheduler_closed_ui').includes('C17: installed scheduled sync advances one sequence with the desktop closed'), 'C17 must retain actual closed-UI evidence');
  assert(linkedTo(c17, 'independent_package').includes('bootstrap source files are absent'), 'C17 must retain independently installed package evidence');
  assert(linkedTo(c17, 'index_isolation').includes('I.memory_rebuild_preserves_activity_bytes'), 'C17 must retain pinned-Core rebuild isolation evidence');
  assert(linkedTo(c17, 'missing_index').includes('R.cache_recovery_preserves_activity_bytes'), 'C17 must retain missing-cache isolation evidence');
  assert(index.remainingGates.length >= 5);
  return { state: 'index_integrity_passed', recordedReports: reports.size, historicalReports: 10, currentFollowupReports: 6, matrixCases: 18, evidenceLinks: linked, signedOffCases: 0, b4SignedOff: false, b5Activated: false, historicalUnresolvedComparisons: 2, historicalUnresolvedLiteralShapes: literal.unresolvedCaseIds.length, unresolvedComparisons: frozen3.unresolvedCaseIds.length, unresolvedLiteralShapes: literal2.unresolvedCaseIds.length, classifiedTimestampRefusals: literal2.intentionalRefusalCaseIds.length };
}

const index = JSON.parse(readFileSync(contained(indexPath)));
const result = validate(index);
if (process.argv.includes('--self-test')) {
  const reject = change => { const copy = structuredClone(index); change(copy); assert.throws(() => validate(copy)); };
  reject(x => x.cases.pop());
  reject(x => x.reports[0].sha256 = '0'.repeat(64));
  reject(x => x.cases[0].evidence[0].selectors.push('nonexistent evidence'));
  reject(x => x.reports[0].path = '../outside.json');
  reject(x => x.b4SignedOff = true);
  reject(x => x.b5Activated = true);
  reject(x => x.cases[0].remaining = []);
  reject(x => x.reports.push(x.reports[0]));
  reject(x => x.compatibilityDecision = 'unknown');
  reject(x => x.cases.find(c => c.id === 'C06').evidence = x.cases.find(c => c.id === 'C06').evidence.filter(e => e.report !== 'literal2'));
  reject(x => x.cases.find(c => c.id === 'C17').evidence = x.cases.find(c => c.id === 'C17').evidence.filter(e => e.report !== 'scheduler_closed_ui'));
  reject(x => x.reports.find(r => r.id === 'literal2').state = 'completed_with_unresolved_differences');
  reject(x => x.cases.find(c => c.id === 'C17').evidence = x.cases.find(c => c.id === 'C17').evidence.filter(e => e.report !== 'independent_package'));
  reject(x => x.cases.find(c => c.id === 'C17').evidence = x.cases.find(c => c.id === 'C17').evidence.filter(e => e.report !== 'index_isolation'));
  reject(x => x.cases.find(c => c.id === 'C17').evidence = x.cases.find(c => c.id === 'C17').evidence.filter(e => e.report !== 'missing_index'));
  result.negativeChecks = 15;
}
assert(process.argv.slice(2).every(arg => arg === '--self-test'), 'unsupported argument');
console.log(JSON.stringify(result, null, 2));
