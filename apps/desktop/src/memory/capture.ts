// Separate native synthetic Owner capture boundary. One send per call: no
// Workspace/read-1/read-2 fallback, replay or resend after an unknown result.
import { invoke } from "@tauri-apps/api/core";
import type { J } from "./client";

export const CAPTURE_CAPABILITY = "memory-runtime-owner-capture-native-1";
export const CAPTURE_STATES = ["disabled", "initializing", "open", "locked", "expired", "failed", "closing"] as const;
export const JOB_STATES = ["queued", "dispatched", "forming", "formed", "no_memory", "rejected", "analysis_unknown"] as const;
export type CaptureState = typeof CAPTURE_STATES[number];
export type JobState = typeof JOB_STATES[number];
export type CaptureConversation = { exchange: number; user: string; assistant: string; content_lang: string };
export type CaptureStatus = { kind: "runtime_memory_capture_status"; mode: "synthetic_owner_only"; state: CaptureState;
  available: boolean; exchanges: number; conversations: CaptureConversation[]; reason?: string };
export type CaptureReceipt = { captured: boolean; replayed: boolean; formation_scheduled: boolean };
export type CapturePreflight = { kind: "runtime_memory_capture_preflight"; exchange: number; capture: CaptureReceipt };
export type CaptureWrite = { kind: "runtime_memory_capture_write"; exchange: number; capture: CaptureReceipt;
  queue: { state: string } | null; queue_error: string | null };
export type CaptureJob = { job_key: string; state: JobState; receipts: number; refused: number };
export type CaptureJobs = { kind: "runtime_memory_capture_jobs"; exchange: number; jobs: CaptureJob[] };
export type CaptureItem = { title: string; content_lang: string; base: { memory: { memory_id: string; revision: number };
  content: string; system_actor: { actor_type: "system" } } };
export type CapturePage = { kind: "catalog_memory_page"; matched_in_scope: number; authorized_at: string; items: CaptureItem[] };
type Queries = { status: object; preflight: { exchange: number }; write: { exchange: number }; jobs: { exchange: number };
  page: { cursor: null; limit: number }; lock: object };
type Results = { status: CaptureStatus; preflight: CapturePreflight; write: CaptureWrite; jobs: CaptureJobs; page: CapturePage; lock: CaptureStatus };
type Transport = (command: string, args: Record<string, unknown>) => Promise<unknown>;
let transport: Transport = (command, args) => invoke(command, args);
export function setCaptureTransport(next: Transport): void { transport = next; }

const count = (v: unknown) => Number.isSafeInteger(v) && (v as number) >= 0;
const receipt = (v: J) => !!v && typeof v.captured === "boolean" && typeof v.replayed === "boolean" && typeof v.formation_scheduled === "boolean";

export async function captureCall<K extends keyof Queries>(query: { operation: K } & Queries[K]): Promise<Results[K]> {
  const request = { schema_version: 2, capability: CAPTURE_CAPABILITY, query: structuredClone(query) };
  const value = await transport("memory_capture", { request }) as J;
  const bad = () => { throw "capture_response_unsupported"; };
  if (!value || value.schema_version !== 2) bad();
  const exchange = (request.query as { exchange?: number }).exchange;
  switch (query.operation) {
    case "status": case "lock":
      if (value.kind !== "runtime_memory_capture_status" || value.capability !== CAPTURE_CAPABILITY ||
          value.effect !== (query.operation === "lock" ? "native_control" : "native_read") || value.mode !== "synthetic_owner_only" ||
          !CAPTURE_STATES.includes(value.state) || value.available !== (value.state === "open") || !count(value.exchanges) ||
          (value.reason !== undefined && (value.state !== "failed" || typeof value.reason !== "string")) ||
          !Array.isArray(value.conversations) || value.conversations.length !== value.exchanges ||
          value.conversations.some((c: J, n: number) => !c || c.exchange !== n || typeof c.user !== "string" ||
            typeof c.assistant !== "string" || typeof c.content_lang !== "string")) bad();
      break;
    case "preflight":
      if (value.kind !== "runtime_memory_capture_preflight" || value.effect !== "native_read" || value.exchange !== exchange ||
          !receipt(value.capture) || value.capture.captured !== false) bad();
      break;
    case "write":
      if (value.kind !== "runtime_memory_capture_write" || value.effect !== "native_write" || value.exchange !== exchange ||
          !receipt(value.capture) || value.capture.captured !== true || value.capture.formation_scheduled !== false ||
          (value.queue === null) === (value.queue_error === null) ||
          (value.queue !== null && typeof value.queue?.state !== "string") ||
          (value.queue_error !== null && typeof value.queue_error !== "string")) bad();
      break;
    case "jobs":
      if (value.kind !== "runtime_memory_capture_jobs" || value.effect !== "native_read" || value.exchange !== exchange ||
          !Array.isArray(value.jobs) || value.jobs.some((j: J) => !j || typeof j.job_key !== "string" ||
            !JOB_STATES.includes(j.state) || !count(j.receipts) || !count(j.refused))) bad();
      break;
    case "page":
      if (value.kind !== "catalog_memory_page" || value.effect !== "native_read" || !count(value.matched_in_scope) ||
          typeof value.authorized_at !== "string" || !Number.isFinite(Date.parse(value.authorized_at)) ||
          !Array.isArray(value.items) || value.items.length > (request.query as Queries["page"]).limit ||
          value.items.some((item: J) => !item || typeof item.title !== "string" || typeof item.content_lang !== "string" ||
            typeof item.base?.content !== "string" || typeof item.base?.memory?.memory_id !== "string" ||
            !Number.isSafeInteger(item.base?.memory?.revision) || item.base?.system_actor?.actor_type !== "system")) bad();
      break;
  }
  return value as Results[K];
}

/** A job is settled once Memory reports a terminal state; nothing is retried. */
export const settled = (jobs: CaptureJob[]) => jobs.length > 0 && jobs.every(j => !["queued", "dispatched", "forming"].includes(j.state));
