// Calendar navigation only. workspace_status supplies one latest Vault commit,
// not a sampled signal, event history or a count of canonical memories.
import type { MapSpec } from './TimeMap';
import { lang, t } from '../i18n/index';

export const DAY = 86_400_000;
const OFFSET = 8 * 3_600_000;
export const nativeDay = (now: number) => Math.floor((now + OFFSET) / DAY) * DAY - OFFSET;
export const nativeDate = (at: number, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(lang(), { timeZone: 'Asia/Shanghai', ...options }).format(at);

export function nativeHomeSpec(now: number, scope: string): MapSpec {
  const end = nativeDay(now) + DAY, start = end - 21 * DAY;
  const date = (at: number) => nativeDate(at, { month: 'short', day: 'numeric' });
  return {
    key: `native-home:${scope}:${end}`, label: t('Home calendar · latest Vault commit only'),
    cells: 21, ticks: [], step: DAY, unit: 'day',
    labels: [0, 7, 14].map(i => ({ at: i / 21, text: date(start + i * DAY) })),
    now: (now - start) / (end - start),
    readout: (from, span) => `${date(from)} – ${date(from + span - 1)} · UTC+8`,
    jump: { label: 'Now', start: end - 4 * DAY },
    init: () => ({ start: end - 4 * DAY, span: 4 * DAY, domain: [start, end] }),
  };
}

export function observedCommit(vault: { lastCommitAt?: string; headSequence?: number } | null | undefined): number | null {
  const at = vault?.lastCommitAt ? Date.parse(vault.lastCommitAt) : NaN;
  return vault?.headSequence != null && Number.isFinite(at) ? at : null;
}
