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

function check(input) {
  assert.equal(input.version, 1);
  assert(input.resolve?.nodes, 'resolved Cargo metadata required; do not pass --no-deps');
  const packages = new Map(input.packages.map(p => [p.id, p]));
  const nodes = new Map(input.resolve.nodes.map(n => [n.id, n]));
  const workspace = input.workspace_members.map(id => packages.get(id));
  const activity = new Set(workspace.filter(p => p.name.startsWith('enouia-activity')).map(p => p.name));
  assert.equal(workspace.length, 12, 'new workspace ownership needs explicit boundary review');
  assert.equal(activity.size, 5);
  for (const pkg of workspace) {
    assert(core.has(pkg.name) || activity.has(pkg.name) || shared.has(pkg.name), `unclassified module: ${pkg.name}`);
    const node = nodes.get(pkg.id);
    assert(node, 'workspace node missing');
    if (pureDependencies[pkg.name]) {
      const production = node.deps.filter(d => d.dep_kinds.some(k => k.kind === null || k.kind === 'build')).map(d => packages.get(d.pkg).name);
      assert.deepEqual([...new Set(production)].sort(), [...pureDependencies[pkg.name]].sort(), `pure contract dependency changed: ${pkg.name}`);
    }
    const seen = new Set();
    function visit(id) {
      if (seen.has(id)) return;
      seen.add(id);
      const target = packages.get(id);
      assert(target, 'unresolved package');
      if (activity.has(pkg.name)) assert(!core.has(target.name), `Activity reaches Core: ${pkg.name} -> ${target.name}`);
      if (core.has(pkg.name)) assert(!activity.has(target.name), `Core reaches Activity: ${pkg.name} -> ${target.name}`);
      if (shared.has(pkg.name)) assert(!core.has(target.name) && !activity.has(target.name), `shared adapter reaches a domain: ${pkg.name}`);
      for (const dep of nodes.get(id)?.deps ?? []) {
        if (dep.dep_kinds.some(k => k.kind === null || k.kind === 'build')) visit(dep.pkg);
      }
    }
    visit(pkg.id);
  }
  assert(!nodes.get(workspace.find(p => p.name === 'enouia-provider').id).deps.some(d => packages.get(d.pkg).name === 'enouia-core-contract'), 'Provider must not depend on local UI contract');
  return { state: 'dependency_boundaries_passed', workspaceModules: 12, activityModules: 5, coreModules: 5, sharedModules: 2, scope: 'resolved_production_and_build_dependencies' };
}

const result = check(metadata);
if (args.includes('--self-test')) {
  function rejects(change) { const copy = structuredClone(metadata); change(copy); assert.throws(() => check(copy)); }
  function add(input, from, to) {
    const source = input.packages.find(p => p.name === from);
    const target = input.packages.find(p => p.name === to);
    input.resolve.nodes.find(n => n.id === source.id).deps.push({ name: to, pkg: target.id, dep_kinds: [{ kind: null, target: null }] });
  }
  rejects(m => add(m, 'enouia-activity', 'enouia-memory'));
  rejects(m => add(m, 'enouia-memory', 'enouia-activity'));
  rejects(m => add(m, 'enouia-common', 'enouia-memory'));
  rejects(m => add(m, 'enouia-provider', 'enouia-core-contract'));
  rejects(m => add(m, 'enouia-memory', 'windows-sys'));
  rejects(m => m.resolve = null);
  result.negativeChecks = 6;
}
console.log(JSON.stringify(result, null, 2));
