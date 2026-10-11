// Development-only ADR-033 drill over copied public Moriium receiver/publisher
// files. Never imported by Runtime or regular tests. One Runtime root follows
// the operator procedure end to end: a pending batch stays unpublished, the
// store is paused, the batch is abandoned at its sequence (optionally
// reserving through a remote high-water), and the next sync is observed or,
// when the archive itself regresses, still refused.
//
//   node scripts/claude-activity-pending-abandon.mjs --reference-root DIR --binary EXE --tools EXE --curl EXE --report NEW
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
for (const key of ['--reference-root', '--binary', '--tools', '--curl', '--report']) assert(options.has(key), `${key} is required.`);
const sourceRoot = await realpath(options.get('--reference-root'));
const binarySource = await realpath(options.get('--binary'));
const toolsSource = await realpath(options.get('--tools'));
const curl = await realpath(options.get('--curl'));
const fixtureFile = new URL('../tests/fixtures/activity/moriium-public-data.json', import.meta.url);
const sourceFiles = ['scripts/status-receive.mjs', 'scripts/status-publish.mjs', 'scripts/lib/status-store.mjs', 'scripts/lib/status-batch.mjs', 'src/lib/activity.ts', 'src/lib/status.ts'];
const SOURCES = ['github', 'codex', 'claude'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const lf = text => text.replaceAll('\r\n', '\n');
const checks = [];
function check(name, condition, detail = '') { assert(condition, `${name} ${detail}`); checks.push(name); }
async function run(executable, args, { cwd, env, input } = {}) {
  return new Promise((accept, reject) => {
    const child = spawn(executable, args, { cwd, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let bytes = 0; const output = []; const errors = []; let failure;
    const stop = message => { failure = new Error(message); child.kill(); };
    const timer = setTimeout(() => stop('Isolated process timed out.'), 30000);
    child.on('error', () => { clearTimeout(timer); reject(new Error('Isolated process unavailable.')); });
    for (const [stream, chunks] of [[child.stdout, output], [child.stderr, errors]]) {
      stream.on('data', chunk => { bytes += chunk.length; if (bytes > 256 * 1024) stop('Isolated process exceeded output bound.'); else chunks.push(chunk); });
    }
    child.stdin.on('error', () => {});
    child.on('close', code => { clearTimeout(timer); if (failure) reject(failure); else accept({ code, stdout: Buffer.concat(output).toString('utf8'), stderr: Buffer.concat(errors).toString('utf8') }); });
    child.stdin.end(input);
  });
}

// The SSH stand-in only accepts a marked root whose name starts with this prefix.
const base = await mkdtemp(join(tmpdir(), 'enouia-handback-abandon-'));
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
  const publisherConfig = { version: 1, sites: { moriium: null, gallery: null }, runtimeEnabled: false };
  const publisherWorker = join(base, 'publish.mjs');
  await writeFile(publisherWorker, `import{publishStatus}from${JSON.stringify(pathToFileURL(join(snapshot, 'scripts/status-publish.mjs')).href)};await publishStatus({root:process.env.MORIIUM_STATUS_ROOT,config:${JSON.stringify(publisherConfig)}});\n`);
  const tools = join(base, 'tools');
  await mkdir(tools); await mkdir(join(base, 'traces'));
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
    assert(!result.stdout.includes(base) && !result.stdout.includes(base.replaceAll('\\', '\\\\')), 'Runtime exported private paths.');
    return { code: result.code, value: JSON.parse(result.stdout), text: result.stdout };
  }

  // Synthetic times stay inside the publisher's freshness window during the run.
  const now = Math.floor(Date.now() / 1000) * 1000;
  const iso = ms => new Date(ms).toISOString();
  const [t0, t1] = [now - 30 * 60_000, now - 10 * 60_000].map(iso);
  const fixture = JSON.parse(await readFile(fixtureFile, 'utf8'));
  const history = structuredClone(fixture);
  history.sources.codex.days.unshift({ date: '2026-09-23', value: 1000 });
  history.sources.claude.days.unshift({ date: '2026-09-25', value: 1500000 });
  const dataAt = time => { const data = structuredClone(history); for (const id of SOURCES) data.sources[id].updatedAt = time; return data; };
  const allSuccess = time => Object.fromEntries(SOURCES.map(id => [id, { at: time, result: 'success' }]));
  const batchOf = (sequence, createdAt, data, attempts) => ({ version: 1, producer: 'morii-workstation', sequence, createdAt,
    sources: Object.fromEntries(SOURCES.map(id => [id, { attemptedAt: attempts[id].at, succeededAt: data.sources[id]?.updatedAt ?? null, result: attempts[id].result }])), data });
  const encode = batch => Buffer.from(`${JSON.stringify(batch, null, 2)}\n`);

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

  // Import one prepared pending into a fresh Runtime root, resume and send it once.
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
    const wire = async () => Promise.all((await readdir(captures)).sort().map(file => readFile(join(captures, file))));
    return { root, result, wire, config, env, run: (command, extra) => cli(command, config, env, extra) };
  }
  const cases = [];

  // A — the receiver already holds a higher sequence (C14).
  {
    const id = 'remote-ahead';
    const publisherRoot = join(base, `publisher-${id}`);
    await mkdir(join(publisherRoot, 'inbox'), { recursive: true });
    const foreign = await deliver(`${id}-foreign`, encode(batchOf(60, t0, dataAt(t0), allSuccess(t0))), 60, publisherRoot);
    const remote = await readJson(join(publisherRoot, 'public', 'current.json'));
    check(`${id}: another producer publishes sequence 60`, foreign.result.value.publicationObserved === true && activityState(remote) === 'operational');
    const stuckBytes = encode(batchOf(52, t1, dataAt(t1), allSuccess(t1)));
    const local = await deliver(id, stuckBytes, 52, publisherRoot);
    const afterStuck = await readJson(join(publisherRoot, 'public', 'current.json'));
    check(`${id}: pending 52 is transported once but never published`, local.result.code === 4 && local.result.value.transportCompleted && !local.result.value.publicationObserved && (await local.wire()).length === 1 && (await local.wire())[0].equals(stuckBytes), local.text);
    check(`${id}: the receiver keeps sequence 60 and its public hash`, (await readJson(join(publisherRoot, 'inbox', 'pending.json'))).batch.sequence === 60 && afterStuck.activity.hash === remote.activity.hash);
    const waiting = await local.run('sync');
    check(`${id}: the stuck batch blocks collection`, waiting.code === 3 && waiting.value.state === 'not_due' && !waiting.value.collectionAttempted);
    const stuckHash = hash(stuckBytes);
    const abandonArgs = ['--sequence', '52', '--pending-sha256', stuckHash, '--confirm-refused', 'true', '--reserve-through', '60'];
    const unpaused = await local.run('pending-abandon', abandonArgs);
    check(`${id}: abandonment is refused while the store runs`, unpaused.code === 6 && unpaused.value.state === 'not_paused');
    check(`${id}: pause before reconciliation`, (await local.run('set-paused', ['true'])).code === 0);
    const wrong = await local.run('pending-abandon', ['--sequence', '52', '--pending-sha256', '0'.repeat(64), '--confirm-refused', 'true', '--reserve-through', '60']);
    check(`${id}: abandonment of other bytes is refused`, wrong.code === 6 && wrong.value.state === 'pending_mismatch');
    const abandoned = await local.run('pending-abandon', abandonArgs);
    check(`${id}: confirmed abandonment reserves through the remote high-water`, abandoned.code === 0 && abandoned.value.state === 'pending_abandoned' && abandoned.value.highestReserved === 60 && abandoned.value.nextSequence === 61, abandoned.text);
    const record = await readJson(join(local.root, 'reconciliations', 'abandon-52.json'));
    const copy = await readFile(join(local.root, 'reconciliations', 'abandon-52-pending.json'));
    check(`${id}: the record and exact pending copy are kept`, JSON.stringify(record) === JSON.stringify(abandoned.value.record) && hash(copy) === stuckHash && copy.equals(stuckBytes));
    check(`${id}: resume after reconciliation`, (await local.run('set-paused', ['false'])).code === 0);
    const idle = await local.run('overview');
    check(`${id}: overview reports idle rather than an old observation`, idle.code === 0 && idle.value.delivery.state === 'idle' && idle.value.delivery.pendingSequence === null && idle.value.producer.highestReserved === 60, idle.text);
    const next = await local.run('sync');
    const published = await readJson(join(publisherRoot, 'public', 'current.json'));
    const wire = await local.wire();
    const sent = JSON.parse(wire.at(-1));
    check(`${id}: the next sync sends sequence 61`, next.value.sequence === 61 && next.value.transportCompleted && wire.length === 2 && sent.sequence === 61, next.text);
    check(`${id}: sequence 61 is published and observed`, [0, 2].includes(next.code) && next.value.publicationObserved === true && published.activity.hash === hash(Buffer.from(`${JSON.stringify(sent.data)}\n`)) && published.activity.hash !== remote.activity.hash, next.text);
    const diagnostics = await local.run('diagnostics');
    check(`${id}: diagnostics show no pending and the abandonment`, diagnostics.value.pending === null && diagnostics.value.pendingAbandoned?.sequence === 52 && diagnostics.value.pendingAbandoned?.reservedThrough === 60);
    cases.push({ id, stuckPendingSha256: stuckHash, abandoned: abandoned.value, next: next.value, publicState: activityState(published) });
  }

  // B — the publisher refuses the archive itself (C15); abandonment cannot repair it.
  {
    const id = 'archive-regression';
    const publisherRoot = join(base, `publisher-${id}`);
    await mkdir(join(publisherRoot, 'inbox'), { recursive: true });
    const baseline = await deliver(`${id}-baseline`, encode(batchOf(51, t0, dataAt(t0), allSuccess(t0))), 51, publisherRoot);
    const published = await readJson(join(publisherRoot, 'public', 'current.json'));
    check(`${id}: baseline 51 is published`, baseline.result.value.publicationObserved === true && activityState(published) === 'operational');
    const loss = dataAt(t1); loss.sources.github.days.shift();
    const lossBytes = encode(batchOf(52, t1, loss, allSuccess(t1)));
    const local = await deliver(id, lossBytes, 52, publisherRoot);
    const refused = await readJson(join(publisherRoot, 'public', 'current.json'));
    check(`${id}: the publisher refuses the date-loss batch`, local.result.code === 4 && !local.result.value.publicationObserved && activityState(refused) === 'degraded' && refused.activity.hash === published.activity.hash);
    check(`${id}: pause before reconciliation`, (await local.run('set-paused', ['true'])).code === 0);
    const abandoned = await local.run('pending-abandon', ['--sequence', '52', '--pending-sha256', hash(lossBytes), '--confirm-refused', 'true']);
    check(`${id}: abandonment keeps sequence 52 consumed`, abandoned.code === 0 && abandoned.value.highestReserved === 52 && abandoned.value.nextSequence === 53, abandoned.text);
    check(`${id}: resume after reconciliation`, (await local.run('set-paused', ['false'])).code === 0);
    const next = await local.run('sync');
    const after = await readJson(join(publisherRoot, 'public', 'current.json'));
    check(`${id}: the next batch uses 53 and is still refused`, next.code === 4 && next.value.sequence === 53 && next.value.transportCompleted && !next.value.publicationObserved && activityState(after) === 'degraded' && after.activity.hash === published.activity.hash, next.text);
    cases.push({ id, abandoned: abandoned.value, next: next.value, publicState: activityState(after) });
  }

  check('all HTTP observations stayed on isolated status paths', requests.length > 0 && requests.every(path => path.startsWith('/status-data/')));
  for (const item of versions) check(`reference remained unchanged: ${item.path}`, hash(await readFile(join(sourceRoot, item.path))) === item.sha256);
  const report = { schemaVersion: 1, state: 'passed', scope: 'development_reference_pending_abandonment', checks, cases, node: process.version,
    runtimeBinarySha256: hash(await readFile(executable)), fixtureToolsSha256: hash(await readFile(toolsSource)), fixtureSha256: hash(lf(await readFile(fixtureFile, 'utf8'))),
    harnessSha256: hash(lf(await readFile(fileURLToPath(import.meta.url), 'utf8'))), referenceHead: head.stdout.trim(), referenceDirtyFiles: dirty.stdout.trim().split(/\r?\n/).filter(Boolean), referenceFiles: versions,
    limitations: ['Prepared synthetic pending batches and a foreign higher sequence; no real producer history.', 'SSH is a marked development stand-in that pipes exact bytes to the copied receiver.', 'The operator confirmation is supplied by this harness; real use needs server evidence through Moriium operations.', 'No deployed cache, production endpoint, task, personal archive or credential access.'] };
  await writeFile(options.get('--report'), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({ state: report.state, checks: checks.length, cases: cases.map(c => c.id) }));
} finally {
  if (server) { server.closeAllConnections(); await new Promise(accept => server.close(accept)); }
  const resolved = resolve(base);
  assert(basename(resolved).startsWith('enouia-handback-abandon-') && !relative(resolve(tmpdir()), resolved).startsWith('..') && dirname(resolved) === resolve(tmpdir()), 'Unsafe cleanup path.');
  assert(!sourceRoot.startsWith(resolved + sep), 'Reference root overlaps cleanup.');
  await rm(resolved, { recursive: true, force: true });
}
