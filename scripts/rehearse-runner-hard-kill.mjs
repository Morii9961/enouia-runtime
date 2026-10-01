// Actual release-runner death with ready synthetic tool/descendant processes.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { copyFile, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, delimiter, dirname, isAbsolute, join, resolve } from 'node:path';

const [binaryArgument, toolsArgument, curlArgument, reportArgument, ...extra] = process.argv.slice(2);
assert(process.platform === 'win32' && !extra.length && [binaryArgument, toolsArgument, curlArgument, reportArgument].every(value => value && isAbsolute(value)), 'Supply absolute Windows release runner, fixture tools, curl and new report paths.');
const binarySource = await realpath(binaryArgument); const toolsSource = await realpath(toolsArgument); const curl = await realpath(curlArgument);
const sha = bytes => createHash('sha256').update(bytes).digest('hex'); const checks = [];
function check(name, condition) { assert(condition, name); checks.push(name); }
function start(executable, args, cwd, environment) {
  const child = spawn(executable, args, { cwd, env: environment, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const out = []; const err = []; let length = 0; let fault;
  const result = new Promise((accept, reject) => {
    const timer = setTimeout(() => { fault = new Error('Runner-death subprocess exceeded deadline.'); child.kill(); }, 12000);
    for (const [stream, chunks] of [[child.stdout, out], [child.stderr, err]]) stream.on('data', chunk => { length += chunk.length; if (length > 128 * 1024) { fault = new Error('Runner-death output exceeded bound.'); child.kill(); } else chunks.push(chunk); });
    child.on('error', () => { clearTimeout(timer); reject(new Error('Runner-death subprocess unavailable.')); });
    child.on('close', code => { clearTimeout(timer); if (fault) reject(fault); else accept({ code, stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(err).toString('utf8') }); });
  });
  return { child, result };
}
async function treeHash(root) {
  const entries = [];
  async function visit(directory, prefix) {
    for (const item of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      assert(!item.isSymbolicLink(), 'Unexpected link in synthetic state.');
      const path = join(directory, item.name);
      if (item.isDirectory()) await visit(path, `${prefix}${item.name}/`); else if (item.isFile()) entries.push([`${prefix}${item.name}`, sha(await readFile(path))]);
    }
  }
  await visit(root, ''); return sha(JSON.stringify(entries));
}
async function waitMarker(path) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    try { return JSON.parse(await readFile(path, 'utf8')); } catch {}
    await new Promise(accept => setTimeout(accept, 10));
  }
  throw new Error('Synthetic collector did not become ready.');
}
async function watchReady(child) {
  return new Promise((accept, reject) => {
    let bytes = ''; const timer = setTimeout(() => reject(new Error('Process observer unavailable.')), 1500);
    child.stdout.on('data', chunk => { bytes += chunk.toString('utf8'); if (bytes.includes('\n')) { clearTimeout(timer); try { const first = JSON.parse(bytes.split('\n')[0]); assert(first.state === 'watching_owned_processes' && first.count === 3); accept(); } catch { reject(new Error('Unexpected process observation.')); } } });
    child.once('close', () => { clearTimeout(timer); reject(new Error('Process observer exited too early.')); });
  });
}
const base = await mkdtemp(join(tmpdir(), 'enouia-handback-')); let server;
try {
  await writeFile(join(base, 'ACTIVITY_SANDBOX_FIXTURE'), 'enouia-activity-isolated-handback-v1');
  const tools = join(base, 'tools'); const fixtures = join(base, 'fixtures'); const traces = join(base, 'traces'); const captures = join(base, 'captures');
  for (const path of [tools, fixtures, traces, captures]) await mkdir(path);
  for (const role of ['gh', 'codex', 'ssh', 'descendant', 'watch']) await copyFile(toolsSource, join(tools, `${role}.exe`));
  const fixtureFiles = [];
  for (const [name, destination] of [['github-calendar-v1.json', 'github.json'], ['codex-usage-v1.json', 'codex.json'], ['moriium-public-data.json', 'archive.json']]) {
    const bytes = await readFile(new URL(`../tests/fixtures/activity/${name}`, import.meta.url)); await writeFile(join(fixtures, destination), bytes); fixtureFiles.push({ path: `tests/fixtures/activity/${name}`, sha256: sha(bytes) });
  }
  const original = JSON.parse(await readFile(join(fixtures, 'archive.json'), 'utf8'));
  const at = '2026-09-26T08:10:00.000Z';
  const pendingBytes = Buffer.from(`${JSON.stringify({ version: 1, producer: 'morii-workstation', sequence: 42, createdAt: at, sources: Object.fromEntries(['github', 'codex', 'claude'].map(id => [id, { attemptedAt: at, result: 'failed' }])), data: original })}\n`);
  const environment = {};
  for (const name of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'PATHEXT', 'COMSPEC']) if (process.env[name]) environment[name] = process.env[name];
  Object.assign(environment, { PATH: [tools, join(process.env.SystemRoot, 'System32')].join(delimiter), HOME: base, USERPROFILE: base, APPDATA: join(base, 'profile-roaming'), LOCALAPPDATA: join(base, 'profile-local'), ENOU_TEST_ROOT: base, ENOU_TEST_DESCENDANT: join(tools, 'descendant.exe'), ENOU_TEST_CAPTURES: captures, ENOU_TEST_TRANSPORT: 'before_receipt' });
  const requests = []; server = createServer((request, response) => { requests.push(request.url); response.writeHead(404); response.end(); });
  await new Promise((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept); });
  const executable = join(base, 'installed', 'enouia-activity.exe'); await mkdir(dirname(executable)); await copyFile(binarySource, executable);
  const cases = [];
  for (const role of ['gh', 'codex', 'ssh']) {
    const root = join(base, `state-${role}`); const seed = join(base, `seed-${role}`); await mkdir(root); await mkdir(seed);
    await writeFile(join(seed, 'activity.json'), JSON.stringify(original)); await writeFile(join(seed, 'sequence.json'), '{"sequence":50}'); if (role === 'ssh') await writeFile(join(seed, 'pending.json'), pendingBytes);
    const config = join(base, `config-${role}.json`);
    await writeFile(config, JSON.stringify({ version: 1, mode: 'sandbox', dataRoot: root, deliveryEnabled: role === 'ssh', maxRunSeconds: 60, github: { executable: join(tools, 'gh.exe'), login: 'synthetic-user' }, codex: { executable: join(tools, 'codex.exe') }, ...(role === 'ssh' ? { delivery: { sshExecutable: join(tools, 'ssh.exe'), restrictedAlias: 'sandbox-handback', curlExecutable: curl, publicOrigin: `http://127.0.0.1:${server.address().port}`, observationSeconds: 0, retrySeconds: 3600 } } : {}) }));
    async function runtime(command, more = []) { const result = await start(executable, [command, ...more, '--config', config], base, environment).result; assert.equal(result.stderr, ''); assert(!result.stdout.includes(base)); return { code: result.code, value: JSON.parse(result.stdout) }; }
    check(`${role}: paused synthetic import at high-water 50`, (await runtime('migration-import', ['--bundle', seed, '--high-water', '50'])).code === 0);
    assert.equal((await runtime('set-paused', ['false'])).code, 0);
    const before = await runtime('diagnostics'); const beforeTree = await treeHash(root);
    environment.ENOU_TEST_LINGER = role;
    const running = start(executable, [role === 'ssh' ? 'retry-pending' : 'sync', '--config', config], base, environment);
    let watcher;
    try {
      await writeFile(join(traces, `owned-${running.child.pid}`), 'owned fixture');
      const marker = await waitMarker(join(traces, `linger-${role}.json`));
      check(`${role}: live Runtime holds the single-writer OS lock`, (await runtime('diagnostics')).code === 3);
      watcher = start(join(tools, 'watch.exe'), [running.child.pid, marker.parentPid, marker.childPid].map(String), base, environment);
      await watchReady(watcher.child);
      assert(running.child.kill(), 'Cannot kill owned Runtime child.');
      check(`${role}: release Runtime is forcibly terminated`, (await running.result).code !== 0);
      const watched = await watcher.result;
      check(`${role}: Runtime/tool/grandchild live handles all signal within bound`, watched.code === 0 && watched.stderr === '' && JSON.parse(watched.stdout.trim().split('\n').at(-1)).state === 'all_owned_processes_terminated');
    } finally {
      if (running.child.exitCode === null && running.child.signalCode === null) running.child.kill();
      await running.result;
      if (watcher) { if (watcher.child.exitCode === null && watcher.child.signalCode === null) watcher.child.kill(); await watcher.result; }
    }
    const after = await runtime('diagnostics');
    check(`${role}: restart acquires lock with unchanged pending identity`, after.code === 0 && after.value.paused === false && (role === 'ssh' ? after.value.pending.exactPendingSha256 === sha(pendingBytes) : after.value.pending === null));
    check(`${role}: killed invocation changed no committed state bytes`, await treeHash(root) === beforeTree);
    environment.ENOU_TEST_LINGER = 'none';
    const resumed = await runtime(role === 'ssh' ? 'retry-pending' : 'sync');
    check(`${role}: retry/collection resumes at the correct sequence`, resumed.code === 4 && resumed.value.sequence === (role === 'ssh' ? 42 : 51) && resumed.value.collectionAttempted === (role !== 'ssh'));
    if (role === 'ssh') {
      const sent = await Promise.all((await readdir(captures)).map(name => readFile(join(captures, name))));
      check('ssh: killed and subsequent retries send the exact original bytes', sent.length === 2 && sent.every(bytes => bytes.equals(pendingBytes)) && (await runtime('diagnostics')).value.pending.exactPendingSha256 === sha(pendingBytes));
    } else check(`${role}: post-kill complete collection retains failed Claude and succeeds other sources`, resumed.value.sourceFailures === 1 && (await runtime('diagnostics')).value.pending.sequence === 51);
    cases.push({ role, highWater: 50, processesObserved: 3, ownedProcessHandlesSignalled: true, committedTreeBeforeSha256: beforeTree, committedTreeUnchangedAfterKill: true, pendingBeforeSha256: before.value.pending?.exactPendingSha256 ?? null, pendingAfterSha256: after.value.pending?.exactPendingSha256 ?? null, resumed: resumed.value });
  }
  const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), state: 'passed', scope: 'actual_release_runner_death_during_ready_synthetic_tools', node: process.version, binarySha256: sha(await readFile(executable)), fixtureToolsSha256: sha(await readFile(toolsSource)), harnessSha256: sha(await readFile(new URL(import.meta.url))), fixtureToolSourceSha256: sha(await readFile(new URL('../crates/enouia-activity-runner/examples/sandbox_tools.rs', import.meta.url))), fixtureFiles, checks, cases, limitations: ['Only owned synthetic gh/Codex/SSH/descendant processes are used; no authenticated capability.', 'Watcher retains synchronization-only Windows process handles before the kill, avoiding PID-reuse inference.', 'Tests wait for ready tool descendants; the interval between process creation and job assignment is not exercised.', 'No production tasks, real SSH, public publication, disk-full, power loss or full B4 sign-off.'] };
  await writeFile(reportArgument, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' }); console.log(JSON.stringify({ state: report.state, checks: checks.length, cases: cases.length, watchedProcesses: 9 }));
} finally {
  if (server) { server.closeAllConnections(); await new Promise(accept => server.close(accept)); }
  const full = resolve(base); assert(dirname(full) === resolve(tmpdir()) && basename(full).startsWith('enouia-handback-'), 'Unsafe runner-death cleanup.'); await rm(full, { recursive: true, force: true });
}
