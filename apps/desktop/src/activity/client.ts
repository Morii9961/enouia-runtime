// Runtime's Activity client (ADR-028). The page reaches the independently
// installed producer only through the shell's `activity_call` (Activity IPC
// v1, contracts/ipc/activity-v1.schema.json) and `activity_setup` commands.
// It never sees a path, a raw report or an executable to run. Activity stays
// outside Memory and Context: nothing here imports the Memory client.
import { invoke } from "@tauri-apps/api/core";

export const SOURCES = ["github", "codex", "claude"] as const;
export type SourceId = (typeof SOURCES)[number];
export type Freshness = "no_data" | "fresh" | "stale" | "failed";
export type ErrorCode =
  | "busy" | "unconfigured" | "unsupported_method" | "source_invalid"
  | "clock_regression" | "storage_failed" | "delivery_unverified" | "contract_invalid";
export type StructuredError = { code: ErrorCode; component: string; retryable: boolean };

export type SourceSummary = {
  timezone: "GitHub" | "Codex" | "Asia/Shanghai";
  metric: "contributions" | "tokens";
  recordedDays: number;
  firstDate: string | null;
  lastDate: string | null;
  /** Exact decimal string; never rounded through a float. */
  total: string;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastResult: "unknown" | "success" | "failed";
  freshness: Freshness;
};

export type Health = {
  id: string;
  state: "healthy" | "degraded" | "unavailable" | "recovering";
  mode: "unconfigured" | "idle" | "running" | "paused";
  observedAt: string | null;
  lastSuccessAt: string | null;
  ageSeconds: number | null;
};

export type Overview = {
  schemaVersion: 1;
  kind: "activity_overview";
  generatedAt?: string | null;
  sources: Record<SourceId, SourceSummary>;
  schedule: {
    mode: "unconfigured" | "idle" | "running" | "paused";
    nextTriggerAt: string | null;
    task?: { registered: boolean; enabled: boolean | null } | null;
  };
  delivery: {
    pendingSequence: number | null;
    lastTransportAt: string | null;
    publicationObservedAt: string | null;
    publicHash: string | null;
    state: "unconfigured" | "idle" | "pending" | "transported" | "observed" | "unverified" | "paused";
  };
  producer?: { mode: "sandbox" | "production"; deliveryEnabled: boolean; paused: boolean; highestReserved: number };
  pending?: {
    sequence: number; createdAt: string | null; ageSeconds: number; exactSha256: string;
    failureCount: number; nextEligibleAt: string | null; lastErrorCode: ErrorCode | null;
  } | null;
  health: Health[];
};

export type Day = { date: string; value: number };
export type Snapshot = { updatedAt: string; timezone: string; metric: string; days: Day[] };
export type Preview = {
  schemaVersion: 1;
  kind: "activity_public_preview";
  data: { version: 1; sources: Record<SourceId, Snapshot | null> };
  sha256: string;
};
export type RunStatus = {
  schemaVersion: 1;
  kind: "activity_run_status";
  runId: string;
  stage: "queued" | "running" | "collecting" | "persisting" | "uploading" | "observing" | "completed" | "failed" | "blocked";
  error: StructuredError | null;
  operation?: "activity_run_now" | "activity_retry_pending" | "activity_set_paused";
  summary?: Record<string, unknown> | null;
};
export type SetupErrorCode = "not_found" | "not_a_package" | "binary_changed";
export type Setup =
  | { configured: false; error?: SetupErrorCode; cancelled?: undefined; saved?: boolean }
  | { configured: true; mode: "sandbox" | "production"; taskName: string; folder: string | null; saved?: boolean }
  | { cancelled: true; configured?: undefined };

export class ActivityError extends Error {
  readonly error: StructuredError;
  constructor(error: StructuredError) {
    super(error.code);
    this.error = error;
  }
}

type Transport = (command: string, args: Record<string, unknown>) => Promise<unknown>;
let transport: Transport = (command, args) => invoke(command, args);

/** Replace the shell transport. Only tests use this; production never does. */
export function setTransport(next: Transport): void {
  transport = next;
}

