// Optional B4 subprocess rehearsal. All stores/tools/endpoints are synthetic and isolated.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { copyFile, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, delimiter, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const [referenceArgument, binaryArgument, toolsArgument, curlArgument, reportArgument, ...extra] = process.argv.slice(2);
assert(!extra.length && [referenceArgument, binaryArgument, toolsArgument, curlArgument, reportArgument].every(value => value && isAbsolute(value)), 'Supply absolute reference, release runner, fixture tools, curl, and new report paths.');
const reference = await realpath(referenceArgument);
const binarySource = await realpath(binaryArgument);
const toolsSource = await realpath(toolsArgument);
const curl = await realpath(curlArgument);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const checks = [];
function check(name, condition) { assert(condition, name); checks.push(name); }
async function run(executable, args, cwd, env, input) {
  return new Promise((accept, reject) => {
    const child = spawn(executable, args, { cwd, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const out = []; const err = []; let size = 0; let fault;
    const stop = () => { fault = new Error('Isolated handback subprocess exceeded time/output bound.'); child.kill(); };
    const timer = setTimeout(stop, 30000);
    for (const [stream, chunks] of [[child.stdout, out], [child.stderr, err]]) stream.on('data', chunk => { size += chunk.length; if (size > 256 * 1024) stop(); else chunks.push(chunk); });
    child.on('error', () => { clearTimeout(timer); reject(new Error('Isolated handback subprocess unavailable.')); });
    child.stdin.on('error', () => {});
    child.on('close', code => { clearTimeout(timer); if (fault) reject(fault); else accept({ code, stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(err).toString('utf8') }); });
    child.stdin.end(input);
  });
}
async function treeHash(root) {
  const files = [];
  async function visit(directory) {
    for (const item of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(directory, item.name);
      assert(!item.isSymbolicLink(), 'Unexpected link inside synthetic state.');
      if (item.isDirectory()) await visit(path); else if (item.isFile()) files.push([path.slice(root.length), sha(await readFile(path))]);
    }
  }
  await visit(root); return sha(JSON.stringify(files));
}
const base = await mkdtemp(join(tmpdir(), 'enouia-handback-'));
let server;
try {
  await writeFile(join(base, 'ACTIVITY_SANDBOX_FIXTURE'), 'enouia-activity-isolated-handback-v1');
  const referenceFiles = ['scripts/activity-sync.mjs', 'scripts/refresh-activity.mjs', 'scripts/collect-activity.mjs', 'scripts/lib/activity-import.ts', 'scripts/lib/codex-usage.ts', 'scripts/lib/cowork.ts', 'scripts/status-receive.mjs', 'scripts/status-publish.mjs', 'scripts/lib/status-store.mjs', 'scripts/lib/status-batch.mjs', 'src/lib/activity.ts', 'src/lib/status.ts'];
  const snapshot = join(base, 'reference'); const sourceHashes = [];
  const head = await run('git', ['-C', reference, 'rev-parse', 'HEAD'], base, process.env);
  const dirty = await run('git', ['-C', reference, 'status', '--porcelain', '--', ...referenceFiles], base, process.env);
  assert(head.code === 0 && dirty.code === 0, 'Cannot record reference provenance.');
  for (const name of referenceFiles) {
    const source = join(reference, name); const destination = join(snapshot, name);
    assert(!(await lstat(source)).isSymbolicLink() && (await realpath(source)).startsWith(reference + sep), 'Reference escaped its checkout.');
    const bytes = await readFile(source); await mkdir(dirname(destination), { recursive: true }); await writeFile(destination, bytes, { flag: 'wx' });
    sourceHashes.push({ path: name, sha256: sha(bytes) });
  }
  const { validateBatch } = await import(pathToFileURL(join(snapshot, 'scripts/lib/status-batch.mjs')));
  const publisherRoot = join(base, 'publisher'); const inbox = join(publisherRoot, 'inbox'); const captures = join(base, 'captures'); const traces = join(base, 'traces'); const tools = join(base, 'tools');
  for (const path of [inbox, captures, traces, tools]) await mkdir(path, { recursive: true });
  for (const role of ['gh', 'codex', 'ssh']) await copyFile(toolsSource, join(tools, `${role}.exe`));
  const fixtureHashes = [];
  const readFixture = async name => { const bytes = await readFile(new URL(`../tests/fixtures/activity/${name}`, import.meta.url)); fixtureHashes.push({ path: `tests/fixtures/activity/${name}`, sha256: sha(bytes) }); return bytes; };
  await mkdir(join(base, 'fixtures'));
  await writeFile(join(base, 'fixtures', 'github.json'), await readFixture('github-calendar-v1.json'));
  await writeFile(join(base, 'fixtures', 'codex.json'), await readFixture('codex-usage-v1.json'));
  await writeFile(join(base, 'fixtures', 'claude.json'), await readFixture('claude-stores-v1.json'));
  const data = JSON.parse(await readFixture('moriium-public-data.json'));
  const profile = join(base, 'profile'); const normal = join(profile, 'normal', '.claude'); const roaming = join(profile, 'roaming'); const local = join(profile, 'local'); const cowork = join(roaming, 'Claude', 'local-agent-mode-sessions', 'synthetic-task', '.claude');
  for (const store of [normal, cowork]) { await mkdir(join(store, 'projects', 'synthetic'), { recursive: true }); await writeFile(join(store, 'projects', 'synthetic', 'fixture.jsonl'), '{"synthetic":true}\n'); }
  await mkdir(join(local, 'Packages'), { recursive: true });
  const ccusage = join(tools, 'ccusage', 'src', 'cli.js'); await mkdir(dirname(ccusage), { recursive: true });
  await writeFile(join(tools, 'ccusage', 'package.json'), '{"name":"ccusage","version":"20.0.20","type":"module"}');
  await writeFile(ccusage, `import{readFileSync,realpathSync,writeFileSync}from'node:fs';import{join,sep}from'node:path';
const root=realpathSync(process.env.ENOU_TEST_ROOT);if(readFileSync(join(root,'ACTIVITY_SANDBOX_FIXTURE'),'utf8')!=='enouia-activity-isolated-handback-v1')throw Error('Not a fixture');
if(JSON.stringify(process.argv.slice(2))!==JSON.stringify(['claude','daily','--json','--offline','--timezone','Asia/Shanghai']))throw Error('Unexpected args');
const key=p=>realpathSync(p.startsWith(String.fromCharCode(92,92,63,92))?p.slice(4):p).toLowerCase();const store=key(process.env.CLAUDE_CONFIG_DIR);if(!store.startsWith(key(root)+sep))throw Error('Store escaped');
const index=store===key(process.env.ENOU_TEST_NORMAL)?0:store===key(process.env.ENOU_TEST_COWORK)?1:-1;if(index<0)throw Error('Unknown store');
writeFileSync(join(root,'traces','ccusage-'+process.pid+'-'+Date.now()),'fixture invocation');console.log(JSON.stringify(JSON.parse(readFileSync(join(root,'fixtures','claude.json'),'utf8'))[index]));\n`);
  const publisherWorker = join(base, 'publish.mjs');
  await writeFile(publisherWorker, `import{publishStatus}from${JSON.stringify(pathToFileURL(join(snapshot, 'scripts/status-publish.mjs')).href)};await publishStatus({root:process.env.MORIIUM_STATUS_ROOT,config:{version:1,sites:{moriium:null,gallery:null},runtimeEnabled:false}});\n`);
  // Child-only allowlist: no personal CLI/profile/auth environment is inherited.
  const environment = {};
  for (const name of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'PATHEXT', 'COMSPEC']) if (process.env[name]) environment[name] = process.env[name];
  Object.assign(environment, { PATH: [tools, dirname(process.execPath), join(process.env.SystemRoot, 'System32')].join(delimiter), USERPROFILE: profile, APPDATA: roaming, LOCALAPPDATA: local, CLAUDE_CONFIG_DIR: normal, ENOU_TEST_ROOT: base, ENOU_TEST_NODE: process.execPath, ENOU_TEST_RECEIVER: join(snapshot, 'scripts/status-receive.mjs'), ENOU_TEST_PUBLISHER: publisherWorker, ENOU_TEST_CAPTURES: captures, ENOU_TEST_NORMAL: normal, ENOU_TEST_COWORK: cowork, ENOU_TEST_TRANSPORT: 'before_receipt', MORIIUM_STATUS_ROOT: publisherRoot, MORIIUM_STATUS_INBOX: inbox, MORIIUM_CODEX_CLI: join(tools, 'codex.exe'), MORIIUM_CCUSAGE_CLI: ccusage });
  server = createServer(async (request, response) => {
    try {
      const match = /^\/status-data\/activity\/([a-f0-9]{64})\.json$/.exec(request.url);
      const path = request.url === '/status-data/current.json' ? join(publisherRoot, 'public', 'current.json') : match ? join(publisherRoot, 'public', 'activity', `${match[1]}.json`) : null;
      if (!path) { response.writeHead(404); response.end(); return; }
      const body = await readFile(path); response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(body);
    } catch { if (!response.headersSent) response.writeHead(404); response.end(); }
  });
  await new Promise((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept); });
  const executable = join(base, 'installed', 'enouia-activity.exe'); await mkdir(dirname(executable)); await copyFile(binarySource, executable);
  const runtimeRoot = join(base, 'runtime-state'); const legacySeed = join(base, 'seed'); await mkdir(runtimeRoot); await mkdir(legacySeed);
  const oldAt = '2026-09-26T08:10:00.000Z';
  const original = validateBatch({ version: 1, producer: 'morii-workstation', sequence: 42, createdAt: oldAt, sources: Object.fromEntries(['github', 'codex', 'claude'].map(id => [id, { attemptedAt: oldAt, result: 'failed' }])), data });
  const originalBytes = Buffer.from(`${JSON.stringify(original, null, 2)}\r\n`);
  await writeFile(join(legacySeed, 'activity.json'), JSON.stringify(data)); await writeFile(join(legacySeed, 'sequence.json'), '{"sequence":50}'); await writeFile(join(legacySeed, 'pending.json'), originalBytes);
  const config = join(base, 'runtime-config.json');
  await writeFile(config, JSON.stringify({ version: 1, mode: 'sandbox', dataRoot: runtimeRoot, deliveryEnabled: true, maxRunSeconds: 60, delivery: { sshExecutable: join(tools, 'ssh.exe'), restrictedAlias: 'sandbox-handback', curlExecutable: curl, publicOrigin: `http://127.0.0.1:${server.address().port}`, observationSeconds: 0, retrySeconds: 3600 }, github: { executable: join(tools, 'gh.exe'), login: 'synthetic-user' }, codex: { executable: join(tools, 'codex.exe') }, claude: { nodeExecutable: process.execPath, ccusageCli: ccusage, normalStore: normal, roamingClaude: join(roaming, 'Claude'), localPackages: join(local, 'Packages'), expectedStores: [normal, cowork] } }));
  async function cli(command, extra = []) {
    const result = await run(executable, [command, ...extra, '--config', config], base, environment);
    assert.equal(result.stderr, '', 'Runtime emitted raw errors.'); assert(!result.stdout.includes(base) && !result.stdout.includes('DO_NOT_EXPORT'), 'Runtime leaked fixture inputs.');
    return { code: result.code, value: JSON.parse(result.stdout) };
  }
  const sourceCalls = async () => (await readdir(traces)).filter(name => /^(gh|codex|ccusage)-/.test(name)).length;
  const captured = async () => Promise.all((await readdir(captures)).sort().map(async name => { const bytes = await readFile(join(captures, name)); return { sequence: JSON.parse(bytes).sequence, sha256: sha(bytes), bytes }; }));
  check('offline import preserves an old pending with skipped high-water', (await cli('migration-import', ['--bundle', legacySeed, '--high-water', '50'])).code === 0);
  check('initial pause blocks all collector/transport processes', (await cli('sync')).value.state === 'paused' && (await readdir(traces)).length === 0);
  assert.equal((await cli('set-paused', ['false'])).code, 0);
  const before = await cli('retry-pending');
  check('C13: before-receipt transport failure retains pending 42', before.code === 4 && !before.value.publicationObserved && (await cli('diagnostics')).value.pending.exactPendingSha256 === sha(originalBytes));
  const callsBefore = await sourceCalls(); const captureCount = (await captured()).length;
  environment.ENOU_TEST_TRANSPORT = 'none';
  const deferred = await cli('sync');
  check('C13: persisted retry wait prevents automatic send/collection', deferred.code === 3 && deferred.value.state === 'not_due' && (await captured()).length === captureCount && await sourceCalls() === callsBefore);
  environment.ENOU_TEST_TRANSPORT = 'after_receipt';
  const after = await cli('retry-pending');
  check('C13: public observation resolves a post-receipt nonzero transport exit', after.code === 2 && after.value.publicationObserved && !after.value.transportCompleted && !after.value.collectionAttempted && (await cli('diagnostics')).value.pending === null);
  const firstSends = await captured();
  check('C13: both retries send the exact original bytes and sequence', firstSends.length === 2 && firstSends.every(item => item.sequence === 42 && item.bytes.equals(originalBytes)));
  environment.ENOU_TEST_TRANSPORT = 'before_receipt';
  const newRun = await cli('sync');
  check('new Runtime collection advances past skipped reservations to 51', newRun.code === 4 && newRun.value.sequence === 51 && newRun.value.collectionAttempted && newRun.value.sourceFailures === 0);
  check('real gh/Codex process adapters and two-store Claude discovery ran', await sourceCalls() === callsBefore + 4);
  assert.equal((await cli('set-paused', ['true'])).code, 0);
  const exported = join(base, 'latest-export'); assert.equal((await cli('migration-export-legacy', ['--output', exported])).code, 0);
  const pendingBytes = await readFile(join(exported, 'pending.json')); const pending = JSON.parse(pendingBytes);
  const latest = JSON.parse(await readFile(join(exported, 'activity.json'), 'utf8'));
  check('C18: current export preserves sequence 51 and exact latest pending', pending.sequence === 51 && JSON.parse(await readFile(join(exported, 'sequence.json'), 'utf8')).sequence === 51 && (await captured()).find(item => item.sequence === 51).bytes.equals(pendingBytes));
  check('C18: successful Runtime corrections survive in latest export', latest.sources.github.days.find(day => day.date === '2026-09-25').value === 2 && latest.sources.claude.days.find(day => day.date === '2026-09-26').value === 1 && latest.sources.codex.days.some(day => day.date === '2026-09-24' && day.value === 1234567));
  const frozenRuntime = await treeHash(runtimeRoot); const frozenExport = await treeHash(exported);
  const oldWork = join(base, 'old-work'); await mkdir(oldWork);
  for (const name of ['activity.json', 'sequence.json', 'pending.json']) await copyFile(join(exported, name), join(oldWork, name));
  check('C18: handback starts from byte-identical latest trio', (await readFile(join(oldWork, 'pending.json'))).equals(pendingBytes));
  const oldConfig = join(oldWork, 'config.json'); await writeFile(oldConfig, '{"sshAlias":"sandbox-handback"}');
  environment.ENOU_TEST_TRANSPORT = 'none'; environment.MORIIUM_ACTIVITY_WORK = oldWork; environment.MORIIUM_ACTIVITY_SYNC_CONFIG = oldConfig;
  const oldRun = await run(process.execPath, [join(snapshot, 'scripts/activity-sync.mjs')], base, environment);
  check('C18: actual old sync program replays pending and collects successfully', oldRun.code === 0);
  const oldState = JSON.parse(await readFile(join(oldWork, 'sequence.json'), 'utf8'));
  const finalInbox = JSON.parse(await readFile(join(inbox, 'pending.json'), 'utf8'));
  const manifest = JSON.parse(await readFile(join(publisherRoot, 'public', 'current.json'), 'utf8'));
  const published = JSON.parse(await readFile(join(publisherRoot, 'public', 'activity', `${manifest.activity.hash}.json`), 'utf8'));
  check('C18: old writer advances to 52, receiver and publisher agree', oldState.sequence === 52 && finalInbox.batch.sequence === 52 && JSON.parse(await readFile(join(publisherRoot, 'state.json'), 'utf8')).sequence === 52);
  for (const id of ['github', 'codex', 'claude']) {
    assert.deepEqual(published.sources[id].days, latest.sources[id].days); assert.equal(published.sources[id].metric, latest.sources[id].metric); assert.equal(published.sources[id].timezone, latest.sources[id].timezone);
    check(`C18: handback preserves ${id} history and advances success time`, Date.parse(published.sources[id].updatedAt) >= Date.parse(latest.sources[id].updatedAt) && manifest.activity.sources[id].result === 'success');
  }
  const sends = await captured(); const oldReplay = sends.filter(item => item.sequence === 51);
  check('C18: old pending replay keeps batch semantics/sequence', oldReplay.length === 2 && JSON.stringify(validateBatch(JSON.parse(oldReplay[0].bytes))) === JSON.stringify(validateBatch(JSON.parse(oldReplay[1].bytes))));
  check('C18: old writer cleared its own pending after successful send', !(await readdir(oldWork)).includes('pending.json'));
  check('C18: old manual work never modifies frozen Runtime or export', await treeHash(runtimeRoot) === frozenRuntime && await treeHash(exported) === frozenExport);
  const sendCount = sends.length; const paused = await cli('sync');
  check('C18: retained Runtime remains paused with no competing send', paused.code === 3 && paused.value.state === 'paused' && (await captured()).length === sendCount);
  const lastOld = await run(process.execPath, [join(snapshot, 'scripts/activity-sync.mjs')], base, environment);
  check('C18: subsequent actual old run advances safely again', lastOld.code === 0 && JSON.parse(await readFile(join(oldWork, 'sequence.json'), 'utf8')).sequence === 53 && JSON.parse(await readFile(join(inbox, 'pending.json'), 'utf8')).batch.sequence === 53);
  check('Runtime stays byte-frozen through both old manual runs', await treeHash(runtimeRoot) === frozenRuntime);
  for (const source of sourceHashes) check(`reference unchanged: ${source.path}`, sha(await readFile(join(reference, source.path))) === source.sha256);
  const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), state: 'passed', scope: 'isolated_subprocess_handback_partial_B4', node: process.version, binarySha256: sha(await readFile(executable)), fixtureToolsSha256: sha(await readFile(toolsSource)), harnessSha256: sha(await readFile(new URL(import.meta.url))), fixtureToolSourceSha256: sha(await readFile(new URL('../crates/enouia-activity-runner/examples/sandbox_tools.rs', import.meta.url))), referenceHead: head.stdout.trim(), referenceDirtyFiles: dirty.stdout.trim().split(/\r?\n/).filter(Boolean), referenceFiles: sourceHashes, fixtureFiles: fixtureHashes, checks, originalPendingSha256: sha(originalBytes), latestPendingSha256: sha(pendingBytes), wireAttempts: (await captured()).map(({ sequence, sha256 }) => ({ sequence, sha256 })), runtimeFrozenTreeSha256: frozenRuntime, exportFrozenTreeSha256: frozenExport, latestSources: latest.sources, finalSources: published.sources, finalSequence: 53, limitations: ['SSH/gh/Codex/ccusage endpoints are marked synthetic tools; no real authentication or network transport.', 'Actual copied old sync/refresh/collector and reference receiver/publisher run as processes.', 'Legacy upload normalizes/re-serializes pending JSON; original export bytes remain unchanged.', 'The fake ccusage normalizes Windows extended store paths; real pinned ccusage path compatibility remains unverified.', 'No production task activation, real power loss, scheduled handback, or three-language UI acceptance.'] };
  await writeFile(reportArgument, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({ state: report.state, checks: checks.length, finalSequence: 53, wireSequences: report.wireAttempts.map(item => item.sequence) }));
} finally {
  if (server) { server.closeAllConnections(); await new Promise(accept => server.close(accept)); }
  const full = resolve(base); assert(dirname(full) === resolve(tmpdir()) && basename(full).startsWith('enouia-handback-'), 'Unsafe handback cleanup path.');
  await rm(full, { recursive: true, force: true });
}
