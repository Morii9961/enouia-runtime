import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './quiet-runtime.css';
import './memory/memory.css';

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

createRoot(document.getElementById('root')).render(
  <React.StrictMode><SurfaceBoundary><App /></SurfaceBoundary></React.StrictMode>,
);
