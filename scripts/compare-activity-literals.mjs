// Development-only B4 C06 unit/zone/timestamp-literal comparison. Never imported by Runtime or regular tests.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const options = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i]; const value = process.argv[i + 1];
  assert(['--reference-root', '--binary', '--report'].includes(key) && value && !options.has(key), 'Invalid/duplicate option.');
  assert(isAbsolute(value), 'All supplied paths must be absolute.');
  options.set(key, value);
}
for (const key of ['--reference-root', '--binary']) assert(options.has(key), 'Reference root and release binary paths are required.');
const sourceRoot = await realpath(options.get('--reference-root'));
const binarySource = await realpath(options.get('--binary'));
const fixtureFile = new URL('../tests/fixtures/activity/moriium-public-data.json', import.meta.url);
const sourceFiles = ['src/lib/activity.ts', 'src/lib/status.ts'];
const SOURCES = ['github', 'codex', 'claude'];
const strictTimestampCases = new Set(SOURCES.flatMap(source => ['no-zone', 'rfc1123', 'hour-24', 'impossible-day'].map(shape => `C06-updated-${shape}-${source}`)));
const LITERALS = { github: { timezone: 'GitHub', metric: 'contributions' }, codex: { timezone: 'Codex', metric: 'tokens' }, claude: { timezone: 'Asia/Shanghai', metric: 'tokens' } };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const checks = [];
function check(name, condition) { assert(condition, name); checks.push(name); }
async function run(executable, args, { cwd, env = process.env } = {}) {
  return new Promise((accept, reject) => {
    const child = spawn(executable, args, { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let bytes = 0; const output = []; const errors = [];
    let failure;
    const stop = message => { failure = new Error(message); child.kill(); };
    const timer = setTimeout(() => stop('Isolated process timed out.'), 15000);
    child.on('error', () => { clearTimeout(timer); reject(new Error('Isolated process unavailable.')); });
    for (const [stream, chunks] of [[child.stdout, output], [child.stderr, errors]]) {
      stream.on('data', chunk => { bytes += chunk.length; if (bytes > 128 * 1024) stop('Isolated process exceeded output bound.'); else chunks.push(chunk); });
    }
    child.on('close', code => {
      clearTimeout(timer);
      if (failure) reject(failure);
      else accept({ code, stdout: Buffer.concat(output).toString('utf8'), stderr: Buffer.concat(errors).toString('utf8') });
    });
  });
}
const base = await mkdtemp(join(tmpdir(), 'enouia-b4-'));
try {
  const snapshot = join(base, 'reference');
  const versions = [];
  const head = await run('git', ['-C', sourceRoot, 'rev-parse', 'HEAD']);
  assert.equal(head.code, 0, 'Cannot record reference revision.');
  const dirty = await run('git', ['-C', sourceRoot, 'status', '--porcelain', '--', ...sourceFiles]);
  assert.equal(dirty.code, 0, 'Cannot record reference file status.');
  for (const name of sourceFiles) {
    const original = join(sourceRoot, name);
    assert(!(await lstat(original)).isSymbolicLink(), 'Reference files must not be symbolic links.');
    assert((await realpath(original)).startsWith(sourceRoot + sep), 'Reference file escapes its checkout.');
    const content = await readFile(original);
    const destination = join(snapshot, name);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, content, { flag: 'wx' });
    versions.push({ path: name, sha256: hash(content) });
  }
  // Only the public ActivityData validator is copied, never checkout data/config/auth.
  const { validateActivity } = await import(pathToFileURL(join(snapshot, 'src/lib/activity.ts')));
  const { timestamp } = await import(pathToFileURL(join(snapshot, 'src/lib/status.ts')));
  const executable = join(base, 'installed', 'enouia-activity.exe');
  await mkdir(dirname(executable)); await copyFile(binarySource, executable);
  const fixture = JSON.parse(await readFile(fixtureFile, 'utf8'));

  const cases = [{ id: 'C06-literal-control', source: null, field: null, input: 'canonical fixture', expected: 'accept', change: () => {} }];
  const setField = (source, field, value) => data => { if (value === undefined) delete data.sources[source][field]; else data.sources[source][field] = value; };
  for (const source of SOURCES) {
    const { timezone, metric } = LITERALS[source];
    const other = source === 'github' ? 'tokens' : 'contributions';
    const swapped = source === 'claude' ? 'Codex' : 'Asia/Shanghai';
    for (const [name, field, value, input] of [
      ['metric-wrong', 'metric', other, `metric ${other}`],
      ['metric-case', 'metric', metric[0].toUpperCase() + metric.slice(1), 'metric with changed case'],
      ['metric-missing', 'metric', undefined, 'metric omitted'],
      ['timezone-swapped', 'timezone', swapped, `timezone relabelled ${swapped}`],
      ['timezone-utc', 'timezone', 'UTC', 'timezone UTC'],
      ['timezone-offset', 'timezone', '+08:00', 'timezone as numeric offset'],
      ['timezone-case', 'timezone', timezone.toLowerCase(), 'timezone with changed case'],
      ['timezone-missing', 'timezone', undefined, 'timezone omitted'],
    ]) cases.push({ id: `C06-${name}-${source}`, source, field, input, expected: 'reject', change: setField(source, field, value) });
    // Shapes that differ from the canonical toISOString wire form both producers write.
    for (const [name, value, input] of [
      ['updated-no-millis', '2026-09-26T08:00:00Z', 'UTC without milliseconds'],
      ['updated-offset', '2026-09-26T16:00:00.000+08:00', 'explicit +08:00 offset'],
      ['updated-date-only', '2026-09-26', 'date without time'],
      ['updated-no-zone', '2026-09-26T08:00:00', 'local time without zone'],
      ['updated-rfc1123', 'Sat, 26 Sep 2026 08:00:00 GMT', 'RFC 1123 HTTP date'],
      ['updated-hour-24', '2026-09-26T24:00:00.000Z', 'hour 24'],
      ['updated-impossible-day', '2026-02-30T08:00:00.000Z', 'impossible calendar day'],
      ['updated-padded', ' 2026-09-26T08:00:00.000Z', 'leading whitespace'],
    ]) cases.push({ id: `C06-${name}-${source}`, source, field: 'updatedAt', input, expected: null, change: setField(source, 'updatedAt', value) });
  }

  const results = [];
  for (const item of cases) {
    const data = structuredClone(fixture);
    item.change(data);
    let legacy;
    try { legacy = { accepted: true, sha256: hash(`${JSON.stringify(validateActivity(data))}\n`) }; } catch { legacy = { accepted: false, sha256: null }; }
    const trio = join(base, 'cases', item.id); const output = join(base, 'reports', `${item.id}.json`);
    await mkdir(trio, { recursive: true }); await mkdir(dirname(output), { recursive: true });
    await writeFile(join(trio, 'activity.json'), JSON.stringify(data));
    await writeFile(join(trio, 'sequence.json'), JSON.stringify({ sequence: 50 }));
    const inspected = await run(executable, ['migration-inspect', '--input', trio, '--output', output], { cwd: base });
    assert.equal(inspected.stderr, '', 'Runtime emitted unredacted stderr.');
    assert(!inspected.stdout.includes(base), 'Runtime exported private paths.');
    const value = JSON.parse(inspected.stdout);
    assert(inspected.code === 0 || (inspected.code === 6 && value.state === 'migration_invalid'), `Unexpected Runtime result for ${item.id}.`);
    const runtime = { accepted: inspected.code === 0, exitCode: inspected.code, sha256: inspected.code === 0 ? value.activitySha256 : null, flagged: inspected.code === 0 ? value.unpublishableSuccessTimes : null };
    const comparison = legacy.accepted === runtime.accepted
      ? (legacy.accepted && legacy.sha256 !== runtime.sha256 ? 'canonical_mismatch' : 'match')
      : (legacy.accepted ? 'runtime_stricter' : 'legacy_stricter');
    const intentionalRefusal = strictTimestampCases.has(item.id);
    const manifestTimeAccepted = item.field === 'updatedAt' ? timestamp(data.sources[item.source].updatedAt) : null;
    if (item.field === 'updatedAt') check(`${item.id}: copied manifest validator rejects noncanonical time`, manifestTimeAccepted === false);
    if (intentionalRefusal) check(`${item.id}: known nonpublishable shape is refused before migration`, comparison === 'runtime_stricter' && !runtime.accepted && runtime.exitCode === 6 && manifestTimeAccepted === false);
    const result = intentionalRefusal ? 'intentional_refusal' : comparison;
    if (item.expected) check(`${item.id}: both validators ${item.expected}`, result === 'match' && runtime.accepted === (item.expected === 'accept'));
    // Architecture section 7: an accepted time the manifest cannot carry must be flagged, never restamped.
    if (runtime.accepted) check(`${item.id}: Runtime flags exactly the unpublishable retained times`, JSON.stringify(runtime.flagged) === JSON.stringify(item.field === 'updatedAt' ? [item.source] : []));
    results.push({ id: item.id, source: item.source, field: item.field, input: item.input, legacyAccepted: legacy.accepted, runtimeAccepted: runtime.accepted, runtimeExitCode: runtime.exitCode, runtimeUnpublishableSuccessTimes: runtime.flagged, legacyManifestTimestampAccepted: manifestTimeAccepted, policy: intentionalRefusal ? 'strict_retained_timestamp' : null, canonicalSha256: legacy.accepted && runtime.accepted ? runtime.sha256 : null, result });
  }
  check('control canonical bytes match the published fixture serializer', results[0].canonicalSha256 === hash(`${JSON.stringify(fixture)}\n`));
  check('control source times satisfy the copied manifest validator', SOURCES.every(source => timestamp(fixture.sources[source].updatedAt)));
  for (const item of versions) check(`reference remained unchanged: ${item.path}`, hash(await readFile(join(sourceRoot, item.path))) === item.sha256);
  const unresolved = results.filter(r => !['match', 'intentional_refusal'].includes(r.result)).map(r => r.id);
  const report = { schemaVersion: 1, state: unresolved.length ? 'completed_with_unresolved_differences' : 'passed', scope: 'development_literal_comparison_partial_B4', compatibilityDecision: 'ADR-031', caseCount: results.length, checks, results, unresolvedCaseIds: unresolved, intentionalRefusalCaseIds: results.filter(r => r.result === 'intentional_refusal').map(r => r.id), node: process.version, runtimeBinarySha256: hash(await readFile(executable)), fixtureSha256: hash(await readFile(fixtureFile)), harnessSha256: hash(await readFile(fileURLToPath(import.meta.url))), referenceHead: head.stdout.trim(), referenceDirtyFiles: dirty.stdout.trim().split(/\r?\n/).filter(Boolean), referenceFiles: versions, limitations: ['Runtime migration-inspect against copied public ActivityData and manifest timestamp validators.', 'Synthetic inputs; no collector, receiver, publisher, transport, personal archive or credential access.', 'ADR-031 classifies twelve explicit nonpublishable timestamp refusals; Runtime behavior is unchanged and B4/real-seed acceptance remains separate.'] };
  if (options.has('--report')) await writeFile(options.get('--report'), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify(report, null, 2));
} finally {
  const resolved = resolve(base);
  assert(basename(resolved).startsWith('enouia-b4-') && !relative(resolve(tmpdir()), resolved).startsWith('..') && dirname(resolved) === resolve(tmpdir()), 'Unsafe cleanup path.');
  assert(!sourceRoot.startsWith(resolved + sep), 'Reference root overlaps cleanup.');
  await rm(resolved, { recursive: true, force: true });
}
