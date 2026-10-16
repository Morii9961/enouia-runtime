// Actual header/settings, with synthetic startup and lifecycle commands only.
import { createRoot } from 'react-dom/client';
import { MemoryBadge, MemorySettings, MemoryStatusProvider, useStatus } from '../src/memory/status';
import { setTransport } from '../src/memory/client';
import '../src/quiet-runtime.css';
import '../src/memory/memory.css';

const fixture = document.getElementById('fixture')!, root = createRoot(fixture);
const checks: { id: string; ok: boolean }[] = [], calls: { command: string; args: Record<string, unknown> }[] = [];
let exiting = false, changing = false, failWrite = true, failRead = false, enabled = false, holdExit = false, holdRead = false;
let release: (() => void) | null = null;
const releasePending = () => { const resolve = release; release = null; resolve?.(); };
const startup = () => ({ supported: true, state: enabled ? 'enabled' : 'disabled', enabled });
setTransport(async (native, args) => {
  calls.push({ command: native, args });
  switch (native) {
    case 'shell_status': return { vaultChanging: changing };
    case 'startup_status':
      if (holdRead) { holdRead = false; await new Promise<void>(resolve => { release = resolve; }); }
      if (failRead) throw 'startup_read';
      return startup();
    case 'startup_set':
      if (failWrite) throw 'startup_write';
      enabled = args.enabled === true; return startup();
    case 'exit_app':
      if (holdExit) { holdExit = false; await new Promise<void>(resolve => { release = resolve; }); }
      return null;
    case 'memory_call': {
      const request = args.request as { command: string };
      if (request.command !== 'workspace_status') throw new Error(`Unexpected Core ${request.command}`);
      return { kind: 'memory_page', result: { vault: { state: 'open', rootName: 'Synthetic Vault', health: 'clean', headSequence: 7, ownerOnlyAcl: true, lastCommitAt: '2026-10-16T00:00:00Z' }, companion: { exiting }, components: [] } };
    }
    default: throw new Error(`Unexpected native ${native}`);
  }
});
function Control() {
  const { refresh, status, vaultChanging } = useStatus();
  return <button id="fixture-refresh" data-status={`${status?.companion?.exiting}:${vaultChanging}`} onClick={() => void refresh()}>Fixture: read status</button>;
}
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const text = () => fixture.textContent ?? '';
const button = (label: string) => [...fixture.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === label);
const toggle = () => fixture.querySelector<HTMLButtonElement>('[role="switch"]');
const retry = () => button('Retry');
const badgeOpen = () => fixture.querySelector<HTMLElement>('.qr223')?.style.background === 'var(--ok)';
async function wait(test: () => boolean) { for (let n = 0; n < 250; n++) { if (test()) return; await sleep(20); } throw new Error(`UI timeout: ${text()}`); }
function check(id: string, ok: boolean) { checks.push({ id, ok }); }
function click(control: HTMLButtonElement | null | undefined) { if (!control || control.disabled) throw new Error('Unavailable control'); control.click(); }
async function refresh() {
  click(button('Fixture: read status'));
  await wait(() => fixture.querySelector('#fixture-refresh')?.getAttribute('data-status') === `${exiting}:${changing}`);
}
async function mount(key: string) {
  root.render(<div key={key} data-case={key}><MemoryStatusProvider><Control /><MemoryBadge /><MemorySettings openMemory={() => {}} /></MemoryStatusProvider></div>);
  await wait(() => fixture.firstElementChild?.getAttribute('data-case') === key && !!toggle() && !!fixture.querySelector('.qr223'));
  await wait(() => fixture.querySelector('#fixture-refresh')?.getAttribute('data-status') === `${exiting}:${changing}`);
}
try {
  await mount('write'); await wait(() => toggle()?.disabled === false);
  check('open_status_exposes_current_details_and_indicator', badgeOpen() && text().includes('Last commit'));
  click(toggle()); await wait(() => !!fixture.querySelector('[role="alert"]'));
  const writes = () => calls.filter(c => c.command === 'startup_set');
  check('native_string_failure_keeps_original_setting_without_fake_retry', toggle()?.getAttribute('aria-checked') === 'false' && writes().length === 1 && !retry());
  exiting = true; await refresh();
  check('observed_exit_closes_startup_switch', toggle()?.disabled === true && !retry());
  check('exit_badge_is_not_open_indicator', !badgeOpen() && text().includes('Exiting, finishing operations'));
  check('settings_exit_withholds_current_open_details', !text().includes('Last commit') && !text().includes('Owner-only access'));
  check('observing_exit_never_replays_startup_write', writes().length === 1);
  exiting = false; changing = true; await refresh();
  check('host_change_withholds_open_details_and_indicator', !badgeOpen() && !text().includes('Last commit'));
  changing = false; await refresh(); await wait(() => toggle()?.disabled === false);
  check('fresh_status_restores_control_without_replay', badgeOpen() && text().includes('Last commit') && writes().length === 1);
  failWrite = false; click(toggle()); await wait(() => toggle()?.getAttribute('aria-checked') === 'true');
  check('new_explicit_gesture_changes_only_requested_setting', writes().length === 2 && writes().every(c => c.args.enabled === true));
  holdExit = true; click(button('Exit Enouia Runtime')); await wait(() => release != null);
  check('local_exit_submission_closes_startup_immediately', toggle()?.disabled === true);
  exiting = true; releasePending(); await wait(() => fixture.querySelector('#fixture-refresh')?.getAttribute('data-status') === 'true:false');
  check('exit_reply_keeps_startup_blocked', toggle()?.disabled === true);
  // Native string read failures need an explicit read-only recovery control.
  failRead = true; await mount('read'); await wait(() => !!fixture.querySelector('[role="alert"]'));
  check('startup_read_failure_has_explicit_recovery_during_exit', !!button('Read startup setting again') && toggle()?.disabled === true && !retry());
  if (button('Read startup setting again')) {
    failRead = false; const beforeReadRetry = writes().length; click(button('Read startup setting again'));
    await wait(() => !fixture.querySelector('[role="alert"]') && toggle()?.getAttribute('aria-checked') === 'true');
    check('read_recovery_observes_only_and_keeps_switch_blocked', writes().length === beforeReadRetry && toggle()?.disabled === true);
    exiting = false; await refresh(); await wait(() => toggle()?.disabled === false);
    holdRead = true; failRead = true; click(button('Read startup setting again')); await wait(() => release != null);
    check('pending_startup_read_keeps_previous_value_but_closes_switch', toggle()?.getAttribute('aria-checked') === 'true' && toggle()?.disabled === true);
    releasePending(); await wait(() => !!fixture.querySelector('[role="alert"]'));
    check('failed_refresh_labels_previous_observation_and_blocks_write', text().includes('Previous startup observation') && toggle()?.disabled === true && writes().length === beforeReadRetry);
    failRead = false; click(button('Read startup setting again')); await wait(() => toggle()?.disabled === false);
    check('successful_reread_restores_control_without_writing', toggle()?.getAttribute('aria-checked') === 'true' && writes().length === beforeReadRetry);
  }
  check('fixture_uses_only_status_startup_and_synthetic_exit', calls.every(c => ['shell_status', 'startup_status', 'startup_set', 'exit_app', 'memory_call'].includes(c.command)));
} catch (error) { checks.push({ id: String(error), ok: false }); }
finally { releasePending(); root.unmount(); document.getElementById('results')!.textContent = JSON.stringify({ checks, passed: checks.every(c => c.ok), startupWrites: calls.filter(c => c.command === 'startup_set') }, null, 2); }
