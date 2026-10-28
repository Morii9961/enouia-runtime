// Presentation-only tray IPC with the real i18n store; never native acceptance.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import TrayLanguage from '../src/shell/TrayLanguage';
import { setLang, type Lang } from '../src/i18n';
const flags = globalThis as typeof globalThis & { isTauri?: boolean; IS_REACT_ACT_ENVIRONMENT?: boolean };
const host = window as unknown as { __TAURI_INTERNALS__?: { invoke: (command: string, args: unknown) => Promise<void> } };
const oldNative = flags.isTauri, oldAct = flags.IS_REACT_ACT_ENVIRONMENT, oldInternals = host.__TAURI_INTERNALS__;
const fixture = document.getElementById('fixture')!, root = createRoot(fixture);
const checks: { id: string; ok: boolean }[] = [], calls: { command: string; args: { labels: Record<string, string> } }[] = [];
function check(id: string, ok: boolean) { checks.push({ id, ok }); if (!ok) throw new Error(id); }
flags.IS_REACT_ACT_ENVIRONMENT = true;
host.__TAURI_INTERNALS__ = { invoke: async (command, args) => { calls.push({ command, args: structuredClone(args) as { labels: Record<string, string> } }); } };
try {
  await setLang('en'); flags.isTauri = false;
  await act(async () => { root.render(<TrayLanguage key="browser" />); });
  check('browser_mount_does_not_invoke_native', calls.length === 0);
  flags.isTauri = true;
  await act(async () => { root.render(<TrayLanguage key="native" />); });
  const expected: [Lang, string[]][] = [
    ['en', ['Show Enouia Runtime', 'Quick Search', 'Lock Memory Vault', 'Exit Enouia Runtime']],
    ['zh-Hans', ['显示 Enouia Runtime', '快速检索', '锁定记忆库', '退出 Enouia Runtime']],
    ['ja', ['Enouia Runtime を表示', 'クイック検索', '記憶の保管庫をロック', 'Enouia Runtime を終了']],
  ];
  for (const [language, labels] of expected) {
    await act(async () => { await setLang(language); });
    const last = calls.at(-1)!;
    check(`${language}_updates_fixed_native_menu_labels`, last.command === 'shell_set_tray_labels' && JSON.stringify(last.args.labels) === JSON.stringify(Object.fromEntries(['show', 'search', 'lock', 'exit'].map((id, i) => [id, labels[i]]))));
  }
  const before = calls.length;
  await act(async () => { root.render(<TrayLanguage key="remount" />); });
  check('remount_uses_current_language', calls.length === before + 1 && calls.at(-1)!.args.labels.search === 'クイック検索');
  flags.isTauri = false;
  const after = calls.length;
  await act(async () => { await setLang('en'); });
  check('browser_language_change_does_not_invoke_native', calls.length === after);
} finally {
  await act(async () => { root.unmount(); });
  flags.isTauri = oldNative; flags.IS_REACT_ACT_ENVIRONMENT = oldAct; host.__TAURI_INTERNALS__ = oldInternals;
  document.getElementById('results')!.textContent = JSON.stringify({ checks, passed: checks.every(c => c.ok) });
}
