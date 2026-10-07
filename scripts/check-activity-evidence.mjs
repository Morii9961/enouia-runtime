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
  assert.equal(reports.size, 9);
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
  assert(index.remainingGates.length >= 5);
  return { state: 'index_integrity_passed', historicalReports: reports.size, matrixCases: 18, evidenceLinks: linked, signedOffCases: 0, b4SignedOff: false, b5Activated: false, unresolvedComparisons: 2, unresolvedLiteralShapes: literal.unresolvedCaseIds.length };
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
  result.negativeChecks = 8;
}
assert(process.argv.slice(2).every(arg => arg === '--self-test'), 'unsupported argument');
console.log(JSON.stringify(result, null, 2));
