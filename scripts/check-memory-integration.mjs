// Checks that Runtime embeds exactly one pinned Enouia Memory revision (ADR-025).
//
//   node scripts/check-memory-integration.mjs [--memory-checkout DIR] [--self-test]
//
// - docs/integration/memory-pin.json, apps/desktop/src-tauri/Cargo.toml and
//   its Cargo.lock agree on the repository and on one full 40-hex revision.
// - No Memory dependency uses a branch, tag, path or [patch].
// - The root domain workspace has no Memory dependency.
// - With --memory-checkout, the recorded surface aggregate equals the
//   docs/integration/runtime-surface.json committed at the pinned revision in
//   that Memory checkout (read with `git show`, whatever its HEAD is).
// Reads files and local Git objects only; no network, no build.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const args = process.argv.slice(2);
const checkoutAt = args.indexOf('--memory-checkout');
const checkout = checkoutAt >= 0 ? args[checkoutAt + 1] : null;
assert(checkoutAt < 0 || checkout, 'usage: --memory-checkout DIR');

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8').replace(/^\uFEFF/, '');
const inputs = {
  pin: JSON.parse(read('docs/integration/memory-pin.json')),
  manifest: read('apps/desktop/src-tauri/Cargo.toml'),
  lock: read('apps/desktop/src-tauri/Cargo.lock'),
  rootManifest: read('Cargo.toml'),
  rootLock: read('Cargo.lock'),
};

/** Dependency lines of a manifest that name the Memory repository or a Memory crate. */
function memoryDependencies(manifest) {
  return manifest.split('\n').filter((line) => /^\s*enouia-memory-[a-z-]+\s*=/.test(line) || line.includes('Morii9961/enouia-memory'));
}

/** `[[package]]` blocks of a lockfile as { name, source }. */
function lockPackages(lock) {
  return lock.split('[[package]]').slice(1).map((block) => ({
    name: /^name = "([^"]+)"/m.exec(block)?.[1],
    source: /^source = "([^"]+)"/m.exec(block)?.[1] ?? null,
  }));
}

function check({ pin, manifest, lock, rootManifest, rootLock }) {
  assert.equal(pin.schemaVersion, 1);
  assert.equal(pin.repository, 'https://github.com/Morii9961/enouia-memory.git', 'pin repository');
  assert.match(pin.revision, /^[0-9a-f]{40}$/, 'pin revision must be a full commit SHA');
  assert.match(pin.memorySurfaceAggregate, /^[0-9a-f]{64}$/, 'pin needs the Memory surface aggregate');
  assert(Array.isArray(pin.crates) && pin.crates.includes('enouia-memory-workspace'), 'pin names the embedded crate');

  assert(!/^\s*\[patch/m.test(manifest), 'no [patch] in the desktop manifest');
  const declared = memoryDependencies(manifest);
  assert(declared.length > 0, 'the desktop manifest embeds Enouia Memory');
  const names = [];
  for (const line of declared) {
    const name = /^\s*(enouia-memory-[a-z-]+)\s*=/.exec(line)?.[1];
    assert(name, `unexpected Memory reference: ${line.trim()}`);
    assert(line.includes(`git = "${pin.repository}"`), `${name}: git source must be the pinned repository`);
    assert(line.includes(`rev = "${pin.revision}"`), `${name}: rev must equal the pin`);
    assert(!/\b(branch|tag|path)\s*=/.test(line), `${name}: no branch, tag or path`);
    names.push(name);
  }
  assert.deepEqual([...names].sort(), [...pin.crates].sort(), 'manifest crates equal the pin record');

  const expected = `git+${pin.repository}?rev=${pin.revision}#${pin.revision}`;
  const memory = lockPackages(lock).filter((p) => p.name?.startsWith('enouia-memory-'));
  assert(memory.length >= pin.crates.length, 'the lockfile resolves the Memory crates');
  for (const p of memory) assert.equal(p.source, expected, `${p.name}: lockfile source must be the pinned revision`);
  for (const name of pin.crates) assert(memory.some((p) => p.name === name), `${name} missing from the lockfile`);

  assert.equal(memoryDependencies(rootManifest).length, 0, 'the domain workspace must not depend on Enouia Memory');
  assert(!rootLock.includes('Morii9961/enouia-memory'), 'the domain lockfile must not resolve Enouia Memory');
  return { state: 'memory_pin_consistent', revision: pin.revision, crates: names.length, lockedPackages: memory.length };
}

const result = check(inputs);
if (checkout) {
  const git = (...argv) => execFileSync('git', ['-C', checkout, ...argv], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  let committed;
  try {
    committed = git('show', `${inputs.pin.revision}:docs/integration/runtime-surface.json`);
  } catch {
    throw new Error(`the Memory checkout does not contain the pinned revision ${inputs.pin.revision}; fetch it first`);
  }
  const surface = JSON.parse(committed);
  assert.equal(surface.aggregate, inputs.pin.memorySurfaceAggregate, 'recorded surface differs from the pinned revision');
  assert.equal(surface.commands.length, inputs.pin.contract.commands, 'command count differs from the pinned revision');
  result.memorySurface = 'matches_pinned_revision';
  result.memoryCheckoutHead = git('rev-parse', 'HEAD').trim();
}
if (args.includes('--self-test')) {
  const variants = [
    (i) => { i.pin.revision = i.pin.revision.slice(0, 12); },
    (i) => { i.manifest = i.manifest.replace(/rev = "[0-9a-f]{40}"/, `rev = "${'0'.repeat(40)}"`); },
    (i) => { i.manifest = i.manifest.replace(/rev = "[0-9a-f]{40}"/, 'branch = "main"'); },
    (i) => { i.manifest += '\n[patch."https://github.com/Morii9961/enouia-memory.git"]\nenouia-memory-workspace = { path = "../memory" }\n'; },
    (i) => { i.lock = i.lock.replace(/\?rev=[0-9a-f]{40}#/, `?rev=${'1'.repeat(40)}#`); },
    (i) => { i.lock = i.lock.replace(/source = "git\+https:\/\/github\.com\/Morii9961\/enouia-memory\.git[^"]*"\n/, ''); },
    (i) => { i.rootManifest += '\nenouia-memory-contract = { git = "https://github.com/Morii9961/enouia-memory.git", rev = "x" }\n'; },
    (i) => { i.pin.crates = ['enouia-memory-workspace']; },
  ];
  for (const change of variants) {
    const copy = structuredClone(inputs);
    change(copy);
    assert.throws(() => check(copy));
  }
  result.negativeChecks = variants.length;
}
console.log(JSON.stringify(result, null, 2));
