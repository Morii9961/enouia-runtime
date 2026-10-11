// Optional Windows drill: explicit reconciliation of orphans left by actual
// process termination. An owned crash-writer child is killed at each store
// commit boundary that leaves a blocking published generation; the real
// runner executable then inspects, refuses and retracts it, and a later sync
// proceeds. No network, collectors, real archives, scheduler or credentials.
//
//   node scripts/claude-activity-orphan-reconcile.mjs <crash_writer.exe> <enouia-activity.exe> <new report>
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, delimiter, dirname, isAbsolute, join, resolve } from 'node:path';

const [helperArgument, runnerArgument, reportArgument, ...extra] = process.argv.slice(2);
assert(process.platform === 'win32' && !extra.length && [helperArgument, runnerArgument, reportArgument].every(value => value && isAbsolute(value)), 'Supply absolute crash-writer, runner and new report paths.');
const helperSource = await realpath(helperArgument);
const runnerSource = await realpath(runnerArgument);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const checks = [];
function check(name, condition, detail = '') { assert(condition, `${name} ${detail}`); checks.push(name); }
const environment = {};
for (const name of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'PATHEXT', 'COMSPEC']) if (process.env[name]) environment[name] = process.env[name];
environment.PATH = [dirname(process.execPath), join(process.env.SystemRoot, 'System32')].join(delimiter);

