import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { isTauri } from '@tauri-apps/api/core';
import QuickSearch from './shell/QuickSearch';
import './quiet-runtime.css';
import './memory/memory.css';
import './activity/activity.css';

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
