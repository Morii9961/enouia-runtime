// Optional real reference-publisher death/recovery rehearsal on synthetic loopback state.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { copyFile, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, delimiter, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const [referenceArgument, binaryArgument, curlArgument, reportArgument, ...extra] = process.argv.slice(2);
assert(!extra.length && [referenceArgument, binaryArgument, curlArgument, reportArgument].every(value => value && isAbsolute(value)), 'Supply absolute reference checkout, release runner, curl and new report paths.');
const reference = await realpath(referenceArgument); const binarySource = await realpath(binaryArgument); const curl = await realpath(curlArgument);
const sha = bytes => createHash('sha256').update(bytes).digest('hex'); const checks = [];
function check(name, condition) { assert(condition, name); checks.push(name); }
async function run(executable, args, cwd, environment, input) {
  return new Promise((accept, reject) => {
    const child = spawn(executable, args, { cwd, env: environment, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const out = []; const err = []; let bytes = 0; let fault;
    const stop = () => { fault = new Error('Publisher rehearsal process exceeded bounds.'); child.kill(); };
    const timer = setTimeout(stop, 10000);
    for (const [stream, chunks] of [[child.stdout, out], [child.stderr, err]]) stream.on('data', chunk => { bytes += chunk.length; if (bytes > 128 * 1024) stop(); else chunks.push(chunk); });
    child.on('error', () => { clearTimeout(timer); reject(new Error('Publisher rehearsal subprocess unavailable.')); });
    child.stdin.on('error', () => {}); child.stdin.end(input);
    child.on('close', code => { clearTimeout(timer); if (fault) reject(fault); else accept({ code, stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(err).toString('utf8') }); });
  });
}
async function killPublisher(worker, cwd, environment) {
  const child = spawn(process.execPath, [worker, 'interrupt'], { cwd, env: environment, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let acceptReady; let rejectReady; let acceptClosed; let text = '';
  const ready = new Promise((accept, reject) => { acceptReady = accept; rejectReady = reject; });
  const closed = new Promise(accept => { acceptClosed = accept; });
  const stop = () => { rejectReady(new Error('Publisher did not reach the manifest boundary.')); child.kill(); };
  const timer = setTimeout(stop, 10000);
  child.on('error', stop); child.stderr.on('data', stop);
  child.stdout.on('data', chunk => { text += chunk.toString('utf8'); if (text.length > 4096) stop(); else if (text.includes('\n')) { try { acceptReady(JSON.parse(text.trim())); } catch { stop(); } } });
  child.on('close', code => { clearTimeout(timer); rejectReady(new Error('Publisher exited before the requested kill.')); acceptClosed(code); });
  try {
    const marker = await ready;
    assert(marker.state === 'before_manifest' && marker.pid === child.pid, 'Unexpected publisher identity.');
    assert(child.kill(), 'Cannot kill owned publisher child.'); assert.notEqual(await closed, 0, 'Publisher exited normally.');
    return { pid: child.pid, forcedTermination: true };
  } finally { clearTimeout(timer); if (child.exitCode === null && child.signalCode === null) child.kill(); await closed; }
}
const base = await mkdtemp(join(tmpdir(), 'enouia-publisher-crash-')); let server;
try {
  const paths = ['scripts/status-receive.mjs', 'scripts/status-publish.mjs', 'scripts/lib/status-store.mjs', 'scripts/lib/status-batch.mjs', 'src/lib/activity.ts', 'src/lib/status.ts'];
  const snapshot = join(base, 'reference'); const provenance = [];
  const head = await run('git', ['-C', reference, 'rev-parse', 'HEAD'], base, process.env);
  const dirty = await run('git', ['-C', reference, 'status', '--porcelain', '--', ...paths], base, process.env);
  assert(head.code === 0 && dirty.code === 0, 'Cannot record reference provenance.');
  for (const path of paths) {
    const source = join(reference, path); assert(!(await lstat(source)).isSymbolicLink() && (await realpath(source)).startsWith(reference + sep), 'Reference file escaped checkout.');
    const bytes = await readFile(source); const destination = join(snapshot, path); await mkdir(dirname(destination), { recursive: true }); await writeFile(destination, bytes, { flag: 'wx' }); provenance.push({ path, sha256: sha(bytes) });
  }
  const { validateBatch } = await import(pathToFileURL(join(snapshot, 'scripts/lib/status-batch.mjs')));
  const fixture = await readFile(new URL('../tests/fixtures/activity/moriium-public-data.json', import.meta.url)); const original = JSON.parse(fixture);
  const publisherRoot = join(base, 'publisher'); const inbox = join(publisherRoot, 'inbox'); await mkdir(inbox, { recursive: true });
  const worker = join(base, 'publish.mjs');
  await writeFile(worker, `import{publishStatus}from${JSON.stringify(pathToFileURL(join(snapshot, 'scripts/status-publish.mjs')).href)};await publishStatus({root:process.env.MORIIUM_STATUS_ROOT,config:{version:1,sites:{moriium:null,gallery:null},runtimeEnabled:false},beforeManifest:process.argv[2]==='interrupt'?async()=>{console.log(JSON.stringify({state:'before_manifest',pid:process.pid}));setInterval(()=>{},1000);await new Promise(()=>{});}:async()=>{}});\n`);
  const environment = {};
  for (const name of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'PATHEXT', 'COMSPEC']) if (process.env[name]) environment[name] = process.env[name];
  Object.assign(environment, { PATH: [dirname(process.execPath), join(process.env.SystemRoot, 'System32')].join(delimiter), HOME: base, USERPROFILE: base, APPDATA: join(base, 'profile-roaming'), LOCALAPPDATA: join(base, 'profile-local'), MORIIUM_STATUS_ROOT: publisherRoot, MORIIUM_STATUS_INBOX: inbox });
  const receive = async batch => { const result = await run(process.execPath, [join(snapshot, 'scripts/status-receive.mjs')], base, environment, JSON.stringify(batch)); assert.equal(result.code, 0, 'Synthetic receiver CLI refused valid batch.'); };
  const publish = () => run(process.execPath, [worker], base, environment);
  const oldAt = '2026-09-26T08:00:00.000Z';
  function batch(sequence, data, attemptedAt, githubSuccess) {
    return validateBatch({ version: 1, producer: 'morii-workstation', sequence, createdAt: attemptedAt, sources: Object.fromEntries(['github', 'codex', 'claude'].map(id => [id, { attemptedAt, result: githubSuccess && id === 'github' ? 'success' : 'failed' }])), data });
  }
  await receive(batch(50, original, oldAt, false)); check('actual receiver/publisher seed a complete sequence-50 public snapshot', (await publish()).code === 0);
  const requests = [];
  server = createServer(async (request, response) => {
    try {
      requests.push(request.url);
      const match = /^\/status-data\/activity\/([a-f0-9]{64})\.json$/.exec(request.url);
      const path = request.url === '/status-data/current.json' ? join(publisherRoot, 'public', 'current.json') : match ? join(publisherRoot, 'public', 'activity', `${match[1]}.json`) : null;
      if (!path) { response.writeHead(404); response.end(); return; }
      const body = await readFile(path); response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(body);
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept); });
  const executable = join(base, 'installed', 'enouia-activity.exe'); await mkdir(dirname(executable)); await copyFile(binarySource, executable);
  const cases = [];
  for (const sequence of [51, 52]) {
    const priorManifest = await readFile(join(publisherRoot, 'public', 'current.json')); const prior = JSON.parse(priorManifest);
    const priorData = await readFile(join(publisherRoot, 'public', 'activity', `${prior.activity.hash}.json`));
    const data = structuredClone(original); const at = `2026-09-26T08:${sequence === 51 ? '10' : '20'}:00.000Z`;
    data.sources.github.updatedAt = at; data.sources.github.days[0].value = sequence === 51 ? 2 : 3;
    const candidate = batch(sequence, data, at, true); const pendingBytes = Buffer.from(`${JSON.stringify(candidate)}\n`); const expectedHash = sha(`${JSON.stringify(candidate.data)}\n`);
    await receive(candidate); const terminated = await killPublisher(worker, base, environment);
    check(`${sequence}: killed publisher leaves prior public manifest byte-exact`, (await readFile(join(publisherRoot, 'public', 'current.json'))).equals(priorManifest));
    check(`${sequence}: prior immutable bytes remain exact`, (await readFile(join(publisherRoot, 'public', 'activity', `${prior.activity.hash}.json`))).equals(priorData));
    const state = JSON.parse(await readFile(join(publisherRoot, 'state.json'), 'utf8'));
    check(`${sequence}: new complete state/data exist before manifest switch`, state.sequence === sequence && state.activity.hash === expectedHash && sha(await readFile(join(publisherRoot, 'public', 'activity', `${expectedHash}.json`))) === expectedHash);
    const lockPath = join(publisherRoot, 'publisher.lock'); const abandonedLock = await readFile(lockPath, 'utf8');
    check(`${sequence}: abandoned lock belongs to the already terminated owned child`, abandonedLock === String(terminated.pid));
    const blocked = await publish();
    check(`${sequence}: restart refuses abandoned lock without auto-reclamation`, blocked.code !== 0 && (await readFile(lockPath, 'utf8')) === abandonedLock && (await readFile(join(publisherRoot, 'public', 'current.json'))).equals(priorManifest));
    const root = join(base, `runtime-${sequence}`); const seed = join(base, `seed-${sequence}`); await mkdir(root); await mkdir(seed);
    await writeFile(join(seed, 'activity.json'), JSON.stringify(candidate.data)); await writeFile(join(seed, 'sequence.json'), JSON.stringify({ sequence })); await writeFile(join(seed, 'pending.json'), pendingBytes);
    const config = join(base, `config-${sequence}.json`);
    await writeFile(config, JSON.stringify({ version: 1, mode: 'sandbox', dataRoot: root, deliveryEnabled: true, maxRunSeconds: 60, delivery: { sshExecutable: join(base, 'unavailable-ssh.exe'), restrictedAlias: 'fixture-only', curlExecutable: curl, publicOrigin: `http://127.0.0.1:${server.address().port}`, observationSeconds: 0, retrySeconds: 3600 } }));
    async function runtime(command, more = []) { const result = await run(executable, [command, ...more, '--config', config], base, environment); assert.equal(result.stderr, ''); assert(!result.stdout.includes(base)); return { code: result.code, value: JSON.parse(result.stdout) }; }
    check(`${sequence}: paused import preserves killed-publisher candidate`, (await runtime('migration-import', ['--bundle', seed, '--high-water', String(sequence)])).code === 0);
    assert.equal((await runtime('set-paused', ['false'])).code, 0);
    const requestCount = requests.length; const stale = await runtime('retry-pending');
    check(`${sequence}: actual curl reads old manifest and retains exact unresolved pending`, !stale.value.publicationObserved && !stale.value.collectionAttempted && requests.length > requestCount && (await runtime('diagnostics')).value.pending.exactPendingSha256 === sha(pendingBytes));
    // This is an explicit test-only operator action after child termination and lock ownership checks.
    assert((await realpath(lockPath)).startsWith((await realpath(base)) + sep)); await unlink(lockPath);
    check(`${sequence}: explicit sandbox lock reconciliation permits actual publisher recovery`, (await publish()).code === 0 && !(await readdir(publisherRoot)).includes('publisher.lock'));
    const recovered = JSON.parse(await readFile(join(publisherRoot, 'public', 'current.json'), 'utf8'));
    check(`${sequence}: recovered manifest selects exact completed data/outcomes`, recovered.activity.hash === expectedHash && JSON.stringify(recovered.activity.sources) === JSON.stringify(candidate.sources));
    const observed = await runtime('retry-pending');
    check(`${sequence}: actual Runtime observes recovered publication without SSH/new collection`, observed.code === 2 && observed.value.publicationObserved && !observed.value.transportAttempted && !observed.value.collectionAttempted && (await runtime('diagnostics')).value.pending === null);
    check(`${sequence}: recovery retains every original daily date and prior immutable data`, ['github', 'codex', 'claude'].every(id => original.sources[id].days.every(day => candidate.data.sources[id].days.some(next => next.date === day.date))) && (await readFile(join(publisherRoot, 'public', 'activity', `${prior.activity.hash}.json`))).equals(priorData));
    cases.push({ sequence, forcedTermination: true, oldPublicHash: prior.activity.hash, newPublicHash: expectedHash, exactPendingSha256: sha(pendingBytes), staleObservation: stale.value, recoveredObservation: observed.value, orphanStateSequence: state.sequence, abandonedLockRefused: true, explicitSandboxLockReconciliation: true });
  }
  for (const entry of provenance) check(`reference unchanged: ${entry.path}`, sha(await readFile(join(reference, entry.path))) === entry.sha256);
  const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), state: 'passed', scope: 'actual_reference_publisher_process_death_partial_C16', node: process.version, binarySha256: sha(await readFile(executable)), harnessSha256: sha(await readFile(new URL(import.meta.url))), fixtureSha256: sha(fixture), referenceHead: head.stdout.trim(), referenceDirtyFiles: dirty.stdout.trim().split(/\r?\n/).filter(Boolean), referenceFiles: provenance, checks, cases, limitations: ['Actual copied publisher process is killed at its beforeManifest hook, after state/data writes.', 'Abandoned lock is explicitly removed only in the synthetic sandbox after the owned child has exited; no production lock recovery is automated.', 'HTTP is an ephemeral static loopback server and SSH is unavailable by construction.', 'Windows process death is not deployed Linux service behavior, power loss, disk-full, or full B4/production acceptance.'] };
  await writeFile(reportArgument, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' }); console.log(JSON.stringify({ state: report.state, checks: checks.length, publisherKills: cases.length }));
} finally {
  if (server) { server.closeAllConnections(); await new Promise(accept => server.close(accept)); }
  const full = resolve(base); assert(dirname(full) === resolve(tmpdir()) && basename(full).startsWith('enouia-publisher-crash-'), 'Unsafe publisher rehearsal cleanup.'); await rm(full, { recursive: true, force: true });
}
