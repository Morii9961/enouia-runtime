import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { admissionErrors } from './VaultAdmissionNotice';

import { labels, msg, t } from '../i18n/index.ts';
type ShellStatus = { tray: 'present' | 'unavailable'; closing: boolean; locking: boolean; vaultChanging: boolean; error: string | null; visible: boolean; vaultAdmissionError: string | null; hotkey: { state: string; combo?: string; reason?: string } };
const STATES = [msg('checking'), msg('registered'), msg('conflict'), msg('unavailable')];
void STATES;
const errors: Record<string, string> = labels({
  lock_failed: msg('The Vault could not lock. Open Memory to inspect its status.'),
  shutdown_failed: msg('Memory shutdown did not finish. Try exiting again.'),
  window_failed: msg('The window could not be shown. Try the tray again.'),
});

/** Host lifecycle only. */
export default function ShellSettings() {
  const [status, setStatus] = useState<ShellStatus | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      try {
        const next = await invoke<ShellStatus>('shell_status');
        if (!stopped) { setStatus(next); setError(''); }
      } catch {
        if (!stopped) setError(t('Runtime window status is unavailable.'));
      } finally {
        // Serial polling; a delayed request never publishes over a newer one.
        if (!stopped) timer = setTimeout(refresh, 1000);
      }
    };
    void refresh();
    return () => { stopped = true; clearTimeout(timer); };
  }, []);

  const exit = async () => {
    setBusy(true); setError('');
    try { await invoke('shell_exit'); }
    catch { setError(t('Runtime could not exit. Try again.')); }
    finally { setBusy(false); }
  };

  return (
    <div className="qr65" aria-label={t("Windows shell")}>
      <div className="qr198">{t("Windows shell")}</div>
      <div className="qr216"><span className="qr35">{t("System tray")}</span><span>{status?.tray === 'present' ? t('Available · Show / Lock Memory Vault / Exit') : t('Checking…')}</span></div>
      <div className="qr216"><span className="qr35">{t("Close window")}</span><span>{t("Hide to tray · Memory operations keep running")}</span></div>
      <div className="qr216"><span className="qr35">{t("Quick Search")}</span><span>{status?.hotkey?.combo ?? 'Ctrl+Alt+M'} · {t(status?.hotkey?.state ?? 'checking')}{status?.hotkey?.state === 'conflict' ? ' · ' + t('shortcut already in use; use the tray or button') : ''}</span></div>
      <div className="qr216"><span className="qr35">{t("Search")}</span><button className="mem-button" type="button" disabled={status?.closing || status?.locking || status?.vaultChanging} onClick={() => {
        void invoke('shell_search').catch(() => setError(t('Quick Search could not open. Try again.')));
      }}>{t("Open Quick Search")}</button></div>
      {status?.locking && <div role="status" className="qr108">{t('Finishing Memory operations before locking. Model calls stop locally; read saved session outcomes after unlocking before sending again.')}</div>}
      {status?.vaultChanging && !status.locking && !status.closing && <div role="status" className="qr108">{t("Finishing Vault change…")}</div>}
      {status?.closing && <div role="status" className="qr108">{t('Finishing Memory operations before exiting. Model calls stop locally; this does not confirm remote cancellation.')}</div>}
      {status?.vaultAdmissionError && <div role="alert" className="mem-error">{t(admissionErrors[status.vaultAdmissionError] ?? 'Runtime could not open the requested Vault.')}</div>}
      {(error || status?.error) && <div role="alert" className="qr108">{error || t(errors[status?.error ?? ''] || 'A window action failed. Try again.')}</div>}
      <div className="qr216"><span className="qr35">{t("Exit")}</span><button className="mem-button" type="button" disabled={busy || status?.closing} onClick={() => void exit()}>{t("Exit Runtime")}</button></div>
    </div>
  );
}
