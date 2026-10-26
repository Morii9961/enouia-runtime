import { lazy, Suspense, useState } from 'react';
import { t } from '../i18n/index.ts';
import { setScBody, useScBody } from '../theme/sc-body';

const FontLicences = lazy(() => import('./FontLicences'));

export default function FontSettings() {
  const selected = useScBody();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);
  const choose = async (next: 'bundled' | 'original') => {
    setPending(true); setError(false);
    try { await setScBody(next); } catch { setError(true); }
    finally { setPending(false); }
  };
  return <details className="font-settings" onToggle={e => setOpen(e.currentTarget.open)}>
    <summary>{t('Fonts and licences')}</summary>
    <p>{t('Chinese body text uses Enouia Text SC, derived from LXGW Neo XiHei under IPA Font License 1.0.')}</p>
    <p>{t('To use the original font, download IPAexGothic from the original publisher, install it through Windows, then restart Runtime and select it below.')}</p>
    <p className="font-original-url">https://moji.or.jp/ipafont/ipafontdownload/</p>
    <div className="mem-actions" role="group" aria-label={t('Chinese body font')}>
      <button type="button" className="qr212" aria-pressed={selected === 'bundled'} disabled={pending} onClick={() => void choose('bundled')}>{t('Bundled font')}</button>
      <button type="button" className="qr212" aria-pressed={selected === 'original'} disabled={pending} onClick={() => void choose('original')}>{t('Use installed IPAexGothic')}</button>
    </div>
    {selected === 'original' && <p>{t('Using the installed original. If it is removed, Windows fallback fonts are used until it is installed again.')}</p>}
    {error && <p role="alert">{t('IPAexGothic is unavailable. Install the original font and restart Runtime before selecting it.')}</p>}
    {open && <Suspense fallback={<p>{t('Loading font licences…')}</p>}><FontLicences /></Suspense>}
  </details>;
}
