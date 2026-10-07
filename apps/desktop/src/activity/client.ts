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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Reply = any;

async function request<T>(operation: string, fields: Record<string, unknown>, kind: string): Promise<T> {
  const reply = (await transport("activity_call", { request: { operation, ...fields } })) as Reply;
  if (reply?.schemaVersion !== 1) throw new ActivityError({ code: "contract_invalid", component: "activity_archive", retryable: false });
  if (reply.kind === "activity_error") throw new ActivityError(reply.error);
  if (reply.kind !== kind) throw new ActivityError({ code: "contract_invalid", component: "activity_archive", retryable: false });
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

export const describeSetup = (code: string): string => SETUP[code] ?? code;
export const retryable = (error: unknown): boolean => error instanceof ActivityError && error.error.retryable;
