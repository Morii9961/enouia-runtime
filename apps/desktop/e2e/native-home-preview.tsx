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
const page = params.get('page') === 'sessions' ? 'sessions' : 'home';
const transcript = params.get('transcript') ?? 'known';
setTransport(async (command, args) => {
  if (command === 'shell_status') return { vaultChanging: state === 'changing' };
  if (command === 'memory_provider_setup') return { state: 'absent' };
  if (command !== 'memory_call') throw new Error('visual_fixture_read_only');
  const request = args.request as { command: string; arguments: { sessionId: string; branchId: string } };
  if (request.command === 'operation_list') return { kind: 'memory_page', result: { items: [] } };
  if (request.command === 'provider_status') return { kind: 'memory_page', result: { configured: false, destinations: [], grants: [] } };
  if (request.command === 'session_list') return { kind: 'memory_page', result: { items: ['one', 'two'].map(name => ({ sessionId: `fictional-session-${name}`, updatedAt: '2026-11-01T05:00:00Z', branches: [{ branchId: `fictional-branch-${name}`, lastEventSeq: 24 }] })) } };
  if (request.command === 'session_detail') {
    if (transcript === 'error') return { kind: 'memory_error', error: { code: 'storage_failed', retryable: false, rules: [] } };
    const events = Array.from({ length: transcript === 'empty' ? 0 : 24 }, (_, i) => ({
      eventId: `fictional-event-${i}`, kind: i === 8 || i === 19 ? 'checkpoint_created' : i % 2 ? 'assistant_completed' : 'user_message', deliveryState: i % 2 ? 'completed' : 'not_applicable',
      occurredAt: transcript === 'unknown' && i === 4 ? null : new Date(Date.parse('2026-11-01T02:00:00Z') + (transcript === 'reversed' && i === 4 ? 0 : i) * 180_000).toISOString(),
      text: `${request.arguments.sessionId} · Fictional saved event ${i + 1}. This is a browser fixture, not a personal conversation.\nSynthetic text is kept literal: <example>, 中文与日本語の確認。`,
    }));
    return { kind: 'memory_page', result: { ...request.arguments, transcript: events, turns: [], checkpoints: [], invocations: [], extractionJobs: [], lastSavedEventId: events.at(-1)?.eventId ?? null } };
  }
  if (request.command !== 'workspace_status') throw new Error('visual_fixture_read_only');
  if (state === 'error') return { kind: 'memory_error', error: { code: 'storage_failed', retryable: false, rules: [] } };
  return { kind: 'memory_page', result: { vault: { state: state === 'changing' ? 'open' : state, vaultId: 'fictional-preview', rootName: 'Fictional Vault · not a personal library', headSequence: 7, lastCommitAt: new Date(Date.now() - 3_600_000).toISOString() }, pendingCandidates: 2, companion: { exiting: state === 'exiting' } } };
});
await ready();
createRoot(document.getElementById('fixture')!).render(<>
  <div style={{ position: 'fixed', right: 16, bottom: 2, zIndex: 100, background: 'var(--paper)', color: 'var(--ink)', fontSize: 12 }}>FICTIONAL FIXTURE · NO NATIVE CONNECTION</div>
  <App memoryConnected startPage={page} />
</>);
