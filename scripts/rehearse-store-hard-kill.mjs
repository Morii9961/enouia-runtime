// Optional Windows process-kill rehearsal; no network, collectors, real archives or scheduler.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, delimiter, dirname, isAbsolute, join, resolve } from 'node:path';

const [helperArgument, reportArgument, ...extra] = process.argv.slice(2);
assert(process.platform === 'win32' && !extra.length && [helperArgument, reportArgument].every(value => value && isAbsolute(value)), 'Supply absolute Windows crash-writer executable and new report paths.');
const helperSource = await realpath(helperArgument);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const checks = [];
function check(name, condition) { assert(condition, name); checks.push(name); }
const environment = {};
for (const name of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'PATHEXT', 'COMSPEC']) if (process.env[name]) environment[name] = process.env[name];
environment.PATH = [dirname(process.execPath), join(process.env.SystemRoot, 'System32')].join(delimiter);
async function run(executable, args, cwd) {
  return new Promise((accept, reject) => {
    const child = spawn(executable, args, { cwd, env: environment, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = []; let bytes = 0; let fault;
    const timer = setTimeout(() => { fault = new Error('Crash probe exceeded deadline.'); child.kill(); }, 10000);
    child.stdout.on('data', chunk => { bytes += chunk.length; if (bytes > 128 * 1024) { fault = new Error('Crash probe output exceeded limit.'); child.kill(); } else chunks.push(chunk); });
    child.stderr.on('data', () => { fault = new Error('Crash probe emitted unexpected stderr.'); child.kill(); });
    child.on('error', () => { clearTimeout(timer); reject(new Error('Crash probe unavailable.')); });
    child.on('close', code => { clearTimeout(timer); if (fault) reject(fault); else if (code !== 0) reject(new Error('Crash probe refused synthetic state.')); else accept(JSON.parse(Buffer.concat(chunks).toString('utf8'))); });
  });
}
async function files(root) {
  const entries = [];
  async function visit(directory, prefix) {
    for (const item of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      assert(!item.isSymbolicLink(), 'Unexpected link in crash state.');
      const path = join(directory, item.name); const relative = `${prefix}${item.name}`;
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
    check(`${kind}/${phase}: live writer owns OS lock`, (await run(executable, ['inspect', root], root)).state === 'lock_unavailable');
    assert(child.kill(), 'Could not terminate owned crash-writer process.');
    const status = await closed;
    assert(!fault && status.code !== 0, 'Crash writer completed normally instead of being killed.');
    return { forcedTermination: true, gracefulExit: false };
  } finally {
    clearTimeout(timer);
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await closed;
  }
}
const base = await mkdtemp(join(tmpdir(), 'enouia-store-crash-'));
try {
  await writeFile(join(base, 'ACTIVITY_SANDBOX_FIXTURE'), 'enouia-activity-hard-kill-v1');
  const helper = join(base, 'crash-writer.exe'); await copyFile(helperSource, helper);
  const cases = []; let index = 0;
  const sharedPhases = ['flushed:activity.json', 'flushed:sequence.json', 'flushed:delivery.json', 'flushed:manifest.json', 'generation_published', 'current_prepared', 'current_switched'];
  for (const kind of ['new_batch', 'pause', 'acknowledge']) {
    const phases = kind === 'acknowledge' ? sharedPhases : [...sharedPhases.slice(0, 2), 'flushed:pending.json', ...sharedPhases.slice(2)];
    for (const phase of phases) {
      const root = join(base, `case-${index++}`); await mkdir(root);
      const before = await run(helper, ['prepare', root, kind], root);
      const immutable = await files(join(root, 'generations'));
      const termination = await killAt(helper, root, kind, phase);
      const after = await run(helper, ['inspect', root], root);
      check(`${kind}/${phase}: lock releases after forced termination`, after.state === 'inspected');
      const switched = phase === 'current_switched'; const published = switched || phase === 'generation_published' || phase === 'current_prepared';
      const blocked = published && !switched && kind !== 'pause';
      const expectedSequence = kind === 'new_batch' && !switched ? 0 : 1;
      const expectedPending = kind === 'new_batch' ? switched ? before.candidatePendingSha256 : null : kind === 'acknowledge' && switched ? null : before.pendingSha256;
      const expectedArchive = kind === 'new_batch' && switched ? before.candidateArchiveSha256 : before.archiveSha256;
      check(`${kind}/${phase}: CURRENT references one complete generation`, after.sequence === expectedSequence && after.pendingSha256 === expectedPending && after.archiveSha256 === expectedArchive && (switched ? after.generation === 'g-1-crash' : after.generation === before.generation));
      check(`${kind}/${phase}: published orphan recovery follows fail-closed policy`, blocked ? after.audit.state === (kind === 'new_batch' ? 'higher_reserved_sequence' : 'conflicting_generation') && after.decision.state === 'blocked' : after.audit.state === 'passed');
      const expectedDecision = blocked ? 'blocked' : kind === 'new_batch' ? switched ? 'retry_pending' : 'collect' : kind === 'pause' && switched ? 'paused' : kind === 'acknowledge' && switched ? 'collect' : 'retry_pending';
      check(`${kind}/${phase}: next action preserves pending/pause/sequence`, after.decision.state === expectedDecision && (expectedDecision !== 'collect' || after.decision.nextSequence === (kind === 'acknowledge' ? 2 : 1)));
      const observed = await files(join(root, 'generations')); const byPath = new Map(observed.map(entry => [entry.path, entry.sha256]));
      check(`${kind}/${phase}: every prior generation stays byte-exact`, immutable.every(entry => byPath.get(entry.path) === entry.sha256));
      const treeBeforeAdvance = await files(root);
      const advanced = await run(helper, ['advance', root], root);
      if (expectedDecision === 'collect') {
        check(`${kind}/${phase}: restarted writer safely commits next pending`, advanced.sequence === after.decision.nextSequence && advanced.decision.state === 'retry_pending');
      } else {
        check(`${kind}/${phase}: unresolved state forbids a competing collection`, JSON.stringify(await files(root)) === JSON.stringify(treeBeforeAdvance) && JSON.stringify(advanced) === JSON.stringify(after));
      }
      cases.push({ kind, phase, termination, before, after, advanced, previousGenerationFilesSha256: sha(JSON.stringify(immutable)), blockedBeforeSwitch: blocked });
    }
  }
  assert.equal(cases.length, 23);
  const sourceFiles = [];
  for (const path of ['crates/enouia-activity-store/src/writer.rs', 'crates/enouia-activity-store/src/recovery.rs', 'crates/enouia-activity-store/src/run_start.rs', 'tests/fixtures/activity/moriium-oracle-input.json']) sourceFiles.push({ path, sha256: sha(await readFile(new URL(`../${path}`, import.meta.url))) });
  const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), state: 'passed', scope: 'actual_process_termination_at_store_commit_boundaries', node: process.version, clockMs: 1790409601000, helperSha256: sha(await readFile(helper)), harnessSha256: sha(await readFile(new URL(import.meta.url))), helperSourceSha256: sha(await readFile(new URL('../crates/enouia-activity-store/examples/crash_writer.rs', import.meta.url))), sourceFiles, checks, cases, limitations: ['Windows owned child processes are forcibly terminated after production writer hooks; no fault hook error/graceful cleanup is used.', 'All roots, archives and publication receipt evidence are synthetic; receipt construction does not prove public observation.', 'This covers process termination with the OS/storage still running, not real power loss, disk-full, hardware failure or server kills.', 'No real collectors, credentials, production migration, scheduler, or network endpoint is involved.'] };
  await writeFile(reportArgument, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({ state: report.state, cases: cases.length, checks: checks.length, blockedOrphans: cases.filter(item => item.blockedBeforeSwitch).length }));
} finally {
  const full = resolve(base); assert(dirname(full) === resolve(tmpdir()) && basename(full).startsWith('enouia-store-crash-'), 'Unsafe crash-probe cleanup.');
  await rm(full, { recursive: true, force: true });
}
