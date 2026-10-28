import { useEffect } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { t, useLang } from '../i18n';

// Mounted only by the main window. The hidden startup window also mounts it.
export default function TrayLanguage() {
  const language = useLang();
  useEffect(() => {
    if (!isTauri()) return;
    void invoke('shell_set_tray_labels', { labels: {
      show: t('Show Enouia Runtime'),
      search: t('Quick Search'),
      lock: t('Lock Memory Vault'),
      exit: t('Exit Enouia Runtime'),
    } }).catch(() => console.warn('tray_update_failed'));
  }, [language]);
  return null;
}
