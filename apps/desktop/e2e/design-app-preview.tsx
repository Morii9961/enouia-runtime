// The browser design demo (fictional data) opened on a chosen surface, so the
// UI v2 reference and the native registered path are shot the same way.
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from '../src/App.tsx';
import { ready, useLang } from '../src/i18n/index.ts';
import { startTheme } from '../src/theme/scheme';
import '../src/theme/negative-fonts.css';
import '../src/quiet-runtime.css';
import '../src/memory/memory.css';
import '../src/theme/negative.css';
import '../src/theme/automemory.css';
import '../src/theme/palettes.css';
import '../src/theme/motion.css';
import '../src/theme/cjk-fonts.css';
import type { Page } from '../src/demo-types';

const page = (new URLSearchParams(location.search).get('page') ?? 'home') as Page;
startTheme();
function Preview() { useLang(); return <App memoryConnected={false} startPage={page} />; }
await ready();
createRoot(document.getElementById('root')!).render(<React.StrictMode><Preview /></React.StrictMode>);