type ObjectValue = Record<string, unknown>;
const object = (value: unknown): value is ObjectValue => value !== null && typeof value === "object" && !Array.isArray(value);
const nullableTimestamp = (value: unknown) => value === null || timestamp(value);
const natural = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const hash = (value: unknown) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const inList = (value: unknown, values: readonly string[]) => typeof value === "string" && values.includes(value);
const modes = ["unconfigured", "idle", "running", "paused"];
const errorCodes = ["busy", "unconfigured", "unsupported_method", "source_invalid", "clock_regression", "storage_failed", "delivery_unverified", "contract_invalid"];
const componentIds = ["core", "vault", "memory_index", "provider", "session", "activity_collector_github", "activity_collector_codex", "activity_collector_claude", "activity_archive", "activity_scheduler", "activity_delivery"];
const summaryFields = ["timezone", "metric", "recordedDays", "firstDate", "lastDate", "total", "lastAttemptAt", "lastSuccessAt", "lastResult", "freshness"];

function closed(value: unknown, required: readonly string[], optional: readonly string[] = []): value is ObjectValue {
  return object(value) && required.every(key => Object.hasOwn(value, key))
    && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
}
const sourceMetadata = {
  github: { timezone: "GitHub", metric: "contributions" },
  codex: { timezone: "Codex", metric: "tokens" },
  claude: { timezone: "Asia/Shanghai", metric: "tokens" },
} as const;

function realDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4)), month = Number(value.slice(5, 7)), day = Number(value.slice(8, 10));
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const limit = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return month >= 1 && month <= 12 && day >= 1 && day <= limit;
}

// Keep the producer's supported date-only and explicit-offset ISO forms.
// Calendar/time bounds are checked directly; Date.parse can roll bad dates.
function timestamp(value: unknown): boolean {
  if (realDate(value)) return true;
  if (typeof value !== "string") return false;
  const parts = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  return parts !== null && realDate(parts[1]) && Number(parts[2]) < 24 && Number(parts[3]) < 60
    && (parts[4] === undefined || Number(parts[4]) < 60)
    && (parts[6] === "Z" || Number(parts[7]) < 24 && Number(parts[8]) < 60);
}

function sourceSet(value: unknown): value is Record<SourceId, unknown> {
  return object(value) && Object.keys(value).length === SOURCES.length && SOURCES.every(id => Object.hasOwn(value, id));
}

function recordedDays(value: unknown): value is Day[] {
  if (!Array.isArray(value)) return false;
  let previous = "", total = 0;
  for (const day of value) {
    if (!closed(day, ["date", "value"]) || !realDate(day.date) || day.date <= previous || !natural(day.value)) return false;
    total += day.value;
    if (!Number.isSafeInteger(total)) return false;
    previous = day.date;
  }
  return true;
}

const validError = (value: unknown): value is StructuredError => closed(value, ["code", "component", "retryable"])
  && inList(value.code, errorCodes) && inList(value.component, componentIds) && typeof value.retryable === "boolean";

function summary(value: unknown, id: SourceId): boolean {
  return closed(value, summaryFields) && value.timezone === sourceMetadata[id].timezone
    && value.metric === sourceMetadata[id].metric && natural(value.recordedDays)
    && (value.recordedDays === 0 ? value.firstDate === null && value.lastDate === null
      : realDate(value.firstDate) && realDate(value.lastDate) && value.firstDate <= value.lastDate)
    && typeof value.total === "string" && /^(0|[1-9][0-9]*)$/.test(value.total)
    && nullableTimestamp(value.lastAttemptAt) && nullableTimestamp(value.lastSuccessAt)
    && inList(value.lastResult, ["unknown", "success", "failed"])
    && inList(value.freshness, ["no_data", "fresh", "stale", "failed"]);
}

