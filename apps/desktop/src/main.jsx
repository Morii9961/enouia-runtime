import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import QuickSearch from './memory/QuickSearch.tsx';
import { nativeWindow } from './window-controls.js';
import './quiet-runtime.css';
import './memory/memory.css';
import './activity/activity.css';

class SurfaceBoundary extends React.Component {
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

// The shell's quick-search window loads the same page with ?view=overlay.
const quickSearch = nativeWindow && new URLSearchParams(location.search).get('view') === 'overlay';

createRoot(document.getElementById('root')).render(
  <React.StrictMode><SurfaceBoundary>{quickSearch ? <QuickSearch /> : <App />}</SurfaceBoundary></React.StrictMode>,
);
