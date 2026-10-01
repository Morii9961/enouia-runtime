// Optional local capability check: real pinned ccusage, synthetic transcripts only.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, delimiter, dirname, isAbsolute, join, resolve, sep } from 'node:path';

const [modulesArgument, runnerArgument, reportArgument, ...extra] = process.argv.slice(2);
assert(process.platform === 'win32' && process.arch === 'x64', 'This probe targets Windows x64.');
assert(!extra.length && [modulesArgument, runnerArgument, reportArgument].every(value => value && isAbsolute(value)), 'Supply absolute installed node_modules, release runner and new report paths.');
const modules = await realpath(modulesArgument);
const runnerSource = await realpath(runnerArgument);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const checks = [];
function check(name, condition) { assert(condition, name); checks.push(name); }
async function run(executable, args, cwd, environment) {
  return new Promise((accept, reject) => {
    const child = spawn(executable, args, { cwd, env: environment, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const output = []; const errors = []; let length = 0; let fault;
    const stop = () => { fault = new Error('Capability process exceeded time/output limit.'); child.kill(); };
    const timer = setTimeout(stop, 30000);
    for (const [stream, chunks] of [[child.stdout, output], [child.stderr, errors]]) stream.on('data', chunk => { length += chunk.length; if (length > 256 * 1024) stop(); else chunks.push(chunk); });
    child.on('error', () => { clearTimeout(timer); reject(new Error('Capability process unavailable.')); });
    child.on('close', code => { clearTimeout(timer); if (fault) reject(fault); else accept({ code, stdout: Buffer.concat(output).toString('utf8'), stderr: Buffer.concat(errors).toString('utf8') }); });
  });
}
const base = await mkdtemp(join(tmpdir(), 'enouia-ccusage-probe-'));
try {
  const files = ['ccusage/package.json', 'ccusage/src/cli.js', '@ccusage/ccusage-win32-x64/package.json', '@ccusage/ccusage-win32-x64/bin/ccusage.exe'];
  const copiedModules = join(base, 'tools', 'node_modules'); const provenance = [];
  for (const name of files) {
    const source = join(modules, name); const destination = join(copiedModules, name);
    assert(!(await lstat(source)).isSymbolicLink() && (await realpath(source)).startsWith(modules + sep), 'Tool escaped supplied modules root.');
    const bytes = await readFile(source); await mkdir(dirname(destination), { recursive: true }); await writeFile(destination, bytes, { flag: 'wx' });
    provenance.push({ path: name, sha256: sha(bytes) });
  }
  const metadata = JSON.parse(await readFile(join(copiedModules, files[0]), 'utf8'));
  const nativeMetadata = JSON.parse(await readFile(join(copiedModules, files[2]), 'utf8'));
  check('installed wrapper and native package are pinned to 20.0.20', metadata.name === 'ccusage' && metadata.version === '20.0.20' && metadata.bin.ccusage === './src/cli.js' && metadata.optionalDependencies['@ccusage/ccusage-win32-x64'] === '20.0.20' && nativeMetadata.name === '@ccusage/ccusage-win32-x64' && nativeMetadata.version === '20.0.20');
  const profile = join(base, 'profile'); const normal = join(profile, 'normal', '.claude'); const roaming = join(profile, 'roaming'); const local = join(profile, 'local'); const cowork = join(roaming, 'Claude', 'local-agent-mode-sessions', 'task', '.claude');
  await mkdir(join(local, 'Packages'), { recursive: true });
  function record(id, timestamp, input, read, create, output) {
    return { type: 'assistant', timestamp, sessionId: 'synthetic-session', requestId: `request-${id}`, message: { id: `message-${id}`, type: 'message', role: 'assistant', model: 'claude-sonnet-4-20250514', usage: { input_tokens: input, cache_read_input_tokens: read, cache_creation_input_tokens: create, output_tokens: output } }, private: 'DO_NOT_EXPORT_TRANSCRIPT' };
  }
  const normalRecords = [record('normal-1', '2026-09-25T04:00:00.000Z', 3, 5, 7, 11), record('normal-2', '2026-09-25T16:00:00.000Z', 0, 0, 0, 0)];
  const coworkRecords = [record('cowork-1', '2026-09-25T05:00:00.000Z', 2, 3, 4, 5), record('cowork-2', '2026-09-25T16:30:00.000Z', 1, 0, 0, 0)];
  const transcriptHashes = [];
  for (const [store, records, label] of [[normal, normalRecords, 'normal'], [cowork, coworkRecords, 'cowork']]) {
    const project = join(store, 'projects', 'synthetic'); await mkdir(project, { recursive: true });
    const bytes = Buffer.from(`${records.map(value => JSON.stringify(value)).join('\n')}\n`);
    await writeFile(join(project, 'session.jsonl'), bytes); transcriptHashes.push({ store: label, sha256: sha(bytes) });
  }
  // No personal HOME, CLI options, tokens, XDG config or provider environment.
  const environment = {};
  for (const name of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'PATHEXT', 'COMSPEC']) if (process.env[name]) environment[name] = process.env[name];
  Object.assign(environment, { PATH: [dirname(process.execPath), join(process.env.SystemRoot, 'System32')].join(delimiter), HOME: profile, USERPROFILE: profile, APPDATA: roaming, LOCALAPPDATA: local, XDG_CONFIG_HOME: join(profile, 'xdg'), CLAUDE_CONFIG_DIR: normal });
  const cliPath = join(copiedModules, 'ccusage', 'src', 'cli.js');
  const args = [cliPath, 'claude', 'daily', '--json', '--offline', '--timezone', 'Asia/Shanghai'];
  function publicRows(result) {
    assert.equal(result.code, 0, 'Pinned ccusage failed on synthetic transcript.');
    assert(!result.stdout.includes('DO_NOT_EXPORT') && !result.stdout.includes(base), 'Raw transcript details in CLI JSON.');
    const value = JSON.parse(result.stdout);
    return { days: value.daily.map(day => ({ date: day.date, input: day.inputTokens, cacheRead: day.cacheReadTokens, cacheCreation: day.cacheCreationTokens, output: day.outputTokens, value: day.totalTokens })), total: value.totals.totalTokens };
  }
  const ordinary = publicRows(await run(process.execPath, args, base, environment));
  const extended = publicRows(await run(process.execPath, args, base, { ...environment, CLAUDE_CONFIG_DIR: `\\\\?\\${normal}` }));
  check('real pinned ccusage accepts canonical extended store paths', JSON.stringify(ordinary) === JSON.stringify(extended));
  check('normal report has Shanghai dates, explicit zero, and cache-inclusive total 26', ordinary.total === 26 && ordinary.days.length === 2 && ordinary.days[0].date === '2026-09-25' && ordinary.days[0].value === 26 && ordinary.days[1].date === '2026-09-26' && ordinary.days[1].value === 0);
  const coworkReport = publicRows(await run(process.execPath, args, base, { ...environment, CLAUDE_CONFIG_DIR: `\\\\?\\${cowork}` }));
  check('real second store produces total 15 across two Shanghai dates', coworkReport.total === 15 && coworkReport.days[0].value === 14 && coworkReport.days[1].value === 1);
  const executable = join(base, 'installed', 'enouia-activity.exe'); await mkdir(dirname(executable)); await copyFile(runnerSource, executable);
  const dataRoot = join(base, 'state'); const config = join(base, 'config.json');
  await mkdir(dataRoot);
  await writeFile(config, JSON.stringify({ version: 1, mode: 'sandbox', dataRoot, deliveryEnabled: false, maxRunSeconds: 60, claude: { nodeExecutable: process.execPath, ccusageCli: cliPath, normalStore: normal, roamingClaude: join(roaming, 'Claude'), localPackages: join(local, 'Packages'), expectedStores: [normal, cowork] } }));
  async function runtime(command, more = []) {
    const result = await run(executable, [command, ...more, '--config', config], base, environment);
    assert.equal(result.stderr, ''); assert(!result.stdout.includes(base) && !result.stdout.includes('DO_NOT_EXPORT'));
    return { code: result.code, value: JSON.parse(result.stdout) };
  }
  const seed = join(base, 'seed'); await mkdir(seed);
  await writeFile(join(seed, 'activity.json'), '{"version":1,"sources":{"github":null,"codex":null,"claude":null}}');
  await writeFile(join(seed, 'sequence.json'), '{"sequence":0}');
  check('empty synthetic seed bootstraps paused at high-water zero', (await runtime('migration-import', ['--bundle', seed, '--high-water', '0', '--verified-unused', 'true'])).code === 0);
  check('explicit resume succeeds before capability collection', (await runtime('set-paused', ['false'])).code === 0);
  const collected = await runtime('sync');
  check('actual runner collects Claude through discovery and real wrapper/native process', collected.code === 4 && collected.value.state === 'delivery_disabled' && collected.value.collectionAttempted && collected.value.sequence === 1 && collected.value.sourceFailures === 2);
  check('delivery disabled invokes no transport or public observation', !collected.value.transportAttempted && !collected.value.transportCompleted && !collected.value.publicationObserved);
  check('pause succeeds before capability export', (await runtime('set-paused', ['true'])).code === 0);
  const exported = join(base, 'export'); check('current capability batch exports while paused', (await runtime('migration-export-legacy', ['--output', exported])).code === 0);
  const batch = JSON.parse(await readFile(join(exported, 'pending.json'), 'utf8'));
  const snapshot = batch.data.sources.claude;
  check('Runtime aggregates real reports to exact dates 40 and 1', JSON.stringify(snapshot.days) === JSON.stringify([{ date: '2026-09-25', value: 40 }, { date: '2026-09-26', value: 1 }]) && snapshot.metric === 'tokens' && snapshot.timezone === 'Asia/Shanghai');
  check('source success times agree while other sources remain explicitly failed/null', batch.sources.claude.result === 'success' && snapshot.updatedAt === batch.sources.claude.attemptedAt && batch.sources.claude.succeededAt === snapshot.updatedAt && batch.sources.github.result === 'failed' && batch.sources.codex.result === 'failed' && batch.data.sources.github === null && batch.data.sources.codex === null);
  for (const entry of provenance) check(`original package unchanged: ${entry.path}`, sha(await readFile(join(modules, entry.path))) === entry.sha256);
  const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), state: 'passed', scope: 'pinned_ccusage_synthetic_transcript_capability', node: process.version, platform: process.platform, architecture: process.arch, packageVersion: metadata.version, packageFiles: provenance, transcriptHashes, binarySha256: sha(await readFile(executable)), harnessSha256: sha(await readFile(new URL(import.meta.url))), checks, normal: ordinary, cowork: coworkReport, runtimeClaude: snapshot, runtimeOutcomes: batch.sources, sequence: 1, limitations: ['Only synthetic transcript files in an isolated profile were read.', 'The copied installed public package is a temporary independent tool root, not a persistent Runtime installation.', 'No personal inventory, authenticated source capability, scheduled collection, network send, or production activation.', 'Node main-module extended script paths remain unsupported; this probe uses an ordinary absolute wrapper path and extended store paths.'], primarySources: ['https://github.com/ccusage/ccusage/blob/v20.0.20/apps/ccusage/src/cli.js', 'https://github.com/ccusage/ccusage/blob/v20.0.20/rust/adapters/claude/src/paths.rs'] };
  await writeFile(reportArgument, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({ state: report.state, checks: checks.length, total: snapshot.days.reduce((sum, day) => sum + day.value, 0) }));
} finally {
  const full = resolve(base); assert(dirname(full) === resolve(tmpdir()) && basename(full).startsWith('enouia-ccusage-probe-'), 'Unsafe capability cleanup.');
  await rm(full, { recursive: true, force: true });
}
