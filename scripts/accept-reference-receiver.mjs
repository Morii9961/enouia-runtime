// Development-only B4 reference check. Never imported by Runtime or regular tests.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { copyFile, lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const options = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i]; const value = process.argv[i + 1];
  assert(['--reference-root', '--binary', '--curl', '--report'].includes(key) && value && !options.has(key), 'Invalid/duplicate option.');
  assert(isAbsolute(value), 'All supplied paths must be absolute.');
  options.set(key, value);
}
for (const key of ['--reference-root', '--binary', '--curl']) assert(options.has(key), 'Reference root, release binary, and curl paths are required.');
const sourceRoot = await realpath(options.get('--reference-root'));
const binarySource = await realpath(options.get('--binary'));
const curl = await realpath(options.get('--curl'));
const fixtureFile = new URL('../tests/fixtures/activity/moriium-public-data.json', import.meta.url);
const sourceFiles = ['scripts/status-receive.mjs', 'scripts/status-publish.mjs', 'scripts/lib/status-store.mjs', 'scripts/lib/status-batch.mjs', 'src/lib/activity.ts', 'src/lib/status.ts'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const checks = [];
function check(name, condition) { assert(condition, name); checks.push(name); }
async function run(executable, args, { cwd, env = process.env, input } = {}) {
  return new Promise((accept, reject) => {
    const child = spawn(executable, args, { cwd, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let bytes = 0; const output = []; const errors = [];
    let failure;
    const stop = message => { failure = new Error(message); child.kill(); };
    const timer = setTimeout(() => stop('Isolated process timed out.'), 15000);
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
const base = await mkdtemp(join(tmpdir(), 'enouia-b4-'));
let server;
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
  // Only these six public source files are copied, never checkout data/config/auth.
  const { receiveBatch } = await import(pathToFileURL(join(snapshot, 'scripts/status-receive.mjs')));
  const { publishStatus } = await import(pathToFileURL(join(snapshot, 'scripts/status-publish.mjs')));
  const { validateBatch } = await import(pathToFileURL(join(snapshot, 'scripts/lib/status-batch.mjs')));
  const executable = join(base, 'installed', 'enouia-activity.exe');
  await mkdir(dirname(executable)); await copyFile(binarySource, executable);
  const data = JSON.parse(await readFile(fixtureFile, 'utf8'));
  async function cli(command, config, extra = []) {
    const result = await run(executable, [command, ...(config ? ['--config', config] : []), ...extra], { cwd: base });
    assert.equal(result.stderr, '', 'Runtime emitted unredacted stderr.');
    assert(!result.stdout.includes(base), 'Runtime exported private paths.');
    return { code: result.code, value: JSON.parse(result.stdout) };
  }
  async function importState(name, archive, pending, highWater, delivery) {
    const root = join(base, name); const legacy = join(base, `${name}-legacy`); const config = join(base, `${name}.json`);
    await mkdir(root); await mkdir(legacy);
    await writeFile(join(legacy, 'activity.json'), JSON.stringify(archive));
    await writeFile(join(legacy, 'sequence.json'), JSON.stringify({ sequence: highWater }));
    if (pending) await writeFile(join(legacy, 'pending.json'), pending);
    await writeFile(config, JSON.stringify({ version: 1, mode: 'sandbox', dataRoot: root, deliveryEnabled: Boolean(delivery), ...(delivery ? { delivery } : {}) }));
    assert.equal((await cli('migration-import', config, ['--bundle', legacy, '--high-water', String(highWater)])).code, 0, 'Synthetic import failed.');
    assert.equal((await cli('set-paused', null, ['false', '--config', config])).code, 0, 'Synthetic resume failed.');
    return config;
  }
  const producerConfig = await importState('producer', data, null, 50);
  const collected = await cli('sync', producerConfig);
  check('C04: real runner freezes three unconfigured failures', collected.code === 4 && collected.value.sourceFailures === 3);
  const frozen = join(base, 'frozen');
  assert.equal((await cli('migration-export-legacy', producerConfig, ['--output', frozen])).code, 0);
  const exact = await readFile(join(frozen, 'pending.json'));
  const batch = JSON.parse(exact);
  assert.deepEqual(batch.data, data);
  check('C04: every prior source date/value/time retained', batch.sequence === 51 && Object.values(batch.sources).every(outcome => outcome.result === 'failed'));
  const legacyEnvelope = structuredClone(batch);
  for (const outcome of Object.values(legacyEnvelope.sources)) delete outcome.succeededAt;
  assert.deepEqual(validateBatch(legacyEnvelope), batch);
  check('C04: legacy envelope derives the exact Runtime outcomes', true);
  const publisherConfig = { version: 1, sites: { moriium: null, gallery: null }, runtimeEnabled: false };
  const oldRoot = join(base, 'old-publisher'); const newRoot = join(base, 'new-publisher');
  const receiptTime = Date.now();
  await receiveBatch(join(oldRoot, 'inbox'), legacyEnvelope, receiptTime);
  const receiver = join(snapshot, 'scripts/status-receive.mjs');
  const receiverEnv = { ...process.env, MORIIUM_STATUS_INBOX: join(newRoot, 'inbox') };
  delete receiverEnv.NODE_OPTIONS;
  const accepted = await run(process.execPath, [receiver], { cwd: base, env: receiverEnv, input: exact });
  check('receiver CLI accepts exact Runtime pending via stdin', accepted.code === 0);
  const oldManifest = await publishStatus({ root: oldRoot, config: publisherConfig, now: receiptTime + 500 });
  const manifest = await publishStatus({ root: newRoot, config: publisherConfig, now: Date.now() + 500 });
  assert.deepEqual(oldManifest.activity.sources, manifest.activity.sources);
  check('independent old/new receiver roots publish identical data hashes', oldManifest.activity.hash === manifest.activity.hash);
  const publishedFile = join(newRoot, 'public', 'activity', `${manifest.activity.hash}.json`);
  const publishedBytes = await readFile(publishedFile);
  check('publisher bytes match canonical Runtime data and manifest hash', publishedBytes.equals(Buffer.from(`${JSON.stringify(data)}\n`)) && hash(publishedBytes) === manifest.activity.hash);
  let fault = 'normal';
  const requests = [];
  server = createServer(async (request, response) => {
    try {
      requests.push(request.url);
      if (request.url === '/status-data/current.json') {
        if (fault === 'redirect') { response.writeHead(302, { Location: '/status-data/current.json' }); response.end(); return; }
        const current = JSON.parse(await readFile(join(newRoot, 'public', 'current.json'), 'utf8'));
        if (fault === 'stale') { current.generatedAt = new Date(Date.now() - 3600000).toISOString(); current.validUntil = new Date(Date.now() - 1000).toISOString(); }
        if (fault === 'outcomes') current.activity.sources.github.result = 'success';
        response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(`${JSON.stringify(current)}\n`); return;
      }
      const match = /^\/status-data\/activity\/([a-f0-9]{64})\.json$/.exec(request.url);
      if (!match) { response.writeHead(404); response.end(); return; }
      const bytes = await readFile(join(newRoot, 'public', 'activity', `${match[1]}.json`));
      response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(fault === 'hash' ? Buffer.concat([bytes, Buffer.from('\n')]) : bytes);
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const delivery = { sshExecutable: join(base, 'deliberately-missing-ssh.exe'), restrictedAlias: 'sandbox-only', curlExecutable: curl, publicOrigin: origin, observationSeconds: 0, retrySeconds: 3600 };
  async function observePending(name, pending, highWater, expected = false) {
    const config = await importState(name, JSON.parse(pending).data, pending, highWater, delivery);
    const result = await cli('retry-pending', config);
    const diagnostics = await cli('diagnostics', config);
    if (expected) {
      check(`${name}: actual curl observation acknowledges publication`, result.code === 2 && result.value.publicationObserved && !result.value.transportAttempted && !result.value.collectionAttempted && diagnostics.value.pending === null);
    } else {
      check(`${name}: unsafe observation retains exact pending`, !result.value.publicationObserved && diagnostics.value.pending?.exactPendingSha256 === hash(pending));
    }
    return config;
  }
  for (const kind of ['stale', 'hash', 'outcomes', 'redirect']) {
    fault = kind;
    await observePending(`C16-${kind}`, exact, 51);
  }
  fault = 'normal';
  const acknowledged = await observePending('C17-installed-observer', exact, 51, true);
  check('C17: copied executable and actual HTTP use only isolated roots', requests.length > 0 && requests.every(path => path.startsWith('/status-data/')));
  const rollback = join(base, 'rollback-export');
  assert.equal((await cli('migration-export-legacy', acknowledged, ['--output', rollback])).code, 0);
  assert.deepEqual(JSON.parse(await readFile(join(rollback, 'activity.json'), 'utf8')), data);
  check('C18 partial: rollback export carries latest high-water', JSON.parse(await readFile(join(rollback, 'sequence.json'), 'utf8')).sequence === 51);
  const inboxBefore = hash(await readFile(join(newRoot, 'inbox', 'pending.json')));
  for (const sequence of [51, 50]) {
    const duplicate = structuredClone(batch); duplicate.sequence = sequence; duplicate.data.sources.github.days[0].value++;
    const result = await run(process.execPath, [receiver], { cwd: base, env: receiverEnv, input: JSON.stringify(duplicate) });
    check(`C14: sequence ${sequence} exit zero does not replace inbox`, result.code === 0 && hash(await readFile(join(newRoot, 'inbox', 'pending.json'))) === inboxBefore);
  }
  const newer = structuredClone(batch); newer.sequence = 52; newer.data.sources.github.days[0].value++;
  await receiveBatch(join(newRoot, 'inbox'), newer);
  const newerManifest = await publishStatus({ root: newRoot, config: publisherConfig });
  check('C14: higher remote sequence changes public hash', newerManifest.activity.hash !== manifest.activity.hash);
  await observePending('C14-higher-remote', exact, 52);
  const regression = structuredClone(newer); regression.sequence = 53; regression.data.sources.github.days.pop();
  const regressionBytes = Buffer.from(`${JSON.stringify(regression, null, 2)}\r\n`);
  check('C15: receiver accepts historical-date loss candidate', await receiveBatch(join(newRoot, 'inbox'), regression));
  const rejected = await publishStatus({ root: newRoot, config: publisherConfig });
  check('C15: publisher preserves last complete data on date loss', rejected.activity.hash === newerManifest.activity.hash);
  await observePending('C15-refused-publication', regressionBytes, 53);
  const beforeSwitch = await readFile(join(newRoot, 'public', 'current.json'));
  const next = structuredClone(newer); next.sequence = 54; next.data.sources.github.days[0].value++;
  await receiveBatch(join(newRoot, 'inbox'), next);
  await assert.rejects(publishStatus({ root: newRoot, config: publisherConfig, beforeManifest: async () => { throw new Error('Synthetic switch interruption.'); } }));
  check('C16: interrupted manifest switch preserves previous public bytes', (await readFile(join(newRoot, 'public', 'current.json'))).equals(beforeSwitch));
  await observePending('C16-interrupted-switch', Buffer.from(`${JSON.stringify(next)}\n`), 54);
  const recovered = await publishStatus({ root: newRoot, config: publisherConfig });
  check('C16: publisher recovery completes new immutable version', recovered.activity.hash !== newerManifest.activity.hash);
  await observePending('C16-recovered-switch', Buffer.from(`${JSON.stringify(next)}\n`), 54, true);
  const rejectedOversize = await run(process.execPath, [receiver], { cwd: base, env: receiverEnv, input: Buffer.alloc(4 * 1024 * 1024 + 1, 0x20) });
  check('receiver rejects over-4-MiB stdin without replacing inbox', rejectedOversize.code !== 0 && JSON.parse(await readFile(join(newRoot, 'inbox', 'pending.json'), 'utf8')).batch.sequence === 54);
  for (const item of versions) check(`reference remained unchanged: ${item.path}`, hash(await readFile(join(sourceRoot, item.path))) === item.sha256);
  const report = { schemaVersion: 1, state: 'passed', scope: 'development_reference_receiver_partial_B4', checks, node: process.version, runtimeBinarySha256: hash(await readFile(executable)), fixtureSha256: hash(await readFile(fixtureFile)), pendingSha256: hash(exact), createdAt: batch.createdAt, referenceHead: head.stdout.trim(), referenceDirtyFiles: dirty.stdout.trim().split(/\r?\n/).filter(Boolean), referenceFiles: versions, limitations: ['No authenticated collectors or SSH transport.', 'No production endpoint, task, personal archive, or credential access.', 'C01-C18 complete comparison/cutover/rollback and UI acceptance remain pending.', 'Reference modules and receiver CLI are copied development inputs, not Runtime dependencies.'] };
  if (options.has('--report')) await writeFile(options.get('--report'), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (server) { server.closeAllConnections(); await new Promise(accept => server.close(accept)); }
  const resolved = resolve(base);
  assert(basename(resolved).startsWith('enouia-b4-') && !relative(resolve(tmpdir()), resolved).startsWith('..') && dirname(resolved) === resolve(tmpdir()), 'Unsafe cleanup path.');
  assert(!sourceRoot.startsWith(resolved + sep), 'Reference root overlaps cleanup.');
  await rm(resolved, { recursive: true, force: true });
}
