// Development-only B4 C15 history/time regression check. Never imported by Runtime or regular tests.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { copyFile, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const options = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i]; const value = process.argv[i + 1];
  assert(['--reference-root', '--binary', '--tools', '--curl', '--report'].includes(key) && value && !options.has(key), 'Invalid/duplicate option.');
  assert(isAbsolute(value), 'All supplied paths must be absolute.');
  options.set(key, value);
}
for (const key of ['--reference-root', '--binary', '--tools', '--curl']) assert(options.has(key), 'Reference root, release binary, fixture tools, and curl paths are required.');
const sourceRoot = await realpath(options.get('--reference-root'));
const binarySource = await realpath(options.get('--binary'));
const toolsSource = await realpath(options.get('--tools'));
const curl = await realpath(options.get('--curl'));
const fixtureFile = new URL('../tests/fixtures/activity/moriium-public-data.json', import.meta.url);
const toolSourceFile = new URL('../crates/enouia-activity-runner/examples/sandbox_tools.rs', import.meta.url);
const sourceFiles = ['scripts/status-receive.mjs', 'scripts/status-publish.mjs', 'scripts/lib/status-store.mjs', 'scripts/lib/status-batch.mjs', 'src/lib/activity.ts', 'src/lib/status.ts'];
const SOURCES = ['github', 'codex', 'claude'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const checks = [];
const cases = [];
function check(name, condition) { assert(condition, name); checks.push(name); }
async function run(executable, args, { cwd, env, input } = {}) {
  return new Promise((accept, reject) => {
    const child = spawn(executable, args, { cwd, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let bytes = 0; const output = []; const errors = [];
    let failure;
    const stop = message => { failure = new Error(message); child.kill(); };
    const timer = setTimeout(() => stop('Isolated process timed out.'), 30000);
    child.on('error', () => { clearTimeout(timer); reject(new Error('Isolated process unavailable.')); });
    for (const [stream, chunks] of [[child.stdout, output], [child.stderr, errors]]) {
      stream.on('data', chunk => { bytes += chunk.length; if (bytes > 128 * 1024) stop('Isolated process exceeded output bound.'); else chunks.push(chunk); });
    }
    child.stdin.on('error', () => {});
    child.on('close', code => {
      clearTimeout(timer);
      if (failure) reject(failure);
      else accept({ code, stdout: Buffer.concat(output).toString('utf8'), stderr: Buffer.concat(errors).toString('utf8') });
    });
    child.stdin.end(input);
  });
}
// The SSH stand-in only accepts a marked root whose name starts with this prefix.
const base = await mkdtemp(join(tmpdir(), 'enouia-handback-c15-'));
let server;
try {
  await writeFile(join(base, 'ACTIVITY_SANDBOX_FIXTURE'), 'enouia-activity-isolated-handback-v1');
  const snapshot = join(base, 'reference');
  const versions = [];
  const head = await run('git', ['-C', sourceRoot, 'rev-parse', 'HEAD'], { cwd: base, env: process.env });
  assert.equal(head.code, 0, 'Cannot record reference revision.');
  const dirty = await run('git', ['-C', sourceRoot, 'status', '--porcelain', '--', ...sourceFiles], { cwd: base, env: process.env });
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
  // Only these six public source files are copied, never checkout data/config/auth.
  const { publishStatus } = await import(pathToFileURL(join(snapshot, 'scripts/status-publish.mjs')));
  const publisherConfig = { version: 1, sites: { moriium: null, gallery: null }, runtimeEnabled: false };
  const publisherWorker = join(base, 'publish.mjs');
  await writeFile(publisherWorker, `import{publishStatus}from${JSON.stringify(pathToFileURL(join(snapshot, 'scripts/status-publish.mjs')).href)};await publishStatus({root:process.env.MORIIUM_STATUS_ROOT,config:${JSON.stringify(publisherConfig)}});\n`);
  const tools = join(base, 'tools'); const traces = join(base, 'traces');
  await mkdir(tools); await mkdir(traces);
  await copyFile(toolsSource, join(tools, 'ssh.exe'));
  const executable = join(base, 'installed', 'enouia-activity.exe');
  await mkdir(dirname(executable)); await copyFile(binarySource, executable);
  // Child-only allowlist: no personal CLI/profile/auth environment is inherited.
  const environment = {};
  for (const name of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'PATHEXT', 'COMSPEC']) if (process.env[name]) environment[name] = process.env[name];
  Object.assign(environment, { PATH: [tools, dirname(process.execPath), join(process.env.SystemRoot, 'System32')].join(delimiter), USERPROFILE: join(base, 'profile'), ENOU_TEST_ROOT: base, ENOU_TEST_NODE: process.execPath, ENOU_TEST_RECEIVER: join(snapshot, 'scripts/status-receive.mjs'), ENOU_TEST_PUBLISHER: publisherWorker, ENOU_TEST_TRANSPORT: 'none' });
  async function cli(command, config, env, extra = []) {
    const result = await run(executable, [command, ...extra, '--config', config], { cwd: base, env });
    assert.equal(result.stderr, '', 'Runtime emitted unredacted stderr.');
    assert(!result.stdout.includes(base), 'Runtime exported private paths.');
    return { code: result.code, value: JSON.parse(result.stdout) };
  }

  // Synthetic times stay inside the publisher's freshness window during the run.
  const now = Math.floor(Date.now() / 1000) * 1000;
  const iso = ms => new Date(ms).toISOString();
  const [t0, t1, t2, rollback] = [now - 30 * 60_000, now - 10 * 60_000, now - 5 * 60_000, now - 60 * 60_000].map(iso);
  const fixture = JSON.parse(await readFile(fixtureFile, 'utf8'));
  const history = structuredClone(fixture);
  history.sources.codex.days.unshift({ date: '2026-09-23', value: 1000 });
  history.sources.claude.days.unshift({ date: '2026-09-25', value: 1500000 });
  function dataAt(time) {
    const data = structuredClone(history);
    for (const id of SOURCES) data.sources[id].updatedAt = time;
    return data;
  }
  function batchOf(sequence, createdAt, data, attempts) {
    const sources = Object.fromEntries(SOURCES.map(id => [id, { attemptedAt: attempts[id].at, succeededAt: data.sources[id]?.updatedAt ?? null, result: attempts[id].result }]));
    return { version: 1, producer: 'morii-workstation', sequence, createdAt, sources, data };
  }
  const allSuccess = time => Object.fromEntries(SOURCES.map(id => [id, { at: time, result: 'success' }]));
  const encode = batch => Buffer.from(`${JSON.stringify(batch, null, 2)}\n`);
  const baselineBytes = encode(batchOf(51, t0, dataAt(t0), allSuccess(t0)));
  const recovery = batchOf(53, t2, dataAt(t2), allSuccess(t2));
  recovery.data.sources.github.days[0].value = 6; // A valid downward correction keeps every date.
  const recoveryBytes = encode(recovery);

  // Each candidate is a contract-valid batch that only the publisher's history guard rejects.
  const candidates = [];
  for (const id of SOURCES) {
    const failedAt = { ...allSuccess(t1), [id]: { at: t1, result: 'failed' } };
    const timeLoss = dataAt(t1); timeLoss.sources[id].updatedAt = iso(now - 90 * 60_000);
    candidates.push({ id: `C15-success-time-loss-${id}`, kind: 'success_time_regression', source: id, batch: batchOf(52, t1, timeLoss, failedAt) });
    const sourceLoss = dataAt(t1); sourceLoss.sources[id] = null;
    candidates.push({ id: `C15-source-loss-${id}`, kind: 'published_source_nulled', source: id, batch: batchOf(52, t1, sourceLoss, failedAt) });
    const dateLoss = dataAt(t1); dateLoss.sources[id].days.shift();
    candidates.push({ id: `C15-date-loss-${id}`, kind: 'historical_date_removed', source: id, batch: batchOf(52, t1, dateLoss, allSuccess(t1)) });
  }
  candidates.push({ id: 'C15-whole-batch-clock-rollback', kind: 'all_success_times_regressed', source: null, batch: batchOf(52, rollback, dataAt(rollback), allSuccess(rollback)) });

  const served = { root: null };
  const requests = [];
  server = createServer(async (request, response) => {
    try {
      requests.push(request.url);
      const match = /^\/status-data\/activity\/([a-f0-9]{64})\.json$/.exec(request.url);
      const path = request.url === '/status-data/current.json' ? join(served.root, 'public', 'current.json') : match ? join(served.root, 'public', 'activity', `${match[1]}.json`) : null;
      if (!path) { response.writeHead(404); response.end(); return; }
      const bytes = await readFile(path);
      response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(bytes);
    } catch { if (!response.headersSent) response.writeHead(404); response.end(); }
  });
  await new Promise((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const delivery = { sshExecutable: join(tools, 'ssh.exe'), restrictedAlias: 'sandbox-handback', curlExecutable: curl, publicOrigin: origin, observationSeconds: 0, retrySeconds: 3600 };
  const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
  const activityState = manifest => manifest.components.find(c => c.id === 'activity').state;

  // One Runtime root per prepared pending: import, resume, then one real retry through the stand-in.
  async function deliver(name, bytes, highWater, publisherRoot) {
    const root = join(base, `runtime-${name}`); const legacy = join(base, `runtime-${name}-legacy`); const config = join(base, `runtime-${name}.json`); const captures = join(base, `captures-${name}`);
    for (const path of [root, legacy, captures]) await mkdir(path);
    await writeFile(join(legacy, 'activity.json'), JSON.stringify(JSON.parse(bytes).data));
    await writeFile(join(legacy, 'sequence.json'), JSON.stringify({ sequence: highWater }));
    await writeFile(join(legacy, 'pending.json'), bytes);
    await writeFile(config, JSON.stringify({ version: 1, mode: 'sandbox', dataRoot: root, deliveryEnabled: true, delivery }));
    const env = { ...environment, ENOU_TEST_CAPTURES: captures, MORIIUM_STATUS_ROOT: publisherRoot, MORIIUM_STATUS_INBOX: join(publisherRoot, 'inbox') };
    assert.equal((await cli('migration-import', config, env, ['--bundle', legacy, '--high-water', String(highWater)])).code, 0, `Runtime refused synthetic pending ${name}.`);
    assert.equal((await cli('set-paused', config, env, ['false'])).code, 0, 'Synthetic resume failed.');
    served.root = publisherRoot;
    const result = await cli('retry-pending', config, env);
    const wire = async () => Promise.all((await readdir(captures)).map(file => readFile(join(captures, file))));
    const pendingHash = async () => (await cli('diagnostics', config, env)).value.pending?.exactPendingSha256 ?? null;
    return { result, wire, pendingHash, config, env };
  }

  for (const candidate of candidates) {
    const publisherRoot = join(base, `publisher-${candidate.id}`);
    await mkdir(join(publisherRoot, 'inbox'), { recursive: true });
    const baseline = await deliver(`${candidate.id}-baseline`, baselineBytes, 51, publisherRoot);
    const published = await readJson(join(publisherRoot, 'public', 'current.json'));
    const publicFile = join(publisherRoot, 'public', 'activity', `${published.activity.hash}.json`);
    const publicBytes = await readFile(publicFile);
    check(`${candidate.id}: Runtime delivers and acknowledges operational baseline`, baseline.result.code === 0 && baseline.result.value.transportCompleted && baseline.result.value.publicationObserved && await baseline.pendingHash() === null && activityState(published) === 'operational');

    const bytes = encode(candidate.batch);
    const attempt = await deliver(candidate.id, bytes, 52, publisherRoot);
    const wire = await attempt.wire();
    const inbox = await readJson(join(publisherRoot, 'inbox', 'pending.json'));
    check(`${candidate.id}: exact pending bytes reach the receiver once`, wire.length === 1 && wire[0].equals(bytes) && inbox.batch.sequence === 52);
    const refused = await readJson(join(publisherRoot, 'public', 'current.json'));
    check(`${candidate.id}: publisher keeps prior hash and immutable bytes`, refused.activity.hash === published.activity.hash && refused.activity.receivedAt === published.activity.receivedAt && (await readFile(publicFile)).equals(publicBytes));
    check(`${candidate.id}: public activity reports degraded`, activityState(refused) === 'degraded');
    check(`${candidate.id}: transport completion without publication retains exact pending`, attempt.result.code === 4 && attempt.result.value.transportCompleted && !attempt.result.value.publicationObserved && await attempt.pendingHash() === hash(bytes));
    const waiting = await cli('sync', attempt.config, attempt.env);
    check(`${candidate.id}: persisted wait prevents resend and collection`, waiting.code === 3 && waiting.value.state === 'not_due' && !waiting.value.collectionAttempted && (await attempt.wire()).length === 1 && await attempt.pendingHash() === hash(bytes));
    const again = await publishStatus({ root: publisherRoot, config: publisherConfig });
    check(`${candidate.id}: degraded persists while candidate occupies inbox`, activityState(again) === 'degraded' && again.activity.hash === published.activity.hash);

    // Modeled operator reconciliation: a later valid batch from a separate Runtime root.
    const recovered = await deliver(`${candidate.id}-recovery`, recoveryBytes, 53, publisherRoot);
    const current = await readJson(join(publisherRoot, 'public', 'current.json'));
    check(`${candidate.id}: higher valid sequence publishes operational version`, activityState(current) === 'operational' && current.activity.hash !== published.activity.hash);
    check(`${candidate.id}: actual curl observation acknowledges recovery`, recovered.result.code === 0 && recovered.result.value.publicationObserved && await recovered.pendingHash() === null);
    cases.push({ id: candidate.id, kind: candidate.kind, source: candidate.source, pendingSha256: hash(bytes), publicState: activityState(refused), runtimeExitCode: attempt.result.code, runtimeState: attempt.result.value.state, transportCompleted: attempt.result.value.transportCompleted, publicationObserved: attempt.result.value.publicationObserved, waitExitCode: waiting.code, waitState: waiting.value.state, recoveredState: activityState(current) });
  }
  check('all HTTP observations stayed on isolated status paths', requests.length > 0 && requests.every(path => path.startsWith('/status-data/')));
  for (const item of versions) check(`reference remained unchanged: ${item.path}`, hash(await readFile(join(sourceRoot, item.path))) === item.sha256);
  const report = { schemaVersion: 1, state: 'passed', scope: 'development_reference_regression_partial_B4', checks, cases, node: process.version, runtimeBinarySha256: hash(await readFile(executable)), fixtureToolsSha256: hash(await readFile(toolsSource)), fixtureToolSourceSha256: hash(await readFile(toolSourceFile)), fixtureSha256: hash(await readFile(fixtureFile)), harnessSha256: hash(await readFile(fileURLToPath(import.meta.url))), baselinePendingSha256: hash(baselineBytes), recoveryPendingSha256: hash(recoveryBytes), referenceHead: head.stdout.trim(), referenceDirtyFiles: dirty.stdout.trim().split(/\r?\n/).filter(Boolean), referenceFiles: versions, limitations: ['Prepared synthetic pending candidates; the Runtime merge never produces these regressions itself.', 'SSH is a marked development stand-in that pipes exact bytes to the copied receiver; no network transport or authentication.', 'Recovery is a modeled reconciliation from a separate Runtime root, not an operator procedure.', 'No deployed cache, production endpoint, task, personal archive, or credential access.', 'Reference modules and receiver CLI are copied development inputs, not Runtime dependencies.'] };
  if (options.has('--report')) await writeFile(options.get('--report'), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (server) { server.closeAllConnections(); await new Promise(accept => server.close(accept)); }
  const resolved = resolve(base);
  assert(basename(resolved).startsWith('enouia-handback-c15-') && !relative(resolve(tmpdir()), resolved).startsWith('..') && dirname(resolved) === resolve(tmpdir()), 'Unsafe cleanup path.');
  assert(!sourceRoot.startsWith(resolved + sep), 'Reference root overlaps cleanup.');
  await rm(resolved, { recursive: true, force: true });
}
