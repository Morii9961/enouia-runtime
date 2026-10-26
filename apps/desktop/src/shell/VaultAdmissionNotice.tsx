import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { labels, msg, t } from '../i18n/index.ts';

export const admissionErrors: Record<string, string> = labels({
  root_in_use: msg('The requested Vault is already reserved by another Runtime. Exit that Runtime, then open the folder here.'),
  root_admission_failed: msg('Runtime could not reserve the requested Vault folder. Check folder access and choose it again.'),
  root_open_failed: msg('The requested Vault could not open. Choose a valid local Vault folder in Memory.'),
});

/** Host admission is separate from canonical workspace status. Paths stay native. */
export default function VaultAdmissionNotice() {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      try {
        const status = await invoke<{ vaultAdmissionError: string | null }>('shell_status');
        if (!stopped) setError(status.vaultAdmissionError);
      } catch { /* Canonical status already reports a disconnected host. */ }
      finally { if (!stopped) timer = setTimeout(refresh, 3000); }
    };
    void refresh();
    return () => { stopped = true; clearTimeout(timer); };
  }, []);
  return error ? <p role="alert" className="mem-error">{t(admissionErrors[error] ?? msg('Runtime could not open the requested Vault.'))}</p> : null;
}