/** Reject malformed replies before they can crash a shared desktop surface. */
function validReply(reply: ObjectValue, kind: string): boolean {
  if (kind === "activity_overview") {
    if (!closed(reply, ["schemaVersion", "kind", "sources", "schedule", "delivery", "health"], ["generatedAt", "producer", "pending"])
      || (reply.generatedAt !== undefined && !nullableTimestamp(reply.generatedAt))) return false;
    const sources = reply.sources;
    if (!sourceSet(sources) || !SOURCES.every(id => summary(sources[id], id))) return false;
    const s = reply.schedule, d = reply.delivery;
    if (!closed(s, ["mode", "nextTriggerAt"], ["task"]) || !inList(s.mode, modes) || !nullableTimestamp(s.nextTriggerAt)
      || (s.task != null && (!closed(s.task, ["registered", "enabled"]) || typeof s.task.registered !== "boolean" || !(s.task.enabled === null || typeof s.task.enabled === "boolean")))) return false;
    if (!closed(d, ["pendingSequence", "lastTransportAt", "publicationObservedAt", "publicHash", "state"]) || !(d.pendingSequence === null || natural(d.pendingSequence))
      || !nullableTimestamp(d.lastTransportAt) || !nullableTimestamp(d.publicationObservedAt)
      || !(d.publicHash === null || hash(d.publicHash))
      || !inList(d.state, ["unconfigured", "idle", "pending", "transported", "observed", "unverified", "paused"])) return false;
    if (reply.producer != null && (!closed(reply.producer, ["mode", "deliveryEnabled", "paused", "highestReserved"]) || !inList(reply.producer.mode, ["sandbox", "production"])
      || typeof reply.producer.paused !== "boolean" || typeof reply.producer.deliveryEnabled !== "boolean" || !natural(reply.producer.highestReserved))) return false;
    if (reply.pending != null && (!closed(reply.pending, ["sequence", "createdAt", "ageSeconds", "exactSha256", "failureCount", "nextEligibleAt", "lastErrorCode"]) || !natural(reply.pending.sequence)
      || !natural(reply.pending.failureCount) || !hash(reply.pending.exactSha256) || !natural(reply.pending.ageSeconds)
      || !nullableTimestamp(reply.pending.createdAt) || !nullableTimestamp(reply.pending.nextEligibleAt)
      || !(reply.pending.lastErrorCode === null || inList(reply.pending.lastErrorCode, errorCodes)))) return false;
    return Array.isArray(reply.health) && reply.health.every(h => closed(h, ["id", "state", "mode", "observedAt", "lastSuccessAt", "ageSeconds"]) && inList(h.id, componentIds)
      && inList(h.state, ["healthy", "degraded", "unavailable", "recovering"]) && inList(h.mode, modes)
      && nullableTimestamp(h.observedAt) && nullableTimestamp(h.lastSuccessAt) && (h.ageSeconds === null || natural(h.ageSeconds)));
  }
  if (kind === "activity_public_preview") {
    const data = reply.data;
    if (!closed(reply, ["schemaVersion", "kind", "data", "sha256"]) || !hash(reply.sha256) || !closed(data, ["version", "sources"]) || data.version !== 1 || !sourceSet(data.sources)) return false;
    const sources = data.sources;
    return SOURCES.every(id => {
      const s = sources[id];
      return s === null || (closed(s, ["updatedAt", "timezone", "metric", "days"]) && timestamp(s.updatedAt) && s.timezone === sourceMetadata[id].timezone
        && s.metric === sourceMetadata[id].metric && recordedDays(s.days));
    });
  }
  if (kind === "activity_days") return closed(reply, ["schemaVersion", "kind", "source", "days"]) && inList(reply.source, SOURCES) && recordedDays(reply.days);
  if (kind === "activity_pause_acknowledged") return closed(reply, ["schemaVersion", "kind", "paused"]) && typeof reply.paused === "boolean";
  if (kind === "activity_run_accepted") return closed(reply, ["schemaVersion", "kind", "runId"]) && typeof reply.runId === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(reply.runId);
  if (kind === "activity_run_status") return closed(reply, ["schemaVersion", "kind", "runId", "stage", "error"], ["operation", "summary"])
    && typeof reply.runId === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(reply.runId)
    && inList(reply.stage, ["queued", "running", "collecting", "persisting", "uploading", "observing", "completed", "failed", "blocked"])
    && (reply.operation === undefined || inList(reply.operation, ["activity_run_now", "activity_retry_pending", "activity_set_paused"]))
    && (reply.summary === undefined || reply.summary === null || object(reply.summary))
    && (reply.error === null || validError(reply.error));
  return false;
}

async function request<T>(operation: string, fields: Record<string, unknown>, kind: string): Promise<T> {
  const reply = await transport("activity_call", { request: { operation, ...fields } });
  const invalid = () => new ActivityError({ code: "contract_invalid", component: "activity_archive", retryable: false });
  if (!object(reply) || reply.schemaVersion !== 1) throw invalid();
  if (reply.kind === "activity_error") {
    if (!closed(reply, ["schemaVersion", "kind", "error"]) || !validError(reply.error)) throw invalid();
    throw new ActivityError(reply.error);
  }
  if (reply.kind !== kind || !validReply(reply, kind)) throw invalid();
  if (kind === "activity_run_status" && reply.runId !== fields.runId) throw invalid();
  if (kind === "activity_pause_acknowledged" && reply.paused !== fields.paused) throw invalid();
  if (kind === "activity_days" && (reply.source !== fields.source || !Array.isArray(reply.days)
    || reply.days.some(day => !object(day) || typeof day.date !== "string" || typeof fields.from !== "string" || typeof fields.to !== "string" || day.date < fields.from || day.date > fields.to))) throw invalid();
  return reply as T;
}

