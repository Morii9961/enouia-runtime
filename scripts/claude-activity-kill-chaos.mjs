// Development-only random process-kill drill over copied public Moriium
// receiver/publisher files. Never imported by Runtime or regular tests.
// As in production, the SSH session runs only the receiver; the publisher
// runs on its own server timer. Looping copies of the real runner sync are
// terminated at random moments while lock-free readers run. A server
// operator removes a receiver lock only when its recorded process is gone,
// following Moriium's documented procedure. Whenever a later sync reports storage_failed,
// an operator loop inspects recovery, checks the captured wire bytes to prove
// that each blocking batch was never sent, and retracts it. The harness then
// checks the store, the wire and the publisher for invariants.
//
//   node scripts/claude-activity-kill-chaos.mjs --reference-root DIR --binary EXE --tools EXE --curl EXE --seconds N --report NEW
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomInt } from 'node:crypto';
import { createServer } from 'node:http';
import { copyFile, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const options = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i]; const value = process.argv[i + 1];
  assert(['--reference-root', '--binary', '--tools', '--curl', '--seconds', '--report'].includes(key) && value && !options.has(key), 'Invalid/duplicate option.');
  if (key !== '--seconds') assert(isAbsolute(value), 'All supplied paths must be absolute.');
  options.set(key, value);
}
for (const key of ['--reference-root', '--binary', '--tools', '--curl', '--seconds', '--report']) assert(options.has(key), `${key} is required.`);
const seconds = Number(options.get('--seconds'));
assert(Number.isInteger(seconds) && seconds >= 10 && seconds <= 3600, 'Duration must be 10–3600 seconds.');
const sourceRoot = await realpath(options.get('--reference-root'));
const binarySource = await realpath(options.get('--binary'));
const toolsSource = await realpath(options.get('--tools'));
const curl = await realpath(options.get('--curl'));
const fixtureFile = new URL('../tests/fixtures/activity/moriium-public-data.json', import.meta.url);
const sourceFiles = ['scripts/status-receive.mjs', 'scripts/status-publish.mjs', 'scripts/lib/status-store.mjs', 'scripts/lib/status-batch.mjs', 'src/lib/activity.ts', 'src/lib/status.ts'];
const SOURCES = ['github', 'codex', 'claude'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const lf = text => text.replaceAll('\r\n', '\n');
const sleep = ms => new Promise(accept => setTimeout(accept, ms));
const checks = [];
function check(name, condition, detail = '') { assert(condition, `${name} ${detail}`); checks.push(name); }
// Run an owned process; with killAfterMs it is terminated at that moment.
async function run(executable, args, { cwd, env, killAfterMs } = {}) {
  return new Promise((accept, reject) => {
    const child = spawn(executable, args, { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let bytes = 0; const output = []; const errors = []; let failure; let killed = false;
    const stop = message => { failure = new Error(message); child.kill(); };
    const timer = setTimeout(() => stop('Isolated process timed out.'), 120000);
    const killer = killAfterMs === undefined ? null : setTimeout(() => { killed = child.kill(); }, killAfterMs);
    child.on('error', () => { clearTimeout(timer); reject(new Error('Isolated process unavailable.')); });
    for (const [stream, chunks] of [[child.stdout, output], [child.stderr, errors]]) {
      stream.on('data', chunk => { bytes += chunk.length; if (bytes > 2 * 1024 * 1024) stop('Isolated process exceeded output bound.'); else chunks.push(chunk); });
    }
    child.on('close', code => {
      clearTimeout(timer); if (killer) clearTimeout(killer);
      if (failure) reject(failure);
      else accept({ code, killed: killed && code !== 0, stdout: Buffer.concat(output).toString('utf8'), stderr: Buffer.concat(errors).toString('utf8') });
    });
  });
}

// The SSH stand-in only accepts a marked root whose name starts with this prefix.
const base = await mkdtemp(join(tmpdir(), 'enouia-handback-chaos-'));
let server;
const halt = { stop: false };
try {
  await writeFile(join(base, 'ACTIVITY_SANDBOX_FIXTURE'), 'enouia-activity-isolated-handback-v1');
  const snapshot = join(base, 'reference');
  const versions = [];
  const head = await run('git', ['-C', sourceRoot, 'rev-parse', 'HEAD'], { cwd: base, env: process.env });
  assert.equal(head.code, 0, 'Cannot record reference revision.');
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
  const publisherConfig = { version: 1, sites: { moriium: null, gallery: null }, runtimeEnabled: false };
  // The SSH session's publisher step is a no-op; the real publisher runs on a server timer below.
  const publisherWorker = join(base, 'publish.mjs');
  await writeFile(publisherWorker, `import{publishStatus}from${JSON.stringify(pathToFileURL(join(snapshot, 'scripts/status-publish.mjs')).href)};await publishStatus({root:process.env.MORIIUM_STATUS_ROOT,config:${JSON.stringify(publisherConfig)}});\n`);
  const sessionPublisher = join(base, 'session-publish.mjs');
  await writeFile(sessionPublisher, '// Production publishes from a systemd timer, not the SSH session.\n');
  const tools = join(base, 'tools');
  await mkdir(tools); await mkdir(join(base, 'traces'));
  await copyFile(toolsSource, join(tools, 'ssh.exe'));
  const executable = join(base, 'installed', 'enouia-activity.exe');
  await mkdir(dirname(executable)); await copyFile(binarySource, executable);
  const environment = {};
  for (const name of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'PATHEXT', 'COMSPEC']) if (process.env[name]) environment[name] = process.env[name];
  Object.assign(environment, { PATH: [tools, dirname(process.execPath), join(process.env.SystemRoot, 'System32')].join(delimiter), USERPROFILE: join(base, 'profile'), ENOU_TEST_ROOT: base, ENOU_TEST_NODE: process.execPath, ENOU_TEST_RECEIVER: join(snapshot, 'scripts/status-receive.mjs'), ENOU_TEST_PUBLISHER: sessionPublisher, ENOU_TEST_TRANSPORT: 'none' });

  const now = Math.floor(Date.now() / 1000) * 1000;
  const t0 = new Date(now - 30 * 60_000).toISOString();
  const history = JSON.parse(await readFile(fixtureFile, 'utf8'));
  for (const id of SOURCES) history.sources[id].updatedAt = t0;
  const baseline = { version: 1, producer: 'morii-workstation', sequence: 51, createdAt: t0,
    sources: Object.fromEntries(SOURCES.map(id => [id, { attemptedAt: t0, succeededAt: t0, result: 'success' }])), data: history };
  const baselineBytes = Buffer.from(`${JSON.stringify(baseline, null, 2)}\n`);

  const served = { root: null };
  let httpRequests = 0; let httpOutside = 0;
  server = createServer(async (request, response) => {
    try {
      httpRequests++;
      if (!request.url.startsWith('/status-data/')) httpOutside++;
      const match = /^\/status-data\/activity\/([a-f0-9]{64})\.json$/.exec(request.url);
      const path = request.url === '/status-data/current.json' ? join(served.root, 'public', 'current.json') : match ? join(served.root, 'public', 'activity', `${match[1]}.json`) : null;
      if (!path) { response.writeHead(404); response.end(); return; }
      const bytes = await readFile(path);
      response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(bytes);
    } catch { if (!response.headersSent) response.writeHead(404); response.end(); }
  });
  await new Promise((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept); });
  const origin = `http://127.0.0.1:${server.address().port}`;

  const root = join(base, 'runtime'); const legacy = join(base, 'legacy'); const captures = join(base, 'captures'); const publisherRoot = join(base, 'publisher');
  for (const path of [root, legacy, captures, join(publisherRoot, 'inbox')]) await mkdir(path, { recursive: true });
  served.root = publisherRoot;
  await writeFile(join(legacy, 'activity.json'), JSON.stringify(history));
  await writeFile(join(legacy, 'sequence.json'), JSON.stringify({ sequence: 51 }));
  await writeFile(join(legacy, 'pending.json'), baselineBytes);
  const config = join(base, 'runtime.json');
  await writeFile(config, JSON.stringify({ version: 1, mode: 'sandbox', dataRoot: root, deliveryEnabled: true,
    delivery: { sshExecutable: join(tools, 'ssh.exe'), restrictedAlias: 'sandbox-handback', curlExecutable: curl, publicOrigin: origin, observationSeconds: 0, retrySeconds: 1 } }));
  const env = { ...environment, ENOU_TEST_CAPTURES: captures, MORIIUM_STATUS_ROOT: publisherRoot, MORIIUM_STATUS_INBOX: join(publisherRoot, 'inbox') };
  const leaks = { paths: 0, stderr: 0 };
  async function cli(command, extra = [], killAfterMs) {
    const result = await run(executable, [command, ...extra, '--config', config], { cwd: base, env, killAfterMs });
    if (result.stderr !== '') leaks.stderr++;
    if (result.stdout.includes(base) || result.stdout.includes(base.replaceAll('\\', '\\\\'))) leaks.paths++;
    let value = null; try { value = JSON.parse(result.stdout); } catch { /* a killed run prints nothing */ }
    return { code: result.code, killed: result.killed, value };
  }
  // Captured wire bytes per sequence: ground truth for what reached the receiver.
  async function wire() {
    const sent = new Map();
    for (const file of (await readdir(captures)).sort()) {
      const bytes = await readFile(join(captures, file));
      const sequence = JSON.parse(bytes).sequence;
      if (!sent.has(sequence)) sent.set(sequence, new Set());
      sent.get(sequence).add(hash(bytes));
    }
    return sent;
  }
  // Server side: a sequential publisher timer and a lock-checking operator, never killed.
  const server_ = { publishes: 0, publishFailures: 0, failureSamples: {}, abandonedReceiveLocks: 0, abandonedPublishLocks: 0, stop: false };
  const alive = pid => { try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; } };
  async function clearAbandoned(path, key) {
    let pid; try { pid = Number(await readFile(path, 'utf8')); } catch { return; }
    if (Number.isInteger(pid) && pid > 0 && !alive(pid)) { await unlink(path).catch(() => {}); server_[key]++; }
  }
  const serverLoop = (async () => {
    while (!server_.stop && !halt.stop) {
      await clearAbandoned(join(publisherRoot, 'inbox', 'receive.lock'), 'abandonedReceiveLocks');
      await clearAbandoned(join(publisherRoot, 'publisher.lock'), 'abandonedPublishLocks');
      const published = await run(process.execPath, [publisherWorker], { cwd: base, env: { ...environment, MORIIUM_STATUS_ROOT: publisherRoot, MORIIUM_STATUS_INBOX: join(publisherRoot, 'inbox') } });
      if (published.code === 0) server_.publishes++;
      else {
        server_.publishFailures++;
        const line = published.stderr.split(/\r?\n/).find(text => /Error|EPERM|EBUSY|EEXIST/.test(text)) ?? '';
        const sample = line.replaceAll(base, '<base>').replaceAll(base.replaceAll('\\', '/'), '<base>').replace(/\.[0-9a-f-]{36}\.tmp/g, '.<tmp>').slice(0, 200);
        server_.failureSamples[sample] = (server_.failureSamples[sample] ?? 0) + 1;
      }
      await sleep(300);
    }
  })();
  check('baseline import succeeds', (await cli('migration-import', ['--bundle', legacy, '--high-water', '51'])).code === 0);
  check('baseline resume succeeds', (await cli('set-paused', ['false'])).code === 0);
  let first = await cli('retry-pending');
  for (let attempt = 0; attempt < 20 && first.value?.publicationObserved !== true; attempt++) { await sleep(1100); first = await cli('retry-pending'); }
  check('baseline 51 is published and observed', first.value?.publicationObserved === true, JSON.stringify(first.value));

  const deadline = Date.now() + seconds * 1000;
  const stats = { sync: {}, kills: 0, killedAfterExit: 0, invalidJson: 0, unexpected: [], overview: 0, blockedRuns: 0 };
  const recovery = { inspections: 0, orphans: [], retractions: 0, unsafe: [] };
  const bump = (bucket, key) => { bucket[key] = (bucket[key] ?? 0) + 1; };
  const readerViolations = [];
  let blocked = false;
  async function writer(index) {
    while (Date.now() < deadline) {
      const kill = randomInt(100) < 60;
      // Half the kills land near collection and commit, half during delivery.
      const delay = randomInt(2) ? randomInt(20, 300) : randomInt(300, 2500);
      const result = await cli('sync', [], kill ? delay : undefined);
      if (result.killed) { stats.kills++; continue; }
      if (kill) stats.killedAfterExit++;
      if (!result.value) { stats.invalidJson++; continue; }
      bump(stats.sync, `${result.code}:${result.value.state ?? 'none'}`);
      if (result.code === 6 && result.value.state === 'storage_failed') { stats.blockedRuns++; blocked = true; continue; }
      if (![0, 2, 3, 4].includes(result.code)) stats.unexpected.push({ worker: `writer-${index}`, code: result.code, state: result.value.state });
    }
  }
  async function reader(index) {
    let lastReserved = 0;
    while (Date.now() < deadline) {
      const result = await cli('overview');
      if (!result.value || result.code !== 0) { stats.unexpected.push({ worker: `reader-${index}`, code: result.code }); continue; }
      stats.overview++;
      const reserved = result.value.producer.highestReserved;
      const pending = result.value.delivery.pendingSequence;
      // Retraction may lower nothing CURRENT names, so the reservation never decreases.
      if (reserved < lastReserved || (pending !== null && pending > reserved)) readerViolations.push({ reader: index, lastReserved, reserved, pending });
      lastReserved = reserved;
    }
  }
  // The operator retracts only orphans whose batch provably never reached the receiver.
  async function operator() {
    while (Date.now() < deadline + 5000) {
      if (!blocked) { await sleep(200); if (Date.now() >= deadline) break; continue; }
      const inspected = await cli('recovery-inspect');
      if (inspected.code === 3) { await sleep(50); continue; }
      recovery.inspections++;
      if (inspected.code !== 0) { recovery.unsafe.push({ step: 'inspect', code: inspected.code, value: inspected.value }); blocked = false; continue; }
      const sent = await wire();
      for (const orphan of inspected.value.blocking) {
        const neverSent = orphan.pendingSha256 === null || !(sent.get(orphan.pendingSequence)?.has(orphan.pendingSha256));
        const safe = orphan.standing !== 'corrupt' && neverSent;
        recovery.orphans.push({ id: orphan.id, standing: orphan.standing, preparedPointer: orphan.preparedPointer, pendingSequence: orphan.pendingSequence, neverSent });
        if (!safe) { recovery.unsafe.push({ step: 'evidence', orphan }); continue; }
        const retracted = await cli('recovery-retract', ['--generation', orphan.id, '--manifest-sha256', orphan.manifestSha256, '--confirm-never-selected', 'true']);
        if (retracted.code === 0) recovery.retractions++;
        else if (retracted.code !== 3) recovery.unsafe.push({ step: 'retract', code: retracted.code, value: retracted.value });
      }
      if (inspected.value.writable || inspected.value.blocking.length > 0) blocked = false;
    }
  }
  const started = Date.now();
  await Promise.all([writer(0), writer(1), reader(0), reader(1), operator()]);
  const elapsedMs = Date.now() - started;

  // Drain: resolve any remaining orphan or pending batch without kills.
  let drained = null;
  const drainLog = [];
  for (let attempt = 0; attempt < 30; attempt++) {
    const inspected = await cli('recovery-inspect');
    if (inspected.code === 0 && !inspected.value.writable) {
      const sent = await wire();
      for (const orphan of inspected.value.blocking) {
        const neverSent = orphan.pendingSha256 === null || !(sent.get(orphan.pendingSequence)?.has(orphan.pendingSha256));
        recovery.orphans.push({ id: orphan.id, standing: orphan.standing, preparedPointer: orphan.preparedPointer, pendingSequence: orphan.pendingSequence, neverSent, drain: true });
        if (orphan.standing === 'corrupt' || !neverSent) { recovery.unsafe.push({ step: 'drain-evidence', orphan }); continue; }
        if ((await cli('recovery-retract', ['--generation', orphan.id, '--manifest-sha256', orphan.manifestSha256, '--confirm-never-selected', 'true'])).code === 0) recovery.retractions++;
      }
      continue;
    }
    const diagnostics = await cli('diagnostics');
    if (diagnostics.value?.pending === null) { drained = diagnostics.value; break; }
    await sleep(1100);
    const retried = await cli('retry-pending');
    const publisherState = JSON.parse(await readFile(join(publisherRoot, 'state.json'), 'utf8'));
    let inbox = null; try { inbox = JSON.parse(await readFile(join(publisherRoot, 'inbox', 'pending.json'), 'utf8')).batch.sequence; } catch { /* none */ }
    drainLog.push({ pending: diagnostics.value?.pending?.sequence, retry: retried.value, publisherSequence: publisherState.sequence, inbox });
  }

  server_.stop = true;
  await serverLoop;
  check('chaos ran for the requested duration', elapsedMs >= seconds * 1000);
  check('the server publisher was never left locked', server_.abandonedPublishLocks === 0 && server_.publishes > 0, JSON.stringify(server_));
  check('runs were really terminated mid-flight', stats.kills >= 10, JSON.stringify(stats));
  check('every surviving invocation printed one JSON result', stats.invalidJson === 0, JSON.stringify(stats));
  check('no invocation wrote stderr or a private path', leaks.stderr === 0 && leaks.paths === 0, JSON.stringify(leaks));
  check('no surviving invocation ended in an unexpected state', stats.unexpected.length === 0, JSON.stringify(stats.unexpected.slice(0, 5)));
  check('lock-free reads never saw a reservation go back or a pending batch above it', readerViolations.length === 0 && stats.overview > 0, JSON.stringify(readerViolations.slice(0, 3)));
  check('every blocking generation was provably unsent and retracted safely', recovery.unsafe.length === 0 && recovery.retractions === recovery.orphans.length, JSON.stringify({ unsafe: recovery.unsafe.slice(0, 3), orphans: recovery.orphans.length, retractions: recovery.retractions }));
  check('surviving runs still published new sequences', (stats.sync['2:publication_observed'] ?? 0) + (stats.sync['0:publication_observed'] ?? 0) >= 3, JSON.stringify(stats.sync));
  check('the last pending batch drains to an observed publication', drained !== null, JSON.stringify(drainLog.slice(-3)));

  const final = await cli('recovery-inspect');
  const reserved = final.value.current.highestReserved;
  check('the final root is writable with no orphan', final.code === 0 && final.value.writable === true && final.value.blocking.length === 0, JSON.stringify(final.value));
  const sentFinal = await wire();
  const sequences = [...sentFinal.keys()].sort((a, b) => a - b);
  check('every sequence was sent with exactly one byte sequence', [...sentFinal.values()].every(set => set.size === 1), JSON.stringify([...sentFinal].filter(([, set]) => set.size > 1).map(([s]) => s)));
  check('sent sequences are contiguous from the baseline to the reservation', sequences[0] === 51 && sequences.at(-1) === reserved && sequences.every((value, i) => value === 51 + i), JSON.stringify({ first: sequences[0], last: sequences.at(-1), count: sequences.length, reserved }));
  const state = JSON.parse(await readFile(join(publisherRoot, 'state.json'), 'utf8'));
  const manifest = JSON.parse(await readFile(join(publisherRoot, 'public', 'current.json'), 'utf8'));
  const publicData = JSON.parse(await readFile(join(publisherRoot, 'public', 'activity', `${manifest.activity.hash}.json`), 'utf8'));
  check('the publisher holds the final reservation', state.sequence === reserved, JSON.stringify({ publisher: state.sequence, reserved }));
  check('published history keeps every baseline date', SOURCES.every(id => history.sources[id].days.every(day => publicData.sources[id].days.some(next => next.date === day.date))));
  const exportResult = await cli('migration-export-legacy', ['--output', join(base, 'export')]);
  check('the final state exports with the same reservation and no pending', exportResult.code === 0 && exportResult.value.highestReserved === reserved && exportResult.value.pendingSha256 === null, JSON.stringify(exportResult.value));
  check('all HTTP observations stayed on isolated status paths', httpRequests > 0 && httpOutside === 0);
  for (const item of versions) check(`reference remained unchanged: ${item.path}`, hash(await readFile(join(sourceRoot, item.path))) === item.sha256);

  const generationEntries = await readdir(join(root, 'generations'));
  const report = { schemaVersion: 1, state: 'passed', scope: 'development_reference_random_kill_chaos', seconds, elapsedMs, checks,
    workers: { writers: 2, killProbabilityPercent: 60, killDelayMs: { near: [20, 300], delivery: [300, 2500] }, readers: 2, recoveryOperator: 1 },
    server: { publishes: server_.publishes, publishFailures: server_.publishFailures, publishFailureSamples: server_.failureSamples, abandonedReceiveLocksRemoved: server_.abandonedReceiveLocks, abandonedPublishLocks: server_.abandonedPublishLocks },
    observations: { kills: stats.kills, killedAfterExit: stats.killedAfterExit, syncOutcomes: stats.sync, blockedRuns: stats.blockedRuns, overviewReads: stats.overview,
      inspections: recovery.inspections, orphans: recovery.orphans, retractions: recovery.retractions,
      sequencesSent: sequences.length, firstSequence: sequences[0], finalReservation: reserved,
      publishedGenerations: generationEntries.filter(name => !name.startsWith('.staging-')).length, stagingDirectories: generationEntries.filter(name => name.startsWith('.staging-')).length, httpRequests },
    node: process.version, runtimeBinarySha256: hash(await readFile(executable)), fixtureToolsSha256: hash(await readFile(toolsSource)), fixtureSha256: hash(lf(await readFile(fixtureFile, 'utf8'))),
    harnessSha256: hash(lf(await readFile(fileURLToPath(import.meta.url), 'utf8'))), referenceHead: head.stdout.trim(), referenceFiles: versions,
    limitations: ['Killing the runner ends its job, including the SSH stand-in and an in-flight receiver; the publisher runs on a separate server timer as in production.', 'Abandoned receiver locks are removed by a harness server operator only when the recorded process is gone, modelling Moriium\'s documented manual step.', 'The operator retracts only orphans whose pending bytes never appear in the captured wire; that ground truth exists only in this harness.', 'One synthetic root, no collectors, no real SSH, scheduler, deployed publisher, disk-full or power loss.'] };
  await writeFile(options.get('--report'), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({ state: report.state, checks: checks.length, seconds, server: report.server, kills: stats.kills, blockedRuns: stats.blockedRuns, orphans: recovery.orphans.length, retractions: recovery.retractions, sequencesSent: sequences.length, finalReservation: reserved, syncOutcomes: stats.sync }));
} finally {
  halt.stop = true;
  if (server) { server.closeAllConnections(); await new Promise(accept => server.close(accept)); }
  const resolved = resolve(base);
  assert(basename(resolved).startsWith('enouia-handback-chaos-') && !relative(resolve(tmpdir()), resolved).startsWith('..') && dirname(resolved) === resolve(tmpdir()), 'Unsafe cleanup path.');
  assert(!sourceRoot.startsWith(resolved + sep), 'Reference root overlaps cleanup.');
  await sleep(2000);
  await rm(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
}
