import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
assert(args.length === 1 || (args.length === 2 && args[1] === '--self-test'), 'usage: node scripts/check-domain-boundaries.mjs METADATA_JSON [--self-test]');
const metadata = JSON.parse(readFileSync(args[0], 'utf8').replace(/^\uFEFF/, ''));
const core = new Set(['enouia-memory', 'enouia-session', 'enouia-context', 'enouia-provider', 'enouia-core-contract']);
const shared = new Set(['enouia-common', 'enouia-windows-process']);
const pureDependencies = {
  'enouia-common': ['serde'],
  'enouia-memory': ['serde'],
  'enouia-session': ['enouia-memory', 'serde'],
  'enouia-context': ['enouia-memory', 'enouia-session', 'serde', 'serde_json'],
  'enouia-provider': ['enouia-common', 'enouia-context', 'enouia-memory', 'enouia-session', 'serde'],
  'enouia-core-contract': ['enouia-common', 'enouia-memory', 'enouia-session', 'serde'],
};
// Enouia Memory's packages arrive only from its repository at a pinned
// revision (ADR-025). They are classified by source, not by name, because
// Runtime's frozen `enouia-memory` crate shares the prefix.
const MEMORY_SOURCE = 'git+https://github.com/Morii9961/enouia-memory.git';
const PINNED = /^git\+https:\/\/github\.com\/Morii9961\/enouia-memory\.git\?rev=([0-9a-f]{40})#([0-9a-f]{40})$/;
const runtimeName = (name) => name.startsWith('enouia-activity') || core.has(name) || shared.has(name);
const isProduction = (dep) => dep.dep_kinds.some(k => k.kind === null || k.kind === 'build');

function graph(input) {
  assert.equal(input.version, 1);
  assert(input.resolve?.nodes, 'resolved Cargo metadata required; do not pass --no-deps');
  const packages = new Map(input.packages.map(p => [p.id, p]));
  const nodes = new Map(input.resolve.nodes.map(n => [n.id, n]));
  const upstream = new Set(input.packages.filter(p => p.source?.startsWith(MEMORY_SOURCE)).map(p => p.id));
  for (const id of upstream) {
    const match = PINNED.exec(packages.get(id).source);
    assert(match && match[1] === match[2], `Memory package not pinned to one full revision: ${packages.get(id).name}`);
  }
  const revisions = new Set([...upstream].map(id => PINNED.exec(packages.get(id).source)[1]));
  assert(revisions.size <= 1, 'Memory packages from more than one revision');
  for (const p of input.packages) {
    if (p.name.startsWith('enouia-memory-')) assert(upstream.has(p.id), `Memory package from an unpinned source: ${p.name}`);
  }
  function reach(from, check) {
    const seen = new Set();
    (function visit(id) {
      if (seen.has(id)) return;
      seen.add(id);
      assert(packages.get(id), 'unresolved package');
      check(packages.get(id), id);
      for (const dep of nodes.get(id)?.deps ?? []) if (isProduction(dep)) visit(dep.pkg);
    })(from);
  }
  return { packages, nodes, upstream, revision: [...revisions][0] ?? null, reach };
}

/** The offline domain workspace: Activity, frozen Core history and shared ports. No Memory package. */
function checkDomain(input, g) {
  const { packages, nodes, upstream, reach } = g;
  assert.equal(upstream.size, 0, 'the domain workspace must not depend on Enouia Memory; only the desktop shell embeds it');
  const workspace = input.workspace_members.map(id => packages.get(id));
  const activity = new Set(workspace.filter(p => p.name.startsWith('enouia-activity')).map(p => p.name));
  assert.equal(workspace.length, 12, 'new workspace ownership needs explicit boundary review');
  assert.equal(activity.size, 5);
  for (const pkg of workspace) {
    assert(core.has(pkg.name) || activity.has(pkg.name) || shared.has(pkg.name), `unclassified module: ${pkg.name}`);
    const node = nodes.get(pkg.id);
    assert(node, 'workspace node missing');
    if (pureDependencies[pkg.name]) {
      const production = node.deps.filter(isProduction).map(d => packages.get(d.pkg).name);
      assert.deepEqual([...new Set(production)].sort(), [...pureDependencies[pkg.name]].sort(), `pure contract dependency changed: ${pkg.name}`);
    }
    reach(pkg.id, (target, id) => {
      if (activity.has(pkg.name)) assert(!core.has(target.name) && !upstream.has(id), `Activity reaches Core or Memory: ${pkg.name} -> ${target.name}`);
      if (core.has(pkg.name)) assert(!activity.has(target.name), `Core reaches Activity: ${pkg.name} -> ${target.name}`);
      if (shared.has(pkg.name)) assert(!core.has(target.name) && !activity.has(target.name) && !upstream.has(id), `shared adapter reaches a domain: ${pkg.name}`);
    });
  }
  assert(!nodes.get(workspace.find(p => p.name === 'enouia-provider').id).deps.some(d => packages.get(d.pkg).name === 'enouia-core-contract'), 'Provider must not depend on local UI contract');
  return { state: 'dependency_boundaries_passed', workspace: 'domain', workspaceModules: 12, activityModules: 5, coreModules: 5, sharedModules: 2, memoryPackages: 0, scope: 'resolved_production_and_build_dependencies' };
}

