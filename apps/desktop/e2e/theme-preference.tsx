// Theme choice through the real Settings row and the shared local preference; Happy DOM, no browser.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import Settings from '../src/screens/Settings';
import type { DemoView } from '../src/App';
import { startTheme } from '../src/theme/scheme';

const flags = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
flags.IS_REACT_ACT_ENVIRONMENT = true;
const fixture = document.getElementById('fixture')!, root = createRoot(fixture);
const checks: { id: string; ok: boolean }[] = [];
const check = (id: string, ok: boolean) => { checks.push({ id, ok }); };
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function wait(test: () => boolean) { for (let n = 0; n < 150; n++) { if (test()) return; await act(() => sleep(20)); } throw new Error(`theme timeout: ${theme()}`); }
const theme = () => document.documentElement.dataset.theme;
const button = (name: string) => [...fixture.querySelectorAll<HTMLButtonElement>('[role="group"][aria-label="Theme"] button')].find(b => b.textContent?.trim() === name)!;
const pressed = (name: string) => button(name).getAttribute('aria-pressed') === 'true';
try {
  localStorage.removeItem('enouia.theme');
  startTheme();
  check('follows_system_by_default', theme() === 'light');
  await act(async () => root.render(<Settings view={{ keyboardHint: '', memorySettings: null, motionOpts: [], shellSettings: null } as unknown as DemoView} />));
  check('follow_system_is_the_pressed_choice', pressed('Follow system') && !pressed('Tile Blue') && !pressed('Xuan Paper'));
  await act(async () => button('Tile Blue').click()); await wait(() => theme() === 'dark');
  check('tile_blue_applies_and_is_kept_locally', localStorage.getItem('enouia.theme') === 'dark' && pressed('Tile Blue') && !pressed('Follow system'));
  await act(async () => button('Xuan Paper').click()); await wait(() => theme() === 'light');
  check('xuan_paper_applies_and_is_kept_locally', localStorage.getItem('enouia.theme') === 'light' && pressed('Xuan Paper'));
  await act(async () => button('Follow system').click());
  check('follow_system_clears_the_choice', localStorage.getItem('enouia.theme') === null && theme() === 'light' && pressed('Follow system'));
  // Quick Search and the main window share the preference through the storage event.
  localStorage.setItem('enouia.theme', 'dark');
  await act(async () => { window.dispatchEvent(new StorageEvent('storage', { key: 'enouia.theme', newValue: 'dark', storageArea: localStorage })); });
  await wait(() => theme() === 'dark');
  check('another_window_choice_is_followed_without_writing_back', pressed('Tile Blue') && localStorage.getItem('enouia.theme') === 'dark');
} catch (error) { checks.push({ id: String(error), ok: false }); }
finally { root.unmount(); document.getElementById('results')!.textContent = JSON.stringify({ checks, passed: checks.every(c => c.ok) }); }
