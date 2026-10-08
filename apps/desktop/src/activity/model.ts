// Pure view helpers for the Activity surface. They never invent history: a
// day is "known" only if the producer recorded it, explicit zeros stay zero,
// and a gap inside the recorded range is "missing", not zero.
import type { Day, Freshness, Overview, SourceId, SourceSummary } from "./client";

/** Optional pre-ADR-028 metadata cannot suppress a production confirmation. */
export function requiresRunConfirmation(packageMode: "sandbox" | "production" | undefined, producer: Overview["producer"]): boolean {
  return (packageMode === "production" || producer?.mode === "production") && producer?.deliveryEnabled !== false;
}

export type CellState = "known" | "missing" | "outside" | "future";
export type Cell = { date: string; state: CellState; value: number | null; level: number; incomplete: boolean };

const DAY_MS = 86_400_000;

export const LABELS: Record<SourceId, { title: string; unit: string; boundary: string }> = {
  github: { title: "GitHub", unit: "contributions", boundary: "GitHub calendar days" },
  codex: { title: "Codex", unit: "tokens", boundary: "Codex account day buckets (source boundary, not Beijing time)" },
  claude: { title: "Claude Code", unit: "tokens", boundary: "Asia/Shanghai days · local Claude Code and Cowork" },
};

export const FRESHNESS: Record<Freshness, { text: string; tone: "ok" | "warn" | "muted" }> = {
  fresh: { text: "Fresh", tone: "ok" },
  stale: { text: "Stale · older than 3 h", tone: "warn" },
  failed: { text: "Last attempt failed · history retained", tone: "warn" },
  no_data: { text: "No data yet", tone: "muted" },
};

/** Today's date label in Asia/Shanghai, the About page's reference day. */
export function dateInShanghai(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

const toMs = (date: string) => Date.parse(`${date}T00:00:00Z`);
const toDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const shiftDate = (date: string, days: number) => toDate(toMs(date) + days * DAY_MS);

/** Four intensity levels from the window's positive values (zero is level 0). */
export function thresholds(values: number[]): number[] {
  const positive = values.filter((v) => v > 0).sort((a, b) => a - b);
  if (!positive.length) return [];
  const at = (q: number) => positive[Math.floor(q * (positive.length - 1))];
  return [at(0.25), at(0.5), at(0.75)];
}

export function level(value: number, cuts: number[]): number {
  if (value <= 0 || !cuts.length) return 0;
  return 1 + cuts.filter((cut) => value > cut).length;
}

/**
 * The day that may still grow. Claude's boundary is Asia/Shanghai, so it is
 * the Shanghai day of the last success. GitHub and Codex keep their own
 * boundaries, so either of the two UTC days around it may still be open.
 */
export function currentDay(date: string, lastSuccessAt: string | null, shanghai: boolean): boolean {
  if (!lastSuccessAt || Number.isNaN(Date.parse(lastSuccessAt))) return false;
  if (shanghai) return date === dateInShanghai(new Date(lastSuccessAt));
  return date >= shiftDate(lastSuccessAt.slice(0, 10), -1);
}

/**
 * Week columns (Sunday first) ending at `asOf`'s week. `incomplete` marks the
 * latest recorded day when it is the source's current day.
 */
export function calendar(days: Day[], summary: Pick<SourceSummary, "firstDate" | "lastDate" | "lastSuccessAt">, asOf: string, weeks = 53, shanghai = false): Cell[][] {
  const end = toMs(asOf);
  const weekday = new Date(end).getUTCDay();
  const start = end - (weeks * 7 - 1 - (6 - weekday)) * DAY_MS;
  const known = new Map(days.map((d) => [d.date, d.value]));
  const visible: number[] = [];
  for (let t = start; t <= end; t += DAY_MS) {
    const v = known.get(toDate(t));
    if (v !== undefined) visible.push(v);
  }
  const cuts = thresholds(visible);
  const columns: Cell[][] = [];
  for (let w = 0; w < weeks; w++) {
    const column: Cell[] = [];
    for (let d = 0; d < 7; d++) {
      const t = start + (w * 7 + d) * DAY_MS;
      const date = toDate(t);
      const value = known.get(date);
      let state: CellState;
      if (t > end) state = "future";
      else if (value !== undefined) state = "known";
      else if (summary.firstDate && summary.lastDate && date > summary.firstDate && date < summary.lastDate) state = "missing";
      else state = "outside";
      const incomplete = state === "known" && date === summary.lastDate && currentDay(date, summary.lastSuccessAt, shanghai);
      column.push({ date, state, value: value ?? null, level: value === undefined ? 0 : level(value, cuts), incomplete });
    }
    columns.push(column);
  }
  return columns;
}

const grouped = new Intl.NumberFormat("en-US");
/** Exact grouping of a decimal string or safe integer; no float rounding. */
export function exact(value: string | number): string {
  try {
    return grouped.format(BigInt(value));
  } catch {
    return String(value);
  }
}

/** "4 min ago" style age from an ISO time; null when unknown. */
export function age(iso: string | null | undefined, now: number = Date.now()): string | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return null;
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 90) return `${s} s ago`;
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 172_800) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

export const DELIVERY: Record<string, string> = {
  unconfigured: "Delivery disabled · batch kept locally",
  idle: "Nothing pending",
  pending: "Pending · not yet sent",
  transported: "Sent · publication not yet observed",
  observed: "Publication observed",
  unverified: "Sent · publication unverified",
  paused: "Paused",
};

export const STAGES: Record<string, string> = {
  queued: "Queued",
  running: "Running in the installed runner",
  completed: "Completed",
  blocked: "Stopped before publication",
  failed: "Failed",
};

/** The runner's own outcome, when it reported one. */
export const RUN_STATES: Record<string, string> = {
  completed: "Batch published",
  publication_observed: "Earlier batch confirmed published",
  no_pending: "Nothing pending to retry",
  delivery_disabled: "New batch kept locally · delivery disabled",
  delivery_unresolved: "Batch kept pending · publication not observed",
  not_due: "Pending retry is not due yet",
  paused: "Activity sync is paused · nothing ran",
  busy: "Another run holds the Activity lock",
  cancelled: "Cancelled at the run deadline",
  invalid_config: "Configuration or transport prerequisite missing",
  collection_invalid: "Collection failed validation · nothing committed",
  unpublishable_history: "History cannot be published · nothing committed",
  clock_regression: "Clock moved backwards · nothing committed",
  batch_too_large: "Batch over 4 MiB · nothing committed",
  storage_failed: "Activity store failure",
};