/** The desktop shell: one member that embeds pinned Memory; no Runtime domain crate anywhere. */
function checkDesktop(input, g) {
  const { packages, upstream, reach, revision } = g;
  const workspace = input.workspace_members.map(id => packages.get(id));
  assert.deepEqual(workspace.map(p => p.name), ['enouia-desktop'], 'the desktop workspace has one member');
  assert(upstream.size > 0 && revision, 'the desktop shell embeds Enouia Memory at a pinned revision');
  for (const p of input.packages) assert(!runtimeName(p.name), `Runtime domain crate in the desktop graph: ${p.name}`);
  for (const id of upstream) {
    reach(id, (target, tid) => assert(upstream.has(tid) || !target.name.startsWith('enouia-'), `Memory reaches a Runtime package: ${packages.get(id).name} -> ${target.name}`));
  }
  return { state: 'dependency_boundaries_passed', workspace: 'desktop', memoryPackages: upstream.size, memoryRevision: revision, scope: 'resolved_production_and_build_dependencies' };
}

function check(input) {
  const g = graph(input);
  const desktop = input.workspace_members.some(id => g.packages.get(id)?.name === 'enouia-desktop');
  return desktop ? checkDesktop(input, g) : checkDomain(input, g);
}

const result = check(metadata);
if (args.includes('--self-test')) {
  function rejects(change) { const copy = structuredClone(metadata); change(copy); assert.throws(() => check(copy)); }
  function add(input, from, to) {
    const source = input.packages.find(p => p.name === from);
    const target = input.packages.find(p => p.name === to);
    input.resolve.nodes.find(n => n.id === source.id).deps.push({ name: to, pkg: target.id, dep_kinds: [{ kind: null, target: null }] });
  }
  function fake(input, name, source) {
    const id = `${name}-fake`;
    input.packages.push({ id, name, source });
    input.resolve.nodes.push({ id, deps: [] });
    return name;
  }
  const pinned = `${MEMORY_SOURCE}?rev=${'a'.repeat(40)}#${'a'.repeat(40)}`;
  let count = 0;
  const negative = (change) => { rejects(change); count += 1; };
  negative(m => m.resolve = null);
  negative(m => fake(m, 'enouia-memory-index', `${MEMORY_SOURCE}?branch=main#${'b'.repeat(40)}`));
  negative(m => fake(m, 'enouia-memory-vault', null));
  if (result.workspace === 'domain') {
    negative(m => add(m, 'enouia-activity', 'enouia-memory'));
    negative(m => add(m, 'enouia-memory', 'enouia-activity'));
    negative(m => add(m, 'enouia-common', 'enouia-memory'));
    negative(m => add(m, 'enouia-provider', 'enouia-core-contract'));
    negative(m => add(m, 'enouia-memory', 'windows-sys'));
    negative(m => { fake(m, 'enouia-memory-contract', pinned); add(m, 'enouia-activity', 'enouia-memory-contract'); });
    negative(m => { fake(m, 'enouia-memory-contract', pinned); add(m, 'enouia-common', 'enouia-memory-contract'); });
  } else {
    negative(m => fake(m, 'enouia-activity', null));
    negative(m => { fake(m, 'enouia-common', null); add(m, 'enouia-memory-workspace', 'enouia-common'); });
    negative(m => { const other = `${MEMORY_SOURCE}?rev=${'c'.repeat(40)}#${'c'.repeat(40)}`; m.packages.find(p => p.name === 'enouia-memory-index').source = other; });
    negative(m => { m.workspace_members.push(fake(m, 'enouia-extra', null) + '-fake'); });
  }
  result.negativeChecks = count;
}
console.log(JSON.stringify(result, null, 2));