// Run an owned executable and return its exit code and parsed JSON output.
async function exec(executable, args, cwd) {
  return new Promise((accept, reject) => {
    const child = spawn(executable, args, { cwd, env: environment, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = []; let bytes = 0; let fault;
    const timer = setTimeout(() => { fault = new Error('Probe exceeded deadline.'); child.kill(); }, 20000);
    child.stdout.on('data', chunk => { bytes += chunk.length; if (bytes > 256 * 1024) { fault = new Error('Probe output exceeded limit.'); child.kill(); } else chunks.push(chunk); });
    child.stderr.on('data', () => { fault = new Error('Probe emitted unexpected stderr.'); child.kill(); });
    child.on('error', () => { clearTimeout(timer); reject(new Error('Probe unavailable.')); });
    child.on('close', code => {
      clearTimeout(timer);
      if (fault) { reject(fault); return; }
      const text = Buffer.concat(chunks).toString('utf8');
      let value = null; try { value = JSON.parse(text); } catch { /* reported by the caller */ }
      accept({ code, value, text });
    });
  });
}
async function helper(executable, args, cwd) {
  const { code, value } = await exec(executable, args, cwd);
  assert.equal(code, 0, `Crash probe refused synthetic state after ${checks.length} checks (last: ${checks.at(-1)}): ${args[0]}`);
  return value;
}
async function files(root) {
  const entries = [];
  async function visit(directory, prefix) {
    for (const item of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      assert(!item.isSymbolicLink(), 'Unexpected link in crash state.');
      const path = join(directory, item.name); const relative = `${prefix}${item.name}`;
      if (relative === 'sync.lock') continue;
      if (item.isDirectory()) await visit(path, `${relative}/`); else if (item.isFile()) entries.push({ path: relative, sha256: sha(await readFile(path)) });
    }
  }
  await visit(root, ''); return entries;
}
async function killAt(executable, root, kind, phase) {
  const child = spawn(executable, ['interrupt', root, kind, phase], { cwd: root, env: environment, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let readyAccept; let readyReject; let closeAccept; let fault; let bytes = '';
  const ready = new Promise((accept, reject) => { readyAccept = accept; readyReject = reject; });
  const closed = new Promise(accept => { closeAccept = accept; });
  const stop = message => { fault = new Error(message); readyReject(fault); child.kill(); };
  const timer = setTimeout(() => stop('Crash writer did not reach requested boundary.'), 10000);
  child.on('error', () => stop('Crash writer unavailable.'));
  child.stderr.on('data', () => stop('Crash writer emitted unexpected stderr.'));
  child.stdout.on('data', chunk => {
    bytes += chunk.toString('utf8');
    if (bytes.length > 4096) { stop('Crash writer output exceeded limit.'); return; }
    if (bytes.includes('\n')) {
      try { readyAccept(JSON.parse(bytes.trim())); } catch { stop('Crash writer emitted invalid boundary.'); }
    }
  });
  child.on('close', (code, signal) => { clearTimeout(timer); readyReject(new Error('Crash writer exited before requested kill.')); closeAccept({ code, signal }); });
  try {
    const marker = await ready;
    assert(marker.state === 'ready_to_kill' && marker.kind === kind && marker.phase === phase && marker.pid === child.pid, 'Unexpected crash-writer identity/boundary.');
    assert(child.kill(), 'Could not terminate owned crash-writer process.');
    const status = await closed;
    assert(!fault && status.code !== 0, 'Crash writer completed normally instead of being killed.');
  } finally {
    clearTimeout(timer);
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await closed;
  }
}

const base = await mkdtemp(join(tmpdir(), 'enouia-store-crash-'));
try {
  await writeFile(join(base, 'ACTIVITY_SANDBOX_FIXTURE'), 'enouia-activity-hard-kill-v1');
  const crash = join(base, 'crash-writer.exe'); await copyFile(helperSource, crash);
  const runner = join(base, 'enouia-activity.exe'); await copyFile(runnerSource, runner);
  const cases = []; let index = 0;
  for (const kind of ['new_batch', 'acknowledge']) {
    for (const phase of ['generation_published', 'current_prepared']) {
      const id = `${kind}/${phase}`;
      const root = join(base, `case-${index}`); await mkdir(root);
      const config = join(base, `config-${index++}.json`);
      await writeFile(config, JSON.stringify({ version: 1, mode: 'sandbox', dataRoot: root }));
      const cli = (...args) => exec(runner, [args[0], '--config', config, ...args.slice(1)], base);
      const before = await helper(crash, ['prepare', root, kind], root);
      await killAt(crash, root, kind, phase);
      const killed = await helper(crash, ['inspect', root], root);
      const standing = kind === 'new_batch' ? 'higher_reserved_sequence' : 'conflicting_generation';
      check(`${id}: actual termination leaves a blocking orphan`, killed.decision.state === 'blocked' && killed.audit.state === standing && killed.generation === before.generation, JSON.stringify(killed));
      const orphanTree = await files(root);

      const blockedSync = await cli('sync');
      check(`${id}: runner sync stays blocked before reconciliation`, blockedSync.code === 6 && blockedSync.value.state === 'storage_failed', blockedSync.text);
      check(`${id}: blocked sync changes no file`, JSON.stringify(await files(root)) === JSON.stringify(orphanTree));

      const inspected = await cli('recovery-inspect');
      const blocking = inspected.value.blocking ?? [];
      check(`${id}: inspection reports one blocking orphan`, inspected.code === 0 && inspected.value.writable === false && blocking.length === 1 && blocking[0].id === 'g-1-crash' && blocking[0].standing === standing, inspected.text);
      check(`${id}: inspection names CURRENT and its reservation`, inspected.value.current.id === before.generation && inspected.value.current.highestReserved === before.sequence, inspected.text);
      const manifest = join(root, 'generations', 'g-1-crash', 'manifest.json');
      check(`${id}: reported manifest hash matches the orphan bytes`, blocking[0].manifestSha256 === sha(await readFile(manifest)));
      const pointer = phase === 'current_prepared' ? 'exact' : 'absent';
      check(`${id}: prepared pointer evidence is ${pointer}`, blocking[0].preparedPointer === pointer, inspected.text);
      check(`${id}: inspection output carries no private path`, !inspected.text.includes(base) && !inspected.text.includes(base.replaceAll('\\', '\\\\')));
      check(`${id}: inspection changes no file`, JSON.stringify(await files(root)) === JSON.stringify(orphanTree));

      const retract = (confirm, hash) => cli('recovery-retract', '--generation', 'g-1-crash', '--manifest-sha256', hash, ...(confirm === null ? [] : ['--confirm-never-selected', confirm]));
      const missing = await retract(null, blocking[0].manifestSha256);
      const unconfirmed = await retract('false', blocking[0].manifestSha256);
      const mismatch = await retract('true', '0'.repeat(64));
      check(`${id}: retraction without confirmation is refused`, missing.code === 5 && unconfirmed.code === 5);
      check(`${id}: retraction with another manifest hash is refused`, mismatch.code === 6 && mismatch.value.state === 'manifest_mismatch');
      check(`${id}: refused retractions change no file`, JSON.stringify(await files(root)) === JSON.stringify(orphanTree));

      const retracted = await retract('true', blocking[0].manifestSha256);
      check(`${id}: confirmed retraction restores writing`, retracted.code === 0 && retracted.value.state === 'generation_retracted' && retracted.value.writable === true && retracted.value.remainingBlocking === 0, retracted.text);
      const recordPath = join(root, 'reconciliations', 'retract-g-1-crash.json');
      const record = JSON.parse(await readFile(recordPath, 'utf8'));
      check(`${id}: durable record matches the reported evidence`, JSON.stringify(record) === JSON.stringify(retracted.value.record) && record.generation.manifestSha256 === blocking[0].manifestSha256 && record.generation.preparedPointer === pointer && record.current.id === before.generation);
      const afterTree = await files(root);
      const moved = new Map(afterTree.map(entry => [entry.path, entry.sha256]));
      check(`${id}: every orphan byte is retained under its staging name`, orphanTree.every(entry => moved.get(entry.path.replace('generations/g-1-crash/', 'generations/.staging-g-1-crash/')) === entry.sha256) && afterTree.length === orphanTree.length + 1 && !existsSync(join(root, 'generations', 'g-1-crash')));
      const repeated = await retract('true', blocking[0].manifestSha256);
      check(`${id}: a repeated retraction is refused`, repeated.code === 6 && repeated.value.state === 'not_retractable');

      const reconciled = await helper(crash, ['inspect', root], root);
      const expected = kind === 'new_batch' ? 'collect' : 'retry_pending';
      check(`${id}: store audit passes and keeps the original next action`, reconciled.audit.state === 'passed' && reconciled.audit.stagingDirectories >= 1 && reconciled.decision.state === expected && reconciled.generation === before.generation && reconciled.pendingSha256 === before.pendingSha256, JSON.stringify(reconciled));
      const synced = await cli('sync');
      check(`${id}: next runner sync proceeds without delivery`, synced.code === 4 && synced.value.state === 'delivery_disabled' && synced.value.sequence === 1 && synced.value.transportAttempted === false, synced.text);
      // The runner writes with the system clock, so read the result through
      // the runner rather than the crash writer's fixed fixture clock.
      const final = await cli('diagnostics');
      check(`${id}: final state retains one pending batch at sequence 1`, final.code === 0 && final.value.pending?.sequence === 1, final.text);
      if (kind === 'acknowledge') check(`${id}: the original pending bytes are retried unchanged`, final.value.pending.exactPendingSha256 === before.pendingSha256 && synced.value.collectionAttempted === false, synced.text);
      const after = await cli('recovery-inspect');
      check(`${id}: the reconciled root stays writable after the next sync`, after.code === 0 && after.value.writable === true && after.value.blocking.length === 0, after.text);
      cases.push({ kind, phase, before, killed, inspected: inspected.value, retracted: retracted.value, reconciled, synced: synced.value, final: final.value });
    }
  }
  assert.equal(cases.length, 4);
  const sourceFiles = [];
  for (const path of ['crates/enouia-activity-store/src/reconcile.rs', 'crates/enouia-activity-store/src/recovery.rs', 'crates/enouia-activity-store/src/writer.rs', 'crates/enouia-activity-runner/src/cli.rs', 'crates/enouia-activity-store/examples/crash_writer.rs']) {
    sourceFiles.push({ path, sha256: sha((await readFile(new URL(`../${path}`, import.meta.url), 'utf8')).replaceAll('\r\n', '\n')) });
  }
  const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), state: 'passed', scope: 'actual_process_termination_orphan_reconciliation', node: process.version, helperSha256: sha(await readFile(crash)), runnerSha256: sha(await readFile(runner)), harnessSha256: sha((await readFile(new URL(import.meta.url), 'utf8')).replaceAll('\r\n', '\n')), sourceFiles, checks, cases, limitations: ['Owned crash-writer children are forcibly terminated after production writer hooks; the runner then acts on the state they leave.', 'The operator confirmation is supplied by this harness; it is not evidence that a real orphan was never selected or delivered.', 'All roots, archives and receipts are synthetic; delivery is disabled and no network endpoint is involved.', 'This covers process termination with the OS and storage running, not power loss, disk-full or hardware failure.'] };
  await writeFile(reportArgument, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({ state: report.state, cases: cases.length, checks: checks.length }));
} finally {
  const full = resolve(base); assert(dirname(full) === resolve(tmpdir()) && basename(full).startsWith('enouia-store-crash-'), 'Unsafe crash-probe cleanup.');
  await rm(full, { recursive: true, force: true });
}
