// Development-only J1 fixture: a synthetic installed Activity package whose
// store holds an observed publication, for checking the desktop surface.
// Never imported by Runtime or regular tests. The run publishes only to a
// copied reference receiver/publisher on 127.0.0.1 through the marked SSH
// stand-in; no collector, account, credential or production endpoint is used.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { copyFile, lstat, mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, isAbsolute, join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const options = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i]; const value = process.argv[i + 1];
  assert(['--reference-root', '--binary', '--tools', '--curl'].includes(key) && value && !options.has(key), 'Invalid/duplicate option.');
  assert(isAbsolute(value), 'All supplied paths must be absolute.');
  options.set(key, value);
}
for (const key of ['--reference-root', '--binary', '--tools', '--curl']) assert(options.has(key), `${key} is required.`);
const sourceRoot = await realpath(options.get('--reference-root'));
const binarySource = await realpath(options.get('--binary'));
const toolsSource = await realpath(options.get('--tools'));
const curl = await realpath(options.get('--curl'));
const sourceFiles = ['scripts/status-receive.mjs', 'scripts/status-publish.mjs', 'scripts/lib/status-store.mjs', 'scripts/lib/status-batch.mjs', 'src/lib/activity.ts', 'src/lib/status.ts'];
const SOURCES = ['github', 'codex', 'claude'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function run(executable, args, env, input) {
  return new Promise((accept, reject) => {
    const child = spawn(executable, args, { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const out = []; let size = 0;
    const timer = setTimeout(() => { child.kill(); reject(new Error('Timed out.')); }, 30000);
    child.stdout.on('data', c => { size += c.length; if (size < 1 << 20) out.push(c); });
    child.stderr.on('data', () => {});
    child.on('error', () => { clearTimeout(timer); reject(new Error('Unavailable.')); });
    child.stdin.on('error', () => {});
    child.on('close', code => { clearTimeout(timer); accept({ code, stdout: Buffer.concat(out).toString('utf8') }); });
    child.stdin.end(input);
  });
}

// The SSH stand-in only accepts a marked root whose name has this prefix.
const base = await mkdtemp(join(tmpdir(), 'enouia-handback-ui-'));
await writeFile(join(base, 'ACTIVITY_SANDBOX_FIXTURE'), 'enouia-activity-isolated-handback-v1');
const snapshot = join(base, 'reference');
for (const name of sourceFiles) {
  const original = join(sourceRoot, name);
  assert(!(await lstat(original)).isSymbolicLink() && (await realpath(original)).startsWith(sourceRoot + sep), 'Reference file escapes its checkout.');
  await mkdir(dirname(join(snapshot, name)), { recursive: true });
  await writeFile(join(snapshot, name), await readFile(original), { flag: 'wx' });
}
const publisherRoot = join(base, 'publisher'); const tools = join(base, 'tools'); const captures = join(base, 'captures');
for (const path of [join(publisherRoot, 'inbox'), tools, captures, join(base, 'traces')]) await mkdir(path, { recursive: true });
await copyFile(toolsSource, join(tools, 'ssh.exe'));
const publisherWorker = join(base, 'publish.mjs');
await writeFile(publisherWorker, `import{publishStatus}from${JSON.stringify(pathToFileURL(join(snapshot, 'scripts/status-publish.mjs')).href)};await publishStatus({root:process.env.MORIIUM_STATUS_ROOT,config:{version:1,sites:{moriium:null,gallery:null},runtimeEnabled:false}});\n`);

// About a year of deterministic synthetic history with explicit zeros and one gap.
const now = Math.floor(Date.now() / 1000) * 1000;
const at = new Date(now - 20 * 60_000).toISOString();
const day = n => new Date(Date.UTC(2026, 9, 6) - n * 86_400_000).toISOString().slice(0, 10);
const series = (count, f) => Array.from({ length: count }, (_, i) => ({ date: day(count - 1 - i), value: f(i) }));
const data = { version: 1, sources: {
  github: { updatedAt: at, timezone: 'GitHub', metric: 'contributions', days: series(400, i => (i * 7) % 11 < 4 ? 0 : (i * 13) % 9) },
  codex: { updatedAt: at, timezone: 'Codex', metric: 'tokens', days: series(220, i => (i % 6 === 0 ? 0 : 150000 + ((i * 7919) % 900000))) },
  claude: { updatedAt: at, timezone: 'Asia/Shanghai', metric: 'tokens', days: series(260, i => 400000 + ((i * 104729) % 2600000)).filter((_, i) => i < 100 || i > 109) },
} };
const batch = { version: 1, producer: 'morii-workstation', sequence: 87, createdAt: at, sources: Object.fromEntries(SOURCES.map(id => [id, { attemptedAt: at, succeededAt: at, result: 'success' }])), data };
const pending = Buffer.from(`${JSON.stringify(batch, null, 2)}\n`);

const server = createServer(async (request, response) => {
  try {
    const match = /^\/status-data\/activity\/([a-f0-9]{64})\.json$/.exec(request.url);
    const path = request.url === '/status-data/current.json' ? join(publisherRoot, 'public', 'current.json') : match ? join(publisherRoot, 'public', 'activity', `${match[1]}.json`) : null;
    if (!path) { response.writeHead(404); response.end(); return; }
    const bytes = await readFile(path); response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(bytes);
  } catch { if (!response.headersSent) response.writeHead(404); response.end(); }
});
await new Promise(accept => server.listen(0, '127.0.0.1', accept));
try {
  const packageRoot = join(base, 'package'); const dataRoot = join(base, 'data'); const seed = join(base, 'seed');
  for (const path of [packageRoot, dataRoot, seed]) await mkdir(path);
  const binary = join(packageRoot, 'enouia-activity.exe'); const config = join(packageRoot, 'activity-config.json');
  await copyFile(binarySource, binary);
  await writeFile(config, JSON.stringify({ version: 1, mode: 'sandbox', dataRoot, deliveryEnabled: true, delivery: { sshExecutable: join(tools, 'ssh.exe'), restrictedAlias: 'sandbox-handback', curlExecutable: curl, publicOrigin: `http://127.0.0.1:${server.address().port}`, observationSeconds: 0, retrySeconds: 3600 } }));
  await writeFile(join(seed, 'activity.json'), JSON.stringify(data));
  await writeFile(join(seed, 'sequence.json'), '{"sequence":87}');
  await writeFile(join(seed, 'pending.json'), pending);
  const environment = {};
  for (const name of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'PATHEXT', 'COMSPEC']) if (process.env[name]) environment[name] = process.env[name];
  Object.assign(environment, { PATH: [tools, dirname(process.execPath), join(process.env.SystemRoot, 'System32')].join(delimiter), ENOU_TEST_ROOT: base, ENOU_TEST_NODE: process.execPath, ENOU_TEST_RECEIVER: join(snapshot, 'scripts/status-receive.mjs'), ENOU_TEST_PUBLISHER: publisherWorker, ENOU_TEST_CAPTURES: captures, ENOU_TEST_TRANSPORT: 'none', MORIIUM_STATUS_ROOT: publisherRoot, MORIIUM_STATUS_INBOX: join(publisherRoot, 'inbox') });
  const cli = async (...args) => { const r = await run(binary, args, environment); return { code: r.code, value: JSON.parse(r.stdout) }; };
  assert.equal((await cli('migration-import', '--bundle', seed, '--config', config, '--high-water', '87')).code, 0);
  assert.equal((await cli('set-paused', 'false', '--config', config)).code, 0);
  const delivered = await cli('retry-pending', '--config', config);
  assert(delivered.code === 0 && delivered.value.publicationObserved, 'Synthetic publication was not observed.');
  const overview = await cli('overview', '--config', config);
  assert.equal(overview.value.delivery.state, 'observed');
  const marker = `Enouia.Activity.Package.v1:${randomUUID()}`;
  await writeFile(join(packageRoot, 'install.json'), JSON.stringify({ schemaVersion: 1, marker, taskName: 'Enouia-Activity-UI-Sandbox', mode: 'sandbox', binary, config, dataRoot, binaryHash: hash(await readFile(binary)).toUpperCase(), configHash: hash(await readFile(config)).toUpperCase(), tools: [], installedAt: new Date().toISOString() }, null, 2));
  console.log(JSON.stringify({ state: 'prepared', packageRoot, deliveryState: overview.value.delivery.state, sequence: 87, wire: hash(pending) }, null, 2));
} finally {
  server.closeAllConnections(); server.close();
}
