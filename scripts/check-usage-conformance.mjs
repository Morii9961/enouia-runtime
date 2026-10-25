// Read-only cross-repository check. No install, private input discovery or network.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';
async function main() {
const root = fileURLToPath(new URL('../', import.meta.url));
const [dashboard, ...snapshots] = process.argv.slice(2);
if (!dashboard) throw new Error('explicit_dashboard_checkout_required');
const pin = JSON.parse(readFileSync(join(root, 'docs/integration/usage-pin.json'), 'utf8'));
if (!/^[a-f0-9]{40}$/.test(pin.source_commit ?? '')) throw new Error('published_pin_required');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
let files = 0;
for (const [local, expected] of Object.entries(pin.files)) {
  const suffix = local.replace('contracts/usage/dashboard/', '');
  const remote = 'packages/protocol/usage/' + suffix.replace(/^1\.0\//, '').replace(/^1\.1\//, 'v1.1/');
  const result = spawnSync('git', ['-C', resolve(dashboard), 'show', `${pin.source_commit}:${remote}`], { maxBuffer: 2 ** 20, windowsHide: true });
  if (result.status !== 0 || sha(result.stdout) !== expected || sha(readFileSync(join(root, local))) !== expected) throw new Error('published_bundle_drift');
  files++;
}
// The consumer implementation, not just its Schema, must match the published commit.
for (const args of [
  ['diff', '--quiet', '--no-ext-diff', '--no-textconv', pin.source_commit, '--', 'packages/protocol/src'],
  ['ls-files', '--others', '--exclude-standard', '--', 'packages/protocol/src'],
]) {
  const result = spawnSync('git', ['-C', resolve(dashboard), ...args], { maxBuffer: 2 ** 20, windowsHide: true });
  if (result.status !== 0 || result.stdout.length) throw new Error('consumer_source_drift');
}
const { parseUsage } = await import(pathToFileURL(resolve(dashboard, 'packages/protocol/src/usage.ts')).href);
let fixtures = 0;
for (const local of Object.keys(pin.files).filter((p) => /\/fixtures\//.test(p))) {
  const result = parseUsage(readFileSync(join(root, local), 'utf8'));
  if (result.ok !== /\/valid-/.test(local)) throw new Error('consumer_fixture_mismatch');
  fixtures++;
}
for (const path of snapshots) {
  if (!parseUsage(readFileSync(path, 'utf8')).ok) throw new Error('consumer_export_rejected');
}
console.log(`Usage conformance: ${files} published files, ${fixtures} fixtures, ${snapshots.length} Runtime exports accepted`);
}
main().catch(() => { console.error('usage_conformance_failed'); process.exitCode = 1; });
