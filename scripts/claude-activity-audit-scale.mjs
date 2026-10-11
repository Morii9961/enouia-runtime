// Development-only measurement of write-path audit cost against retained
// generations (ADR-034). Never imported by Runtime or regular tests. A
// synthetic one-year archive is imported; the harness then writes further
// valid generations directly (byte copies of the imported one under new ids,
// each with its own manifest), and at each mark every given runner times
// `diagnostics`, which audits all retained generations once.
//
//   node scripts/claude-activity-audit-scale.mjs --import EXE --marks 100,1000,8760 --runner NAME=EXE [--runner NAME=EXE ...] --report NEW
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const runners = []; let grow; let marks; let report;
for (let i = 0; i < args.length; i += 2) {
  const [key, value] = [args[i], args[i + 1]];
  assert(value, 'Every option needs a value.');
  if (key === '--import') grow = value;
  else if (key === '--marks') marks = value.split(',').map(Number);
  else if (key === '--report') report = value;
  else if (key === '--runner') { const [name, path] = value.split(/=(.*)/s); runners.push({ name, path }); }
  else throw new Error(`Unknown option ${key}`);
}
assert(grow && isAbsolute(grow) && report && isAbsolute(report) && runners.length > 0 && runners.every(r => r.name && isAbsolute(r.path)), 'Absolute --import, --report and at least one --runner NAME=EXE are required.');
assert(marks?.length && marks.every((n, i) => Number.isInteger(n) && n > 1 && (i === 0 || n > marks[i - 1])), 'Marks must be increasing integers.');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

const base = mkdtempSync(join(tmpdir(), 'enouia-audit-scale-'));
try {
  const copies = Object.fromEntries([['grow', grow], ...runners.map(r => [r.name, r.path])].map(([name, path]) => {
    const copy = join(base, `${name}.exe`); copyFileSync(path, copy); return [name, copy];
  }));
  const root = join(base, 'root'); const legacy = join(base, 'legacy'); mkdirSync(root); mkdirSync(legacy);
  const days = scale => Array.from({ length: 365 }, (_, i) => ({ date: new Date(Date.UTC(2025, 9, 1) + i * 86400000).toISOString().slice(0, 10), value: (i * 7919 % 1000) * scale }));
  const at = '2026-09-30T08:00:00.000Z';
  writeFileSync(join(legacy, 'activity.json'), JSON.stringify({ version: 1, sources: {
    github: { updatedAt: at, timezone: 'GitHub', metric: 'contributions', days: days(1) },
    codex: { updatedAt: at, timezone: 'Codex', metric: 'tokens', days: days(100000) },
    claude: { updatedAt: at, timezone: 'Asia/Shanghai', metric: 'tokens', days: days(300000) } } }));
  writeFileSync(join(legacy, 'sequence.json'), JSON.stringify({ sequence: 1 }));
  const config = join(base, 'config.json');
  writeFileSync(config, JSON.stringify({ version: 1, mode: 'sandbox', dataRoot: root }));
  const cli = (exe, ...command) => {
    const started = process.hrtime.bigint();
    const result = spawnSync(exe, [...command, '--config', config], { encoding: 'utf8', windowsHide: true });
    return { code: result.status, ms: Number(process.hrtime.bigint() - started) / 1e6, out: result.stdout };
  };
  assert.equal(cli(copies.grow, 'migration-import', '--bundle', legacy, '--high-water', '1').code, 0, 'Synthetic import failed.');
  const generations = () => readdirSync(join(root, 'generations')).filter(name => !name.startsWith('.')).length;
  const firstGeneration = readdirSync(join(root, 'generations'))[0];
  const archiveBytes = statSync(join(root, 'generations', firstGeneration, 'activity.json')).size;
  // Older generations identical to the imported one: same archive, same
  // reservation, no pending. Each is valid on its own under a unique id.
  const source = join(root, 'generations', firstGeneration);
  const files = Object.fromEntries(['activity.json', 'sequence.json', 'delivery.json'].map(name => [name, readFileSync(join(source, name))]));
  let next = 0;
  const synthesize = () => {
    const id = `g-synth-${String(next++).padStart(6, '0')}`;
    const directory = join(root, 'generations', id);
    mkdirSync(directory);
    for (const [name, bytes] of Object.entries(files)) writeFileSync(join(directory, name), bytes);
    const manifest = { schemaVersion: 1, generationId: id, files: { 'activity.json': hash(files['activity.json']), 'sequence.json': hash(files['sequence.json']), 'pending.json': null, 'delivery.json': hash(files['delivery.json']) } };
    writeFileSync(join(directory, 'manifest.json'), `${JSON.stringify(manifest)}\n`);
  };
  const points = [];
  for (const mark of marks) {
    while (generations() < mark) synthesize();
    const point = { generations: generations() };
    for (const runner of runners) {
      const samples = [1, 2, 3].map(() => { const r = cli(copies[runner.name], 'diagnostics'); assert.equal(r.code, 0, r.out); return r.ms; });
      point[`${runner.name}Ms`] = Math.round(Math.min(...samples));
    }
    points.push(point);
    console.log(JSON.stringify(point));
  }
  const result = { schemaVersion: 1, state: 'measured', scope: 'development_audit_scale', archiveBytes, sourcesDays: 365, measure: 'minimum of three diagnostics runs, each one full write-path audit',
    runners: runners.map(r => ({ name: r.name, sha256: hash(readFileSync(copies[r.name])) })), importRunnerSha256: hash(readFileSync(copies.grow)), points, node: process.version,
    harnessSha256: hash(readFileSync(fileURLToPath(import.meta.url), 'utf8').replaceAll('\r\n', '\n')),
    limitations: ['Wall-clock timings on one Windows workstation with a warm file cache; absolute values vary by machine.', 'Synthesized generations share one reservation and archive, so this measures per-generation audit cost, not a real hourly delivery history whose archive also grows.'] };
  writeFileSync(report, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
} finally {
  const resolved = resolve(base);
  assert(basename(resolved).startsWith('enouia-audit-scale-') && dirname(resolved) === resolve(tmpdir()), 'Unsafe cleanup path.');
  rmSync(resolved, { recursive: true, force: true });
}
