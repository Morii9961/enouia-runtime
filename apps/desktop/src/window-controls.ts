import type { WindowAction } from './demo-types';
import { isTauri } from '@tauri-apps/api/core';

export const nativeWindow = isTauri();

export async function isWindowMaximized(): Promise<boolean> {
  if (!nativeWindow) return false;
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  return getCurrentWindow().isMaximized();
}

export async function controlWindow(action: WindowAction) {
  if (!nativeWindow) return;
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const window = getCurrentWindow();
  if (action === 'minimize') await window.minimize();
  else if (action === 'maximize') await window.toggleMaximize();
  else if (action === 'close') await window.close();
}
