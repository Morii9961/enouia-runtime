import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './quiet-runtime.css';

class SurfaceBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? (
      <main className="surface-error" role="alert">
        <h1>This surface could not open.</h1>
        <p>Reload the demo to return Home. Demo changes will be cleared.</p>
        <button onClick={() => location.reload()}>Reload demo</button>
      </main>
    ) : this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode><SurfaceBoundary><App /></SurfaceBoundary></React.StrictMode>,
);
