import { useEffect } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { t, useLang } from '../i18n';

// Main owns both native window titles. Quick Search has no title-write grant.
export default function WindowLanguage() {
  const language = useLang();
  useEffect(() => {
    if (!isTauri()) return;
    void invoke('shell_set_window_labels', { labels: {
      quickSearch: t('Quick Search'),
      finishingMemoryOperations: t('finishing Memory operations'),
    } }).catch(() => console.warn('window_title_update_failed'));
  }, [language]);
  return null;
}
