// DOM-model component journeys, never browser/Windows acceptance evidence.
// Each fixture gets its own process so React globals and IPC mocks cannot leak.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout, clearTimeout, setInterval, clearInterval, setImmediate, clearImmediate } from 'node:timers';

const operationBaseline = process.argv.includes('--operation-baseline');
assert.ok(!(operationBaseline && process.argv.includes('--settings-baseline')), 'Choose only one baseline');
const baseline = process.argv.includes('--settings-baseline') || operationBaseline;
const details = process.argv.includes('--details');
const fixtures = ['settings-exit-ownership', 'home-status-observation', 'memory-lifecycle-gate',
  'operation-stop-observation', 'operation-observation', 'operation-cancel'];
const desktop = fileURLToPath(new URL('..', import.meta.url));
const baselineSha = operationBaseline ? '290248b6cb37fe4e905970963793042b097bc7b8' : '6cb6920eab5ca5a84e23b7d9f55773cf3f61609d';
const baselineFile = operationBaseline ? 'ui.tsx' : 'status.tsx';

if (!process.argv.includes('--worker')) {
  const results = [];
  for (const fixture of operationBaseline ? ['operation-stop-observation'] : baseline ? fixtures.slice(0, 1) : fixtures) {
    const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--worker', fixture, ...(baseline ? [operationBaseline ? '--operation-baseline' : '--settings-baseline'] : [])],
      { cwd: desktop, encoding: 'utf8', timeout: 30000 });
    if (child.error) throw child.error;
    assert.equal(child.status, 0, `${fixture}: ${child.stderr || child.stdout}`);
    const result = JSON.parse(child.stdout);
    assert.ok(Array.isArray(result.checks) && result.checks.length > 0, `${fixture}: missing assertions`);
    if (baseline) {
      const failed = result.checks.filter(check => !check.ok).map(check => check.id);
      const expected = operationBaseline ? ['external_send', 'import'].flatMap(kind => ['acknowledged', 'completed', 'late_error']
        .map(outcome => `${kind}_${outcome}_new_observation_retires_obsolete_stop_error`)) : [
        'observed_exit_closes_startup_switch', 'exit_badge_is_not_open_indicator',
        'settings_exit_withholds_current_open_details', 'host_change_withholds_open_details_and_indicator',
        'local_exit_submission_closes_startup_immediately', 'exit_reply_keeps_startup_blocked',
        'startup_read_failure_has_explicit_recovery_during_exit',
      ];
      assert.deepEqual(failed.sort(), expected.sort());
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
  const baselinePath = normalizePath(fileURLToPath(new URL(`../src/memory/${baselineFile}`, import.meta.url)));
  const original = baseline ? execFileSync('git', ['show', `${baselineSha}:apps/desktop/src/memory/${baselineFile}`], { cwd: desktop, encoding: 'utf8' }) : null;
  const server = await createServer({ root: desktop, configFile: false, logLevel: 'silent',
    server: { middlewareMode: true, watch: null, hmr: false, ws: false }, appType: 'custom',
    plugins: original == null ? [] : [{ name: 'read-only-component-baseline', enforce: 'pre',
      load(id) { if (normalizePath(id) === baselinePath) return original; },
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
