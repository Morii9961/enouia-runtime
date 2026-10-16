// DOM-model component journeys, never browser/Windows acceptance evidence.
// Each fixture gets its own process so React globals and IPC mocks cannot leak.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout, clearTimeout, setInterval, clearInterval, setImmediate, clearImmediate } from 'node:timers';

const baseline = process.argv.includes('--settings-baseline');
const details = process.argv.includes('--details');
const fixtures = ['settings-exit-ownership', 'home-status-observation', 'memory-lifecycle-gate'];
const desktop = fileURLToPath(new URL('..', import.meta.url));
const baselineSha = '6cb6920eab5ca5a84e23b7d9f55773cf3f61609d';

if (!process.argv.includes('--worker')) {
  const results = [];
  for (const fixture of baseline ? fixtures.slice(0, 1) : fixtures) {
    const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--worker', fixture, ...(baseline ? ['--settings-baseline'] : [])],
      { cwd: desktop, encoding: 'utf8', timeout: 30000 });
    if (child.error) throw child.error;
    assert.equal(child.status, 0, `${fixture}: ${child.stderr || child.stdout}`);
    const result = JSON.parse(child.stdout);
    assert.ok(Array.isArray(result.checks) && result.checks.length > 0, `${fixture}: missing assertions`);
    if (baseline) {
      const failed = result.checks.filter(check => !check.ok).map(check => check.id);
      assert.deepEqual(failed.sort(), [
        'observed_exit_closes_startup_switch', 'exit_badge_is_not_open_indicator',
        'settings_exit_withholds_current_open_details', 'host_change_withholds_open_details_and_indicator',
        'local_exit_submission_closes_startup_immediately', 'exit_reply_keeps_startup_blocked',
        'startup_read_failure_has_explicit_recovery_during_exit',
      ].sort());
    } else assert.equal(result.passed, true, JSON.stringify(result.checks.filter(check => !check.ok)));
    results.push(result);
  }
  process.stdout.write(`${JSON.stringify({ environment: 'Happy DOM 21.0.3; no real browser or native IPC', baseline: baseline ? baselineSha : null, expectedBaselineFailures: baseline,
    results: details ? results : results.map(result => ({ fixture: result.fixture, checks: result.checks.length, passed: result.passed,
      failedChecks: result.checks.filter(check => !check.ok).map(check => check.id) })),
  }, null, 2)}\n`);
} else {
  const fixture = process.argv[process.argv.indexOf('--worker') + 1];
  assert.ok(fixtures.includes(fixture), 'Only the named repository fixtures can run');
  const { GlobalRegistrator } = await import('@happy-dom/global-registrator');
  GlobalRegistrator.register({ url: 'http://127.0.0.1/', settings: {
    enableJavaScriptEvaluation: false, disableJavaScriptFileLoading: true,
    enableCSSFileLoading: false, enableImageFileLoading: false,
  } });
  // Vite uses Node timer handles (.unref). Fixture unmounts clear React polls;
  // DOM close does not claim to track these native timers.
  Object.assign(globalThis, { setTimeout, clearTimeout, setInterval, clearInterval, setImmediate, clearImmediate });
  const { createServer, normalizePath } = await import('vite');
  const statusPath = normalizePath(fileURLToPath(new URL('../src/memory/status.tsx', import.meta.url)));
  const original = baseline ? execFileSync('git', ['show', `${baselineSha}:apps/desktop/src/memory/status.tsx`], { cwd: desktop, encoding: 'utf8' }) : null;
  const server = await createServer({ root: desktop, configFile: false, logLevel: 'silent',
    server: { middlewareMode: true, watch: null, hmr: false, ws: false }, appType: 'custom',
    plugins: original == null ? [] : [{ name: 'read-only-settings-baseline', enforce: 'pre',
      load(id) { if (normalizePath(id) === statusPath) return original; },
    }],
  });
  try {
    document.body.innerHTML = '<div id="fixture"></div><pre id="results">Running…</pre>';
    await server.ssrLoadModule(`/e2e/${fixture}.tsx`);
    const result = JSON.parse(document.getElementById('results').textContent);
    process.stdout.write(JSON.stringify({ fixture, ...result }));
  } finally {
    await server.close();
    // React may still have an already queued scheduler callback after unmount.
    // Keep this worker's globals until process exit; close DOM resources now.
    await globalThis.happyDOM.close();
  }
}