// Setup has its own native command, outside Activity IPC v1. Match the host's
// action-specific shapes before a package choice can start producer reads.
async function setup(action: "status" | "select" | "clear"): Promise<Setup> {
  const reply = await transport("activity_setup", { action });
  let valid = false;
  if (action === "select" && closed(reply, ["cancelled"]) && reply.cancelled === true) valid = true;
  else if (object(reply) && reply.configured === false) {
    if (action === "status") valid = closed(reply, ["configured"], ["saved"])
      && (reply.saved === undefined || typeof reply.saved === "boolean");
    else if (action === "clear") valid = closed(reply, ["configured", "saved"]) && typeof reply.saved === "boolean";
    else valid = closed(reply, ["configured", "error"]) && inList(reply.error, ["not_found", "not_a_package", "binary_changed"]);
  } else if (action !== "clear" && closed(reply, action === "select"
    ? ["configured", "mode", "taskName", "folder", "saved"] : ["configured", "mode", "taskName", "folder"], action === "status" ? ["saved"] : [])) {
    const suffix = typeof reply.taskName === "string" && reply.taskName.startsWith("Enouia-Activity-")
      ? reply.taskName.slice("Enouia-Activity-".length) : "";
    valid = reply.configured === true && inList(reply.mode, ["sandbox", "production"])
      && suffix.length >= 1 && suffix.length <= 80 && !/[^A-Za-z0-9_-]/.test(suffix)
      && (reply.folder === null || (typeof reply.folder === "string" && reply.folder.length > 0
        && reply.folder !== "." && reply.folder !== ".." && !/[\\/:\0]/.test(reply.folder)))
      && (action === "status" ? reply.saved === undefined || typeof reply.saved === "boolean" : typeof reply.saved === "boolean");
  }
  if (!valid) throw new ActivityError({ code: "contract_invalid", component: "activity_archive", retryable: false });
  return reply as Setup;
}

export const activity = {
  overview: () => request<Overview>("activity_get_overview", {}, "activity_overview"),
  preview: () => request<Preview>("activity_preview_public_payload", {}, "activity_public_preview"),
  days: (source: SourceId, from: string, to: string) =>
    request<{ kind: "activity_days"; source: SourceId; days: Day[] }>("activity_get_days", { source, from, to }, "activity_days"),
  runNow: () => request<{ runId: string }>("activity_run_now", {}, "activity_run_accepted"),
  retryPending: () => request<{ runId: string }>("activity_retry_pending", {}, "activity_run_accepted"),
  setPaused: (paused: boolean) =>
    request<{ paused: boolean }>("activity_set_paused", { paused }, "activity_pause_acknowledged"),
  run: (runId: string) => request<RunStatus>("activity_get_run", { runId }, "activity_run_status"),
  setup,
};

const CODES: Record<ErrorCode, string> = {
  busy: "The Activity producer is busy with another run. Try again shortly",
  unconfigured: "The installed Activity package is missing, changed or not configured for this",
  unsupported_method: "A collector reported an unsupported method",
  source_invalid: "A source returned data that failed validation",
  clock_regression: "The system clock moved backwards; Activity refused to write",
  storage_failed: "The Activity store could not be read or written",
  delivery_unverified: "Delivery is not yet confirmed by observed publication",
  contract_invalid: "The response did not match Activity IPC v1",
};

const SETUP: Record<string, string> = {
  not_found: "That folder no longer exists",
  not_a_package: "That folder is not an installed Activity package (install.json did not validate)",
  binary_changed: "The package's runner no longer matches its recorded hash",
};

/** Human text for an error: the stable code only, never subprocess output. */
export function describe(error: unknown): string {
  if (error instanceof ActivityError) return CODES[error.error.code] ?? error.error.code;
  if (typeof error === "string" && error === "permission_denied") return "This window may not reach Activity";
  return "The Activity call failed";
}

export const describeSetup = (code: string): string => Object.hasOwn(SETUP, code) ? SETUP[code] : "The installed package could not be selected";
export const retryable = (error: unknown): boolean => error instanceof ActivityError && error.error.retryable;
