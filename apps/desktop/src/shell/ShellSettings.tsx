import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

type ShellStatus = { tray: 'present' | 'unavailable'; closing: boolean; locking: boolean; error: string | null; visible: boolean; hotkey: { state: string; combo?: string; reason?: string } };
const errors: Record<string, string> = {
  lock_failed: 'The Vault could not lock. Open Memory to inspect its status.',
  shutdown_failed: 'Memory shutdown did not finish. Try exiting again.',
  window_failed: 'The window could not be shown. Try the tray again.',
};

/** Host lifecycle only. Activity and the installed scheduler stay separate. */
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
        if (!stopped) setError('Runtime window status is unavailable.');
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
    catch { setError('Runtime could not exit. Try again.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="qr65" aria-label="Windows shell">
      <div className="qr198">Windows shell</div>
      <div className="qr216"><span className="qr35">System tray</span><span>{status?.tray === 'present' ? 'Available · Show / Lock Memory Vault / Exit' : 'Checking…'}</span></div>
      <div className="qr216"><span className="qr35">Close window</span><span>Hide to tray · Memory operations keep running</span></div>
      <div className="qr216"><span className="qr35">Quick Search</span><span>{status?.hotkey?.combo ?? 'Ctrl+Alt+M'} · {status?.hotkey?.state ?? 'checking'}{status?.hotkey?.state === 'conflict' ? ' · shortcut already in use; use the tray or button' : ''}</span></div>
      <div className="qr216"><span className="qr35">Search</span><button className="mem-button" type="button" disabled={status?.closing || status?.locking} onClick={() => {
        void invoke('shell_search').catch(() => setError('Quick Search could not open. Try again.'));
      }}>Open Quick Search</button></div>
      {status?.locking && <div role="status" className="qr108">Finishing Memory operations before locking…</div>}
      {status?.closing && <div role="status" className="qr108">Finishing Memory operations before exiting…</div>}
      {(error || status?.error) && <div role="alert" className="qr108">{error || errors[status?.error ?? ''] || 'A window action failed. Try again.'}</div>}
      <div className="qr216"><span className="qr35">Exit</span><button className="mem-button" type="button" disabled={busy || status?.closing} onClick={() => void exit()}>Exit Runtime</button></div>
    </div>
  );
}
