// Optional B4 developer harness; actual Rust parsers/merge vs copied legacy functions.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const [referenceArgument, bridgeArgument, reportArgument, ...extra] = process.argv.slice(2);
assert(!extra.length && [referenceArgument, bridgeArgument, reportArgument].every(value => value && isAbsolute(value)), 'Supply absolute reference root, fixture bridge executable, and new report paths.');
const referenceRoot = await realpath(referenceArgument);
const bridgeSource = await realpath(bridgeArgument);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
async function run(executable, args, cwd, input) {
  return new Promise((accept, reject) => {
    const child = spawn(executable, args, { cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const stdout = []; const stderr = []; let size = 0; let fault;
    const stop = () => { fault = new Error('Fixture subprocess timed out or exceeded its bound.'); child.kill(); };
    const timer = setTimeout(stop, 15000);
    for (const [stream, parts] of [[child.stdout, stdout], [child.stderr, stderr]]) stream.on('data', part => { size += part.length; if (size > 1024 * 1024) stop(); else parts.push(part); });
    child.on('error', () => { clearTimeout(timer); reject(new Error('Fixture subprocess unavailable.')); });
    child.stdin.on('error', () => {});
    child.on('close', code => { clearTimeout(timer); if (fault) reject(fault); else accept({ code, stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8') }); });
    child.stdin.end(input);
  });
}
const base = await mkdtemp(join(tmpdir(), 'enouia-compare-'));
try {
  const files = ['scripts/lib/activity-import.ts', 'scripts/lib/codex-usage.ts', 'scripts/collect-activity.mjs', 'scripts/status-receive.mjs', 'scripts/status-publish.mjs', 'scripts/lib/status-batch.mjs', 'scripts/lib/status-store.mjs', 'src/lib/activity.ts', 'src/lib/status.ts'];
  const snapshot = join(base, 'reference'); const versions = [];
  const head = await run('git', ['-C', referenceRoot, 'rev-parse', 'HEAD'], base);
  const dirty = await run('git', ['-C', referenceRoot, 'status', '--porcelain', '--', ...files], base);
  assert(head.code === 0 && dirty.code === 0, 'Reference provenance unavailable.');
  for (const path of files) {
    const source = join(referenceRoot, path);
    assert(!(await lstat(source)).isSymbolicLink() && (await realpath(source)).startsWith(referenceRoot + sep), 'Reference path escaped its checkout.');
    const bytes = await readFile(source); const destination = join(snapshot, path);
    await mkdir(dirname(destination), { recursive: true }); await writeFile(destination, bytes, { flag: 'wx' });
    versions.push({ path, sha256: sha(bytes) });
  }
  const load = path => import(pathToFileURL(join(snapshot, path)));
  const { importGitHub, importUsage, mergeActivityDays } = await load('scripts/lib/activity-import.ts');
  const { importCodexUsage } = await load('scripts/lib/codex-usage.ts');
  const { validateActivity, dateInShanghai, shiftDate } = await load('src/lib/activity.ts');
  const { validateBatch } = await load('scripts/lib/status-batch.mjs');
  const { receiveBatch } = await load('scripts/status-receive.mjs');
  const { publishStatus } = await load('scripts/status-publish.mjs');
  const bridge = join(base, 'frozen_activity.exe'); await copyFile(bridgeSource, bridge);
  const fixtureFiles = [];
  const fixture = async name => { const bytes = await readFile(new URL(`../tests/fixtures/activity/${name}`, import.meta.url)); fixtureFiles.push({ path: `tests/fixtures/activity/${name}`, sha256: sha(bytes) }); return JSON.parse(bytes.toString('utf8')); };
  const reports = { github: await fixture('github-calendar-v1.json'), codex: await fixture('codex-usage-v1.json'), claude: await fixture('claude-stores-v1.json') };
  const baseline = (await fixture('legacy-source-snapshots-v1.json')).baseline;
  const ids = ['github', 'codex', 'claude'];
  const cases = [];
  const blank = { version: 1, sources: Object.fromEntries(ids.map(id => [id, null])) };
  const prior = structuredClone(baseline);
  for (const source of Object.values(prior.sources)) { source.updatedAt = '2026-09-25T08:00:00.000Z'; source.days = [{ date: '2026-09-24', value: 3 }]; }
  function add(id, mutate = () => {}, allowed = [], policy = null) {
    const input = { previous: structuredClone(prior), attemptedAt: '2026-09-26T08:00:00.000Z', clockMs: Date.parse('2026-09-26T08:00:01.000Z'), sequence: cases.length + 100, ...structuredClone(reports), failures: [] };
    mutate(input); cases.push({ id, input, allowed, policy });
  }
  const ghDays = input => input.github.data.user.contributionsCollection.contributionCalendar.weeks[0].contributionDays;
  add('C01-three-success', input => { input.previous = structuredClone(blank); });
  add('C02-rolling-retains-history');
  add('C03-github-down-codex-up-claude-up', input => { for (const [id, value] of [['github', 8], ['codex', 5], ['claude', 20]]) input.previous.sources[id].days = [{ date: '2026-09-25', value }]; });
  add('C03-claude-down', input => { input.previous.sources.claude.days = [{ date: '2026-09-25', value: 50 }]; });
  for (const id of ids) add(`C04-${id}-failure`, input => { input.failures = [id]; });
  add('C04-all-fail', input => { input.failures = [...ids]; });
  add('C04-null-history-all-fail', input => { input.previous = structuredClone(blank); input.failures = [...ids]; });
  add('C05-unchanged-zero-fresh', input => { input.previous = structuredClone(baseline); input.attemptedAt = '2026-09-27T08:00:00.000Z'; input.clockMs = Date.parse(input.attemptedAt) + 1000; });
  add('C05-all-empty', input => { input.github.data.user.contributionsCollection.contributionCalendar.weeks = []; input.codex.dailyUsageBuckets = []; input.codex.summary.lifetimeTokens = 0; input.claude = [{ daily: [], totals: { totalTokens: 0 } }]; });
  add('C06-impossible-github-date', input => { ghDays(input)[0].date = '2026-02-30'; });
  add('C06-duplicate-github-date', input => { ghDays(input).push({ ...ghDays(input)[0], contributionCount: 9 }); }, ['github'], 'strict_github_source_validation');
  add('C06-duplicate-codex-date', input => { input.codex.dailyUsageBuckets.push(structuredClone(input.codex.dailyUsageBuckets[0])); });
  add('C06-duplicate-claude-date', input => { input.claude[0].daily.push(structuredClone(input.claude[0].daily[0])); input.claude[0].totals.totalTokens += 26; });
  add('C06-leap-date', input => { input.attemptedAt = '2028-03-01T08:00:00.000Z'; input.clockMs = Date.parse(input.attemptedAt) + 1000; ghDays(input)[0].date = '2028-02-29'; });
  add('C06-negative-github', input => { ghDays(input)[0].contributionCount = -1; });
  add('C06-unsafe-github-value', input => { ghDays(input)[0].contributionCount = Number.MAX_SAFE_INTEGER + 1; });
  add('C06-unsafe-github-sum', input => { ghDays(input)[0].contributionCount = Number.MAX_SAFE_INTEGER - 1; ghDays(input)[1].contributionCount = 2; }, ['github'], 'strict_github_source_validation');
  add('C07-unsupported-method', input => { input.failures = ['codex']; });
  add('C07-missing-lifetime', input => { delete input.codex.summary.lifetimeTokens; }, ['codex'], 'strict_codex_lifetime');
  add('C07-mismatched-lifetime', input => { input.codex.summary.lifetimeTokens++; });
  add('C08-report-total-mismatch', input => { input.claude[0].totals.totalTokens++; }, ['claude'], 'strict_claude_report_total');
  add('C08-cache-reasoning-disjoint-stores');
  add('C09-clock-rollback', input => { input.previous.sources.github.updatedAt = '2026-09-27T08:00:00.000Z'; }, ids, 'clock_regression_preservation');
  add('C09-end-date-rollback', input => { input.previous.sources.github.days.push({ date: '2026-09-27', value: 4 }); }, ids, 'clock_regression_preservation');
  add('C09-ai-admission-floor', input => { input.codex.dailyUsageBuckets.push({ startDate: '2025-12-31', tokens: 3 }); input.codex.summary.lifetimeTokens += 3; input.claude[0].daily.push({ date: '2025-12-31', inputTokens: 3, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, totalTokens: 3 }); input.claude[0].totals.totalTokens += 3; }, ['codex', 'claude'], 'ai_new_day_admission_floor');
  add('C09-known-before-floor-retained', input => { for (const id of ['codex', 'claude']) input.previous.sources[id].days.push({ date: '2025-12-31', value: 7 }); });
  add('C09-future-input-ignored', input => { ghDays(input).push({ date: '2026-09-27', contributionCount: 2 }); });
  add('C10-private-sentinels', input => { input.previous.private = 'DO_NOT_EXPORT'; for (const source of Object.values(input.previous.sources)) { source.private = 'DO_NOT_EXPORT'; for (const day of source.days) day.path = 'DO_NOT_EXPORT'; } });
  const bridgeChecks = [];
  for (const [id, input, expected] of [
    ['malformed-json', '{"DO_NOT_EXPORT":', 'invalid_input'],
    ['oversized-input', 'x'.repeat(4 * 1024 * 1024 + 1), 'input_too_large'],
    ['unknown-input-field', JSON.stringify({ ...cases[0].input, DO_NOT_EXPORT: true }), 'invalid_input'],
    ['invalid-prior-metric', JSON.stringify({ ...cases[1].input, previous: { version: 1, sources: { ...prior.sources, github: { ...prior.sources.github, metric: 'wrong' } } } }), 'invalid_previous'],
  ]) {
    const rejected = await run(bridge, [], base, input);
    assert.equal(rejected.code, 5); assert.equal(rejected.stderr, '');
    assert.equal(JSON.parse(rejected.stdout).state, expected);
    assert(!rejected.stdout.includes('DO_NOT_EXPORT'));
    bridgeChecks.push(id);
  }

  function legacy(input) {
    const data = validateActivity(input.previous); const sources = {};
    const end = dateInShanghai(new Date(input.attemptedAt));
    const start = shiftDate(end, -364); const floor = '2026-01-01' < start ? '2026-01-01' : start;
    // Reproduces only collect-activity's inspected pure orchestration; no CLI/auth invocation.
    for (const id of ids) {
      try {
        if (input.failures.includes(id)) throw new Error('Synthetic failure.');
        let snapshot;
        if (id === 'github') snapshot = importGitHub(input.github, input.attemptedAt);
        else if (id === 'codex') snapshot = importCodexUsage(input.codex, input.attemptedAt);
        else {
          const days = new Map();
          for (const report of input.claude) for (const day of importUsage(report, 'claude', input.attemptedAt).days) days.set(day.date, (days.get(day.date) ?? 0) + day.value);
          snapshot = { updatedAt: input.attemptedAt, timezone: 'Asia/Shanghai', metric: 'tokens', days: [...days].map(([date, value]) => ({ date, value })) };
        }
        snapshot.days = snapshot.days.filter(day => day.date >= floor && day.date <= end);
        if (!snapshot.days.length) throw new Error('Empty report.');
        snapshot.days = mergeActivityDays(data.sources[id]?.days ?? [], snapshot.days, end, id === 'claude');
        data.sources[id] = validateActivity({ version: 1, sources: { ...data.sources, [id]: snapshot } }).sources[id];
        sources[id] = { attemptedAt: input.attemptedAt, result: 'success' };
      } catch { sources[id] = { attemptedAt: input.attemptedAt, result: 'failed' }; }
    }
    return { data, sources };
  }
  function sourceDiff(oldBatch, newBatch, id) {
    const old = oldBatch.data.sources[id]; const next = newBatch.data.sources[id];
    const priorDays = new Map((old?.days ?? []).map(day => [day.date, day.value]));
    const nextDays = new Map((next?.days ?? []).map(day => [day.date, day.value]));
    const dates = [...new Set([...priorDays.keys(), ...nextDays.keys()])].sort();
    const total = snapshot => (snapshot?.days ?? []).reduce((sum, day) => sum + BigInt(day.value), 0n).toString();
    return { id, missingDates: dates.filter(date => priorDays.has(date) && !nextDays.has(date)), addedDates: dates.filter(date => !priorDays.has(date) && nextDays.has(date)), revisedValues: dates.filter(date => priorDays.has(date) && nextDays.has(date) && priorDays.get(date) !== nextDays.get(date)).map(date => ({ date, legacy: priorDays.get(date), runtime: nextDays.get(date) })), retainedDates: dates.filter(date => priorDays.get(date) === nextDays.get(date)), legacyDays: old?.days ?? [], runtimeDays: next?.days ?? [], legacyTotal: total(old), runtimeTotal: total(next), legacyUpdatedAt: old?.updatedAt ?? null, runtimeUpdatedAt: next?.updatedAt ?? null, legacyOutcome: oldBatch.sources[id], runtimeOutcome: newBatch.sources[id], legacyTimezone: old?.timezone ?? null, runtimeTimezone: next?.timezone ?? null, legacyMetric: old?.metric ?? null, runtimeMetric: next?.metric ?? null };
  }
  const results = []; const unresolved = []; const checks = [];
  const publishConfig = { version: 1, sites: { moriium: null, gallery: null }, runtimeEnabled: false };
  for (const fixtureCase of cases) {
    const { id, input, allowed, policy } = fixtureCase;
    const raw = JSON.stringify(input);
    const result = await run(bridge, [], base, raw);
    assert.equal(result.stderr, '', 'Fixture bridge emitted raw stderr.');
    assert(!result.stdout.includes('DO_NOT_EXPORT') && !result.stdout.includes(base), 'Fixture bridge leaked private inputs.');
    const runtime = JSON.parse(result.stdout);
    const old = legacy(input);
    let oldBatch;
    try { oldBatch = validateBatch({ version: 1, producer: 'morii-workstation', sequence: input.sequence, createdAt: input.attemptedAt, ...old }, input.clockMs); } catch { /* Record invalid legacy envelope separately. */ }
    if (runtime.state === 'clock_regression') {
      assert.equal(policy, 'clock_regression_preservation', 'Unexpected Runtime clock refusal.');
      results.push({ id, inputSha256: sha(raw), result: 'intentional_clock_refusal', policy, runtimeState: runtime.state, legacyBatchValid: Boolean(oldBatch), legacyDates: Object.fromEntries(ids.map(id => [id, old.data.sources[id]?.days.map(day => day.date) ?? []])) });
      continue;
    }
    assert(result.code === 0 && runtime.state === 'merged' && oldBatch, 'Unanticipated fixture bridge/legacy envelope failure.');
    const differences = ids.filter(id => !isDeepStrictEqual(oldBatch.data.sources[id], runtime.batch.data.sources[id]) || !isDeepStrictEqual(oldBatch.sources[id], runtime.batch.sources[id]));
    const classification = differences.length === 0 ? 'equal' : policy && differences.every(id => allowed.includes(id)) ? 'intentional_difference' : 'unresolved_difference';
    if (classification === 'unresolved_difference') unresolved.push(id);
    if (policy === 'strict_github_source_validation') {
      assert(['C06-duplicate-github-date', 'C06-unsafe-github-sum'].includes(id), 'Unknown strict-validation case.');
      assert.deepEqual(differences, ['github'], 'Strict GitHub refusal must not change other sources.');
      checks.push(`${id}: only GitHub differs`);
      assert.equal(oldBatch.sources.github.result, 'success');
      assert.equal(runtime.batch.sources.github.result, 'failed');
      checks.push(`${id}: invalid legacy success becomes Runtime source failure`);
      assert.deepEqual(runtime.batch.data.sources.github, input.previous.sources.github);
      assert.equal(runtime.batch.sources.github.succeededAt, input.previous.sources.github.updatedAt);
      checks.push(`${id}: prior days values and success time retained exactly`);
    }
    if (id === 'C03-claude-down') { assert.equal(runtime.batch.data.sources.claude.days[0].value, 50); assert.equal(oldBatch.data.sources.claude.days[0].value, 50); assert.equal(runtime.deltas.claude.retainedHigherDays, 1); }
    const oldRoot = join(base, id, 'legacy'); const newRoot = join(base, id, 'runtime');
    await receiveBatch(join(oldRoot, 'inbox'), oldBatch, input.clockMs);
    await receiveBatch(join(newRoot, 'inbox'), runtime.batch, input.clockMs);
    const oldManifest = await publishStatus({ root: oldRoot, config: publishConfig, now: input.clockMs });
    const newManifest = await publishStatus({ root: newRoot, config: publishConfig, now: input.clockMs });
    const bytes = await readFile(join(newRoot, 'public', 'activity', `${newManifest.activity.hash}.json`));
    assert.equal(sha(bytes), runtime.canonicalDataSha256);
    assert.deepEqual(newManifest.activity.sources, runtime.batch.sources);
    if (classification === 'equal') { assert.deepEqual(oldBatch, runtime.batch); assert.equal(oldManifest.activity.hash, newManifest.activity.hash); }
    results.push({ id, inputSha256: sha(raw), result: classification, policy, differences, legacyDataSha256: oldManifest.activity.hash, runtimeDataSha256: newManifest.activity.hash, sources: ids.map(id => sourceDiff(oldBatch, runtime.batch, id)), runtimeDeltas: runtime.deltas });
  }
  for (const version of versions) assert.equal(sha(await readFile(join(referenceRoot, version.path))), version.sha256, 'Reference changed during comparison.');
  const report = { schemaVersion: 1, state: unresolved.length ? 'completed_with_unresolved_differences' : 'passed', node: process.version, bridgeSha256: sha(await readFile(bridge)), bridgeChecks, checks, compatibilityDecision: 'ADR-031', referenceHead: head.stdout.trim(), referenceDirtyFiles: dirty.stdout.trim().split(/\r?\n/).filter(Boolean), referenceFiles: versions, fixtureFiles, caseCount: results.length, unresolvedCaseIds: unresolved, results, limitations: ['Synthetic fixed-time reports and pure legacy orchestration reproduction.', 'No live collection, discovery, SSH, production, credentials, or UI acceptance.', 'ADR-031 classifies existing normative validation; this harness changes no Runtime parser or migration behavior and does not sign off B4.'] };
  await writeFile(reportArgument, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({ state: report.state, caseCount: results.length, unresolvedCaseIds: unresolved, classifications: Object.fromEntries(['equal', 'intentional_difference', 'intentional_clock_refusal', 'unresolved_difference'].map(kind => [kind, results.filter(item => item.result === kind).length])) }));
} finally {
  const full = resolve(base);
  assert(dirname(full) === resolve(tmpdir()) && basename(full).startsWith('enouia-compare-'), 'Unsafe fixture cleanup path.');
  await rm(full, { recursive: true, force: true });
}
