// The star map on a page of its own, to look at it alone (browser demo only, invented
// data). The dev server serves it at /starmap.html; the production build leaves it out,
// because vite.config.js builds index.html only. Same component and styles as the
// Star map view inside the automatic-memory preview, with its time map on top.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import StarMap from './screens/automemory/StarMap';
import TimeMap, { useLentMap } from './theme/TimeMap';
import './theme/negative-fonts.css';
import './quiet-runtime.css';
import './memory/memory.css';
import './theme/negative.css';
import './theme/automemory.css';
import './theme/palettes.css';
import './theme/motion.css';
import './theme/cjk-fonts.css';
import { moveAlong } from './theme/motion';
import { msg, ready, t, useLang } from './i18n/index.ts';

type Scheme = 'system' | 'dark' | 'light';
const system = matchMedia('(prefers-color-scheme: light)');
const asked = new URLSearchParams(location.search).get('theme');
let scheme: Scheme = asked === 'light' || asked === 'dark' ? asked : 'system';
const applyTheme = () => { document.documentElement.dataset.theme = scheme === 'system' ? (system.matches ? 'light' : 'dark') : scheme; };
applyTheme();
system.addEventListener('change', () => { if (scheme === 'system') moveAlong('theme', applyTheme); });

const NAMES: [Scheme, string][] = [['system', msg('System')], ['dark', msg('Tile Blue')], ['light', msg('Xuan Paper')]];

function Preview() {
  useLang();
  const lent = useLentMap();
  const [chosen, setChosen] = useState<Scheme>(scheme);
  const pick = (s: Scheme) => { scheme = s; setChosen(s); moveAlong('theme', applyTheme); };
  return (
    <div className="smp">
      <header className="bg-strip smp-head">
        <div className="bg-strip-head">
          <h1 className="smp-name">{t("Star map")}</h1>
          <p className="smp-note">{t("Standalone preview · generated sample of invented memories · nothing is read from a Vault")}</p>
          <div className="am-views smp-theme" role="group" aria-label={t("Palette")}>
            {NAMES.map(([id, name]) => <button key={id} type="button" className="am-view" aria-pressed={chosen === id} onClick={() => pick(id)}>{t(name)}</button>)}
          </div>
          <a className="smp-back" href="/">{t("Full preview")}</a>
        </div>
        {lent ? <TimeMap spec={lent} /> : <div className="tm tm-note"><span>{t("Time map")}</span></div>}
      </header>
      <main className="am smp-stage" data-view="starmap">
        <div className="am-main sm-host"><StarMap /></div>
      </main>
    </div>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('The preview root element is missing.');
await ready();
createRoot(root).render(<React.StrictMode><Preview /></React.StrictMode>);
