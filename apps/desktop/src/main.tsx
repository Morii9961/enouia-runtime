import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { isTauri } from '@tauri-apps/api/core';
import QuickSearch from './shell/QuickSearch';
import './theme/negative-fonts.css';
import './quiet-runtime.css';
import './memory/memory.css';
import './activity/activity.css';
import './theme/negative.css';
import './theme/automemory.css';
import './theme/palettes.css';

// Colour only: the mode follows the system unless ?theme=dark|light is given; ?palette=1|2|3 picks within it.
const look = new URLSearchParams(location.search);
const scheme = matchMedia('(prefers-color-scheme: light)');
const applyLook = () => {
  const asked = look.get('theme');
  const mode = asked === 'light' || asked === 'dark' ? asked : scheme.matches ? 'light' : 'dark';
  const n = /^[123]$/.test(look.get('palette') ?? '') ? look.get('palette') : '1';
  document.documentElement.dataset.theme = mode;
  document.documentElement.dataset.palette = mode[0] + n;
};
applyLook();
scheme.addEventListener('change', applyLook);

class SurfaceBoundary extends React.Component<React.PropsWithChildren> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? (
      <main className="surface-error" role="alert">
        <h1>This surface could not open.</h1>
        <p>Reload to return Home. Fictional demo changes are cleared; Memory data stays in its Vault.</p>
        <button onClick={() => location.reload()}>Reload</button>
      </main>
    ) : this.props.children;
  }
}

const root = document.getElementById('root');
if (!root) throw new Error('The desktop root element is missing.');
createRoot(root).render(
  <React.StrictMode><SurfaceBoundary>{isTauri() && new URLSearchParams(location.search).get('view') === 'overlay' ? <QuickSearch /> : <App />}</SurfaceBoundary></React.StrictMode>,
);
