import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { isTauri } from '@tauri-apps/api/core';
import QuickSearch from './shell/QuickSearch';
import './theme/negative-fonts.css';
import './quiet-runtime.css';
import './memory/memory.css';
import './theme/negative.css';
import './theme/automemory.css';
import './theme/palettes.css';
import './theme/motion.css';
import { moveAlong } from './theme/motion';
import { ready, t, useLang } from './i18n/index.ts';
import './theme/cjk-fonts.css';

// Colour only: Tile Blue when the system is dark, Xuan Paper when it is light (DESIGN.md §2).
// The browser demo also takes ?theme=dark|light, for screenshots.
const asked = new URLSearchParams(location.search).get('theme');
const scheme = matchMedia('(prefers-color-scheme: light)');
const applyTheme = () => {
  document.documentElement.dataset.theme = asked === 'light' || asked === 'dark' ? asked : scheme.matches ? 'light' : 'dark';
};
applyTheme();
// A system switch develops the window into the other palette (DESIGN.md §7).
scheme.addEventListener('change', () => moveAlong('theme', applyTheme));

class SurfaceBoundary extends React.Component<React.PropsWithChildren> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? (
      <main className="surface-error" role="alert">
        <h1>{t("This surface could not open.")}</h1>
        <p>Reload to return Home. Fictional demo changes are cleared; Memory data stays in its Vault.</p>
        <button onClick={() => location.reload()}>{t("Reload")}</button>
      </main>
    ) : this.props.children;
  }
}

const root = document.getElementById('root');
if (!root) throw new Error('The desktop root element is missing.');
// The root follows the interface language, so a change re-renders the whole tree in place.
function Root() {
  useLang();
  return isTauri() && new URLSearchParams(location.search).get('view') === 'overlay' ? <QuickSearch /> : <App />;
}
await ready();
createRoot(root).render(
  <React.StrictMode><SurfaceBoundary><Root /></SurfaceBoundary></React.StrictMode>,
);
