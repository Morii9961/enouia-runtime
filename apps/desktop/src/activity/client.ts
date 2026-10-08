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
export type Setup =
  | { configured: false; error?: string; cancelled?: undefined; saved?: boolean }
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
const nullableText = (value: unknown) => value === null || typeof value === "string";
const natural = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const hash = (value: unknown) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const inList = (value: unknown, values: readonly string[]) => typeof value === "string" && values.includes(value);
const modes = ["unconfigured", "idle", "running", "paused"];
const errorCodes = ["busy", "unconfigured", "unsupported_method", "source_invalid", "clock_regression", "storage_failed", "delivery_unverified", "contract_invalid"];

const validError = (value: unknown): value is StructuredError => object(value)
  && inList(value.code, errorCodes) && typeof value.component === "string" && typeof value.retryable === "boolean";

function summary(value: unknown): boolean {
  return object(value) && inList(value.timezone, ["GitHub", "Codex", "Asia/Shanghai"])
    && inList(value.metric, ["contributions", "tokens"]) && natural(value.recordedDays)
    && nullableText(value.firstDate) && nullableText(value.lastDate)
    && typeof value.total === "string" && /^(0|[1-9][0-9]*)$/.test(value.total)
    && nullableText(value.lastAttemptAt) && nullableText(value.lastSuccessAt)
    && inList(value.lastResult, ["unknown", "success", "failed"])
    && inList(value.freshness, ["no_data", "fresh", "stale", "failed"]);
}

/** Reject malformed replies before they can crash a shared desktop surface. */
function validReply(reply: ObjectValue, kind: string): boolean {
  if (kind === "activity_overview") {
    if (!object(reply.sources) || !SOURCES.every(id => summary((reply.sources as ObjectValue)[id]))) return false;
    const s = reply.schedule, d = reply.delivery;
    if (!object(s) || !inList(s.mode, modes) || !nullableText(s.nextTriggerAt)
      || (s.task != null && (!object(s.task) || typeof s.task.registered !== "boolean" || !(s.task.enabled === null || typeof s.task.enabled === "boolean")))) return false;
    if (!object(d) || !(d.pendingSequence === null || natural(d.pendingSequence))
      || !nullableText(d.lastTransportAt) || !nullableText(d.publicationObservedAt)
      || !(d.publicHash === null || hash(d.publicHash))
      || !inList(d.state, ["unconfigured", "idle", "pending", "transported", "observed", "unverified", "paused"])) return false;
    if (reply.producer != null && (!object(reply.producer) || !inList(reply.producer.mode, ["sandbox", "production"])
      || typeof reply.producer.paused !== "boolean" || typeof reply.producer.deliveryEnabled !== "boolean" || !natural(reply.producer.highestReserved))) return false;
    if (reply.pending != null && (!object(reply.pending) || !natural(reply.pending.sequence)
      || !natural(reply.pending.failureCount) || !hash(reply.pending.exactSha256) || !natural(reply.pending.ageSeconds)
      || !nullableText(reply.pending.createdAt) || !nullableText(reply.pending.nextEligibleAt)
      || !(reply.pending.lastErrorCode === null || inList(reply.pending.lastErrorCode, errorCodes)))) return false;
    return Array.isArray(reply.health) && reply.health.every(h => object(h) && typeof h.id === "string"
      && inList(h.state, ["healthy", "degraded", "unavailable", "recovering"]) && inList(h.mode, modes)
      && nullableText(h.observedAt) && nullableText(h.lastSuccessAt) && (h.ageSeconds === null || natural(h.ageSeconds)));
  }
  const days = (value: unknown) => Array.isArray(value) && value.every(d => object(d) && typeof d.date === "string" && natural(d.value));
  if (kind === "activity_public_preview") {
    const data = reply.data;
    if (!hash(reply.sha256) || !object(data) || data.version !== 1 || !object(data.sources)) return false;
    const sources = data.sources;
    return SOURCES.every(id => {
      const s = sources[id];
      return s === null || (object(s) && typeof s.updatedAt === "string" && typeof s.timezone === "string" && typeof s.metric === "string" && days(s.days));
    });
  }
  if (kind === "activity_days") return inList(reply.source, SOURCES) && days(reply.days);
  if (kind === "activity_pause_acknowledged") return typeof reply.paused === "boolean";
  if (kind === "activity_run_accepted") return typeof reply.runId === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(reply.runId);
  if (kind === "activity_run_status") return typeof reply.runId === "string"
    && inList(reply.stage, ["queued", "running", "collecting", "persisting", "uploading", "observing", "completed", "failed", "blocked"])
    && (reply.error === null || validError(reply.error));
  return false;
}

async function request<T>(operation: string, fields: Record<string, unknown>, kind: string): Promise<T> {
  const reply = await transport("activity_call", { request: { operation, ...fields } });
  const invalid = () => new ActivityError({ code: "contract_invalid", component: "activity_archive", retryable: false });
  if (!object(reply) || reply.schemaVersion !== 1) throw invalid();
  if (reply.kind === "activity_error") {
    if (!validError(reply.error)) throw invalid();
    throw new ActivityError(reply.error);
  }
  if (reply.kind !== kind || !validReply(reply, kind)) throw invalid();
  return reply as T;
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
  setup: (action: "status" | "select" | "clear") => transport("activity_setup", { action }) as Promise<Setup>,
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

export const describeSetup = (code: string): string => SETUP[code] ?? "The installed package could not be selected";
export const retryable = (error: unknown): boolean => error instanceof ActivityError && error.error.retryable;
