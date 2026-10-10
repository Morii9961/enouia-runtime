// Synthetic Activity IPC snapshots; never an installed package or personal history.
export const at = '2026-10-08T00:00:00.000Z';
export const source = (timezone, metric) => ({ timezone, metric, recordedDays: 2,
  firstDate: '2026-10-06', lastDate: '2026-10-07', total: '12',
  lastAttemptAt: at, lastSuccessAt: at, lastResult: 'success', freshness: 'fresh' });
export const overview = () => ({ schemaVersion: 1, kind: 'activity_overview', generatedAt: at,
  sources: { github: source('GitHub', 'contributions'), codex: source('Codex', 'tokens'), claude: source('Asia/Shanghai', 'tokens') },
  schedule: { mode: 'idle', nextTriggerAt: null, task: { registered: false, enabled: null } },
  delivery: { pendingSequence: null, lastTransportAt: null, publicationObservedAt: null, publicHash: null, state: 'idle' },
  producer: { mode: 'sandbox', deliveryEnabled: false, paused: false, highestReserved: 1 }, pending: null, health: [] });
export const preview = () => ({ schemaVersion: 1, kind: 'activity_public_preview', sha256: 'a'.repeat(64),
  data: { version: 1, sources: { github: { updatedAt: at, timezone: 'GitHub', metric: 'contributions',
    days: [{ date: '2026-10-06', value: 0 }, { date: '2026-10-07', value: 12 }] }, codex: null, claude: null } } });
