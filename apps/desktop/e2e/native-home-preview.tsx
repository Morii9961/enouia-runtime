// Browser-only visual fixture of the connected components. No native transport,
// Vault, credentials, Provider or writes. The watermark stays in every capture.
import { createRoot } from 'react-dom/client';
import App from '../src/App';
import { setTransport } from '../src/memory/client';
import { ready } from '../src/i18n/index';
import '../src/theme/negative-fonts.css';
import '../src/quiet-runtime.css';
import '../src/memory/memory.css';
import '../src/theme/negative.css';
import '../src/theme/palettes.css';
import '../src/theme/motion.css';
import '../src/theme/cjk-fonts.css';

const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get('theme') === 'light' ? 'light' : 'dark';
const state = params.get('state') ?? 'open';
setTransport(async (command, args) => {
  if (command === 'shell_status') return { vaultChanging: state === 'changing' };
  if (command !== 'memory_call' || (args.request as { command: string }).command !== 'workspace_status') throw new Error('visual_fixture_read_only');
  if (state === 'error') return { kind: 'memory_error', error: { code: 'storage_failed', retryable: false, rules: [] } };
  return { kind: 'memory_page', result: { vault: { state: state === 'changing' ? 'open' : state, vaultId: 'fictional-preview', rootName: 'Fictional Vault · not a personal library', headSequence: 7, lastCommitAt: new Date(Date.now() - 3_600_000).toISOString() }, pendingCandidates: 2, companion: { exiting: state === 'exiting' } } };
});
await ready();
createRoot(document.getElementById('fixture')!).render(<>
  <div style={{ position: 'fixed', right: 16, bottom: 2, zIndex: 100, background: 'var(--paper)', color: 'var(--ink)', fontSize: 12 }}>FICTIONAL FIXTURE · NO NATIVE CONNECTION</div>
  <App memoryConnected />
</>);
