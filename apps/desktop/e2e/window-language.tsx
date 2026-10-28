// Real i18n store and publisher, synthetic IPC. No native window acceptance.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import WindowLanguage from '../src/shell/WindowLanguage';
import { lang, langPref, setLang, type Lang } from '../src/i18n';

const flags = globalThis as typeof globalThis & { isTauri?: boolean; IS_REACT_ACT_ENVIRONMENT?: boolean };
const host = window as unknown as { __TAURI_INTERNALS__?: { invoke: (command: string, args: unknown) => Promise<void> } };
const oldNative = flags.isTauri, oldAct = flags.IS_REACT_ACT_ENVIRONMENT, oldInternals = host.__TAURI_INTERNALS__;
const root = createRoot(document.getElementById('fixture')!);
const checks: { id: string; ok: boolean }[] = [], calls: { command: string; args: { labels: { quickSearch: string; finishingMemoryOperations: string } } }[] = [];
const check = (id: string, ok: boolean) => { checks.push({ id, ok }); if (!ok) throw new Error(id); };
const originalSet = Storage.prototype.setItem, originalRemove = Storage.prototype.removeItem;
let writes = 0, removals = 0;
Storage.prototype.setItem = function(key, value) { if (this === localStorage && key === 'enouia.lang') writes++; originalSet.call(this, key, value); };
Storage.prototype.removeItem = function(key) { if (this === localStorage && key === 'enouia.lang') removals++; originalRemove.call(this, key); };
const change = async (key: string | null, area: Storage = localStorage, expected?: Lang) => {
  await act(async () => {
    window.dispatchEvent(new StorageEvent('storage', { key, storageArea: area, newValue: key === null ? null : area.getItem(key) }));
    if (expected) {
      for (let n = 0; n < 250 && lang() !== expected; n++) await new Promise(resolve => setTimeout(resolve, 20));
      if (lang() !== expected) throw new Error('storage language did not settle');
    }
  });
};
flags.IS_REACT_ACT_ENVIRONMENT = true;
host.__TAURI_INTERNALS__ = { invoke: async (command, args) => { calls.push({ command, args: structuredClone(args) as typeof calls[number]['args'] }); } };
try {
  await setLang('system'); const systemLanguage = lang();
  await setLang('en'); flags.isTauri = false;
  await act(async () => { root.render(<WindowLanguage key="browser" />); });
  check('browser_does_not_update_native_titles', calls.length === 0);
  flags.isTauri = true;
  await act(async () => { root.render(<WindowLanguage key="native" />); });
  check('english_labels_use_closed_title_command', calls.at(-1)?.command === 'shell_set_window_labels' && calls.at(-1)?.args.labels.quickSearch === 'Quick Search' && calls.at(-1)?.args.labels.finishingMemoryOperations === 'finishing Memory operations');
  localStorage.setItem('enouia.lang', 'ja'); await change('unrelated');
  check('unrelated_storage_event_does_not_change_language', lang() === 'en');
  await change('enouia.lang', sessionStorage);
  check('session_storage_does_not_override_local_preference', lang() === 'en');
  const beforeExternalWrite = writes;
  await change('enouia.lang', localStorage, 'ja');
  check('external_choice_is_not_written_back', writes === beforeExternalWrite);
  check('local_storage_language_updates_titles', lang() === 'ja' && langPref() === 'ja' && calls.at(-1)?.args.labels.quickSearch === 'クイック検索' && calls.at(-1)?.args.labels.finishingMemoryOperations === '記憶の処理を終了しています');
  localStorage.setItem('enouia.lang', 'zh-Hans'); await change('enouia.lang', localStorage, 'zh-Hans');
  check('chinese_title_labels_are_current', lang() === 'zh-Hans' && calls.at(-1)?.args.labels.quickSearch === '快速检索' && calls.at(-1)?.args.labels.finishingMemoryOperations === '正在完成记忆操作');
  localStorage.removeItem('enouia.lang'); const beforeExternalRemoval = removals;
  await change('enouia.lang', localStorage, systemLanguage);
  check('external_removal_is_not_written_back', removals === beforeExternalRemoval);
  check('removing_override_restores_system_preference', langPref() === 'system' && localStorage.getItem('enouia.lang') === null);
  await act(async () => { await setLang('ja'); });
  localStorage.clear(); await change(null, localStorage, systemLanguage);
  check('storage_clear_restores_system_preference', langPref() === 'system');
} finally {
  await act(async () => { root.unmount(); });
  flags.isTauri = oldNative; flags.IS_REACT_ACT_ENVIRONMENT = oldAct; host.__TAURI_INTERNALS__ = oldInternals;
  Storage.prototype.setItem = originalSet; Storage.prototype.removeItem = originalRemove;
  document.getElementById('results')!.textContent = JSON.stringify({ checks, passed: checks.every(c => c.ok) });
}
