// Controlled transport examples, not saved native/Core evidence.
export const CAPABILITY = 'memory-runtime-owner-capture-native-1';
export const conversations = [
  { exchange: 0, user: 'Synthetic example: I prefer reading design notes in the morning.', assistant: 'Synthetic reply: noted.', content_lang: 'en' },
  { exchange: 1, user: '合成示例：我上周做了一个蓝色陶杯。', assistant: '合成回复：好的。', content_lang: 'zh-Hans' },
  { exchange: 2, user: 'Synthetic example: I still need to choose a pottery glaze <img id="capture-injected" src="invalid">', assistant: 'Synthetic reply: understood.', content_lang: 'en' },
];
export const status = (state = 'open') => ({ schema_version: 2, kind: 'runtime_memory_capture_status', capability: CAPABILITY, effect: 'native_read',
  mode: 'synthetic_owner_only', state, available: state === 'open', exchanges: 3, conversations });
export const receipt = (captured, replayed = false) => ({ captured, replayed, formation_scheduled: false, sources: [] });
export const preflight = (exchange, replayed = false) => ({ schema_version: 2, kind: 'runtime_memory_capture_preflight', effect: 'native_read', exchange, capture: receipt(false, replayed) });
export const write = (exchange, { replayed = false, queueError = null } = {}) => ({ schema_version: 2, kind: 'runtime_memory_capture_write', effect: 'native_write', exchange,
  capture: receipt(true, replayed), queue: queueError ? null : { state: 'queued' }, queue_error: queueError });
export const jobs = (exchange, states) => ({ schema_version: 2, kind: 'runtime_memory_capture_jobs', effect: 'native_read', exchange,
  jobs: states.map((state, n) => ({ job_key: `${exchange}${n}`.padEnd(64, 'a'), state, receipts: state === 'formed' ? 1 : 0, refused: 0 })) });
export const page = (titles) => ({ schema_version: 2, kind: 'catalog_memory_page', capability: 'memory-native-read-2', effect: 'native_read',
  authorized_at: '2026-11-07T00:00:00.000Z', matched_in_scope: titles.length, items: titles.map((title, n) => ({ title, content_lang: 'en',
    base: { memory: { memory_id: `mem_synthetic-${n}`, revision: 1 }, content: `Formed from: ${title}`, system_actor: { actor_type: 'system' } } })) });
