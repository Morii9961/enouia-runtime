// Development-only sustained contention drill over copied public Moriium
// receiver/publisher files. Never imported by Runtime or regular tests.
// Concurrent copies of the real runner sync, read lock-free, toggle pause and
// inspect recovery against one synthetic root for a bounded duration; the
// harness then checks the store, the wire and the publisher for invariants.
//
//   node scripts/claude-activity-contention-stress.mjs --reference-root DIR --binary EXE --tools EXE --curl EXE --seconds N --report NEW
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
const checks = [];
function check(name, condition, detail = '') { assert(condition, `${name} ${detail}`); checks.push(name); }
async function run(executable, args, { cwd, env, input } = {}) {
  return new Promise((accept, reject) => {
    const child = spawn(executable, args, { cwd, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let bytes = 0; const output = []; const errors = []; let failure;
    const stop = message => { failure = new Error(message); child.kill(); };
    const timer = setTimeout(() => stop('Isolated process timed out.'), 120000);
    child.on('error', () => { clearTimeout(timer); reject(new Error('Isolated process unavailable.')); });
    for (const [stream, chunks] of [[child.stdout, output], [child.stderr, errors]]) {
      stream.on('data', chunk => { bytes += chunk.length; if (bytes > 2 * 1024 * 1024) stop('Isolated process exceeded output bound.'); else chunks.push(chunk); });
    }
    child.stdin.on('error', () => {});
    child.on('close', code => { clearTimeout(timer); if (failure) reject(failure); else accept({ code, stdout: Buffer.concat(output).toString('utf8'), stderr: Buffer.concat(errors).toString('utf8') }); });
    child.stdin.end(input);
  });
}

// The SSH stand-in only accepts a marked root whose name starts with this prefix.
const base = await mkdtemp(join(tmpdir(), 'enouia-handback-stress-'));
let server;
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
  const publisherWorker = join(base, 'publish.mjs');
  await writeFile(publisherWorker, `import{publishStatus}from${JSON.stringify(pathToFileURL(join(snapshot, 'scripts/status-publish.mjs')).href)};await publishStatus({root:process.env.MORIIUM_STATUS_ROOT,config:${JSON.stringify(publisherConfig)}});\n`);
  const tools = join(base, 'tools');
  await mkdir(tools); await mkdir(join(base, 'traces'));
  await copyFile(toolsSource, join(tools, 'ssh.exe'));
  const executable = join(base, 'installed', 'enouia-activity.exe');
  await mkdir(dirname(executable)); await copyFile(binarySource, executable);
  const environment = {};
  for (const name of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'PATHEXT', 'COMSPEC']) if (process.env[name]) environment[name] = process.env[name];
  Object.assign(environment, { PATH: [tools, dirname(process.execPath), join(process.env.SystemRoot, 'System32')].join(delimiter), USERPROFILE: join(base, 'profile'), ENOU_TEST_ROOT: base, ENOU_TEST_NODE: process.execPath, ENOU_TEST_RECEIVER: join(snapshot, 'scripts/status-receive.mjs'), ENOU_TEST_PUBLISHER: publisherWorker, ENOU_TEST_TRANSPORT: 'none' });

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
  async function cli(command, extra = []) {
    const result = await run(executable, [command, ...extra, '--config', config], { cwd: base, env });
    if (result.stderr !== '') leaks.stderr++;
    if (result.stdout.includes(base) || result.stdout.includes(base.replaceAll('\\', '\\\\'))) leaks.paths++;
    let value = null; try { value = JSON.parse(result.stdout); } catch { /* counted below */ }
    return { code: result.code, value };
  }
  check('baseline import succeeds', (await cli('migration-import', ['--bundle', legacy, '--high-water', '51'])).code === 0);
  check('baseline resume succeeds', (await cli('set-paused', ['false'])).code === 0);
  const first = await cli('retry-pending');
  check('baseline 51 is published and observed', first.code === 0 && first.value.publicationObserved === true);

  // Contention phase.
  const deadline = Date.now() + seconds * 1000;
  const stats = { sync: {}, overview: 0, preview: 0, pause: {}, inspect: {}, invalidJson: 0, unexpected: [] };
  const bump = (bucket, key) => { bucket[key] = (bucket[key] ?? 0) + 1; };
  const readerViolations = [];
  const syncResults = [];
  async function writer(index) {
    while (Date.now() < deadline) {
      const result = await cli('sync');
      if (!result.value) { stats.invalidJson++; continue; }
      bump(stats.sync, `${result.code}:${result.value.state ?? 'none'}`);
      if (![0, 2, 3, 4].includes(result.code)) stats.unexpected.push({ worker: `writer-${index}`, code: result.code, state: result.value.state });
      if (result.value.sequence) syncResults.push({ sequence: result.value.sequence, observed: result.value.publicationObserved === true });
    }
  }
  async function reader(index) {
    let lastReserved = 0;
    while (Date.now() < deadline) {
      const command = index % 2 ? 'preview' : 'overview';
      const result = await cli(command);
      if (!result.value) { stats.invalidJson++; continue; }
      if (result.code !== 0) { stats.unexpected.push({ worker: `reader-${index}`, code: result.code, value: result.value }); continue; }
      if (command === 'overview') {
        stats.overview++;
        const reserved = result.value.producer.highestReserved;
        const pending = result.value.delivery.pendingSequence;
        if (reserved < lastReserved || (pending !== null && pending > reserved)) readerViolations.push({ reader: index, lastReserved, reserved, pending });
        lastReserved = reserved;
      } else stats.preview++;
    }
  }
  async function toggler() {
    let paused = false;
    while (Date.now() < deadline) {
      await new Promise(accept => setTimeout(accept, 4000));
      if (Date.now() >= deadline) break;
      paused = !paused;
      // The lock is try-once: retry until this toggle wins it or time runs out.
      for (;;) {
        const result = await cli('set-paused', [String(paused)]);
        if (!result.value) { stats.invalidJson++; break; }
        bump(stats.pause, `${result.code}:${result.value.state}`);
        if (![0, 3].includes(result.code)) stats.unexpected.push({ worker: 'toggler', code: result.code, state: result.value.state });
        if (result.code === 0 || Date.now() >= deadline) {
          if (result.code !== 0) paused = !paused;
          break;
        }
        await new Promise(accept => setTimeout(accept, 50));
      }
    }
    // Leave the store running for the drain phase.
    while ((await cli('set-paused', ['false'])).code === 3) await new Promise(accept => setTimeout(accept, 200));
  }
  async function inspector() {
    while (Date.now() < deadline) {
      const result = await cli('recovery-inspect');
      if (!result.value) { stats.invalidJson++; continue; }
      bump(stats.inspect, `${result.code}:${result.value.state}:${result.value.writable ?? ''}`);
      if (!(result.code === 3 || (result.code === 0 && result.value.writable === true))) stats.unexpected.push({ worker: 'inspector', code: result.code, value: result.value });
      await new Promise(accept => setTimeout(accept, 250));
    }
  }
  const started = Date.now();
  await Promise.all([writer(0), writer(1), writer(2), reader(0), reader(1), reader(2), toggler(), inspector()]);
  const elapsedMs = Date.now() - started;

  // Drain: let any remaining pending batch publish.
  let drained = null;
  for (let attempt = 0; attempt < 20; attempt++) {
    const diagnostics = await cli('diagnostics');
    if (diagnostics.value?.pending === null) { drained = diagnostics.value; break; }
    await new Promise(accept => setTimeout(accept, 1100));
    await cli('retry-pending');
  }

  check('contention ran for the requested duration', elapsedMs >= seconds * 1000);
  check('every invocation printed one JSON result', stats.invalidJson === 0, JSON.stringify(stats));
  check('no invocation wrote stderr or a private path', leaks.stderr === 0 && leaks.paths === 0, JSON.stringify(leaks));
  check('no invocation ended in an unexpected state', stats.unexpected.length === 0, JSON.stringify(stats.unexpected.slice(0, 5)));
  check('writers contended for the lock', (stats.sync['3:busy'] ?? 0) > 0, JSON.stringify(stats.sync));
  check('writers committed and published new sequences', syncResults.filter(r => r.observed).length >= 3, JSON.stringify(stats.sync));
  check('pause toggles took effect under contention', (stats.pause['0:pause_updated'] ?? 0) >= 2, JSON.stringify(stats.pause));
  check('lock-free reads never saw a reservation go back or a pending batch above it', readerViolations.length === 0 && stats.overview > 0 && stats.preview > 0, JSON.stringify(readerViolations.slice(0, 3)));
  check('recovery inspection always found the root writable', Object.keys(stats.inspect).every(key => key.startsWith('3:') || key === '0:recovery_inspected:true'), JSON.stringify(stats.inspect));
  check('the last pending batch drains to an observed publication', drained !== null, JSON.stringify(drained));

  const final = await cli('recovery-inspect');
  const reserved = final.value.current.highestReserved;
  check('the final root is writable with no orphan', final.code === 0 && final.value.writable === true && final.value.blocking.length === 0, JSON.stringify(final.value));
  const wire = new Map();
  for (const file of (await readdir(captures)).sort()) {
    const bytes = await readFile(join(captures, file));
    const sequence = JSON.parse(bytes).sequence;
    const digest = hash(bytes);
    if (!wire.has(sequence)) wire.set(sequence, new Set());
    wire.get(sequence).add(digest);
  }
  const sent = [...wire.keys()].sort((a, b) => a - b);
  check('every sequence was sent with exactly one byte sequence', [...wire.values()].every(set => set.size === 1), JSON.stringify([...wire].filter(([, set]) => set.size > 1).map(([s]) => s)));
  check('sent sequences are contiguous from the baseline to the reservation', sent[0] === 51 && sent.at(-1) === reserved && sent.every((value, i) => value === 51 + i), JSON.stringify({ first: sent[0], last: sent.at(-1), count: sent.length, reserved }));
  const state = JSON.parse(await readFile(join(publisherRoot, 'state.json'), 'utf8'));
  const manifest = JSON.parse(await readFile(join(publisherRoot, 'public', 'current.json'), 'utf8'));
  const publicData = JSON.parse(await readFile(join(publisherRoot, 'public', 'activity', `${manifest.activity.hash}.json`), 'utf8'));
  check('the publisher holds the final reservation', state.sequence === reserved, JSON.stringify({ publisher: state.sequence, reserved }));
  check('published history keeps every baseline date', SOURCES.every(id => history.sources[id].days.every(day => publicData.sources[id].days.some(next => next.date === day.date))));
  const exported = join(base, 'export');
  const exportResult = await cli('migration-export-legacy', ['--output', exported]);
  check('the final state exports with the same reservation and no pending', exportResult.code === 0 && exportResult.value.highestReserved === reserved && exportResult.value.pendingSha256 === null, JSON.stringify(exportResult.value));
  check('all HTTP observations stayed on isolated status paths', httpRequests > 0 && httpOutside === 0);
  for (const item of versions) check(`reference remained unchanged: ${item.path}`, hash(await readFile(join(sourceRoot, item.path))) === item.sha256);

  const generations = (await readdir(join(root, 'generations'))).length;
  const report = { schemaVersion: 1, state: 'passed', scope: 'development_reference_sustained_contention', seconds, elapsedMs, checks,
    workers: { writers: 3, readers: 3, pauseToggler: 1, recoveryInspector: 1 },
    observations: { syncOutcomes: stats.sync, overviewReads: stats.overview, previewReads: stats.preview, pauseOutcomes: stats.pause, inspectOutcomes: stats.inspect,
      sequencesSent: sent.length, firstSequence: sent[0], finalReservation: reserved, publishedObservations: syncResults.filter(r => r.observed).length, generationDirectories: generations, httpRequests },
    node: process.version, runtimeBinarySha256: hash(await readFile(executable)), fixtureToolsSha256: hash(await readFile(toolsSource)), fixtureSha256: hash(lf(await readFile(fixtureFile, 'utf8'))),
    harnessSha256: hash(lf(await readFile(fileURLToPath(import.meta.url), 'utf8'))), referenceHead: head.stdout.trim(), referenceFiles: versions,
    limitations: ['One synthetic root and the marked SSH stand-in on one machine; no real SSH, collectors, scheduler or deployed publisher.', 'Collectors are absent, so every batch carries three failed sources with retained history.', 'No Memory index rebuild, process kill, disk-full or power loss runs during contention.'] };
  await writeFile(options.get('--report'), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({ state: report.state, checks: checks.length, seconds, ...report.observations }));
} finally {
  if (server) { server.closeAllConnections(); await new Promise(accept => server.close(accept)); }
  const resolved = resolve(base);
  assert(basename(resolved).startsWith('enouia-handback-stress-') && !relative(resolve(tmpdir()), resolved).startsWith('..') && dirname(resolved) === resolve(tmpdir()), 'Unsafe cleanup path.');
  assert(!sourceRoot.startsWith(resolved + sep), 'Reference root overlaps cleanup.');
  await rm(resolved, { recursive: true, force: true });
}
