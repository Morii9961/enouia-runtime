// Separate native read-2 boundary. No Workspace/read-1 fallback or replay.
import { invoke } from "@tauri-apps/api/core";
import type { J } from "./client";
import { snapshotKey } from "./automation.ts";

export const CATALOG_FILTER = { text: "", form: null, state: null, knowledge: null, adoption: null, validity: null, attention: null,
  entity: null, project: null, theme: null, time_axis: null, time_window: null, include_unknown_time: false };
export type CatalogFilter = typeof CATALOG_FILTER;
export type CatalogSelection = {
  algorithm: "owner-qualified-catalog-4"; version: 4; profile_hash: string; withdrawal_watermark: number;
  snapshot: { vault_id: string; base_commit_id: string; primary_epoch: number; policy_watermark: number; deletion_watermark: number };
  scope_hash: string; query_hash: string; evaluated_at: string;
};
export type CatalogCursor = { selection: CatalogSelection; after: string };
export type CatalogStatus = { kind: "runtime_memory_catalog_status"; mode: "synthetic_segmented_only";
  state: "disabled" | "initializing" | "open" | "locked" | "failed" | "closing"; available: boolean; selection?: CatalogSelection };
export type CatalogItem = { title: string; content_lang: string; base: {
  memory: { memory_id: string; revision: number }; content: string; system_actor: { actor_type: "system" };
  dimensions: { kind: string }; knowledge: string; adoption: string; validity: string; attention: string;
} };
export type CatalogPage = { kind: "catalog_memory_page"; selection: CatalogSelection; authorized_at: string; matched_in_scope: number;
  unknown_time_in_scope: number; items: CatalogItem[]; complete_in_scope: boolean; next: CatalogCursor | null };
export type CatalogStats = { kind: "catalog_memory_stats"; selection: CatalogSelection; authorized_at: string; matched_in_scope: number };
export type CatalogEvidence = { reference: { source_id: string; source_revision: number; object_hash: string }; quote: string; speaker: string; start: number; end: number };
export type CatalogDetail = { kind: "native_memory_detail"; header: { selection: CatalogSelection }; item: CatalogItem | null;
  fields: { title: string; evidence: CatalogEvidence[] } | null };
export type CatalogSourceRef = { source_id: string; source_revision: number };
export type CatalogSource = { kind: "native_source_excerpt"; header: { selection: CatalogSelection }; source: CatalogSourceRef | null;
  source_record: { reference: CatalogSourceRef; speaker: string; source_kind: string; evidence_class: string; anchor_hash: string;
    original_conversation_id: string | null; original_message_id: string | null } | null;
  excerpt: string | null; start: number; end: number; total_characters: number; complete_in_scope: boolean };
type Queries = { status: object; page: { filter: CatalogFilter; cursor: CatalogCursor | null; limit: number };
  stats: { filter: CatalogFilter; selection: CatalogSelection }; detail: { filter: CatalogFilter; memory_id: string };
  source: { source: CatalogSourceRef; start: number; limit: number }; lock: object; unlock: object };
type Results = { status: CatalogStatus; page: CatalogPage; stats: CatalogStats; detail: CatalogDetail; source: CatalogSource; lock: CatalogStatus; unlock: CatalogStatus };
type Transport = (command: string, args: Record<string, unknown>) => Promise<unknown>;
let transport: Transport = (command, args) => invoke(command, args);
export function setCatalogTransport(next: Transport): void { transport = next; }

// Typed selections use a stable field order, independent of transport key order.
export function catalogSelectionKey(s: CatalogSelection): string {
  return JSON.stringify([s.algorithm, s.version, s.profile_hash, s.withdrawal_watermark, s.snapshot.vault_id,
    s.snapshot.base_commit_id, s.snapshot.primary_epoch, s.snapshot.policy_watermark, s.snapshot.deletion_watermark,
    s.scope_hash, s.query_hash, s.evaluated_at]);
}
export function catalogScopeKey(s: CatalogSelection): string {
  return catalogSelectionKey({ ...s, query_hash: "", evaluated_at: "" });
}
function selection(value: J): asserts value is CatalogSelection {
  if (!value || value.algorithm !== "owner-qualified-catalog-4" || value.version !== 4 ||
      !Number.isSafeInteger(value.withdrawal_watermark) || value.withdrawal_watermark < 1 ||
      ![value.profile_hash, value.scope_hash, value.query_hash].every(v => typeof v === "string" && /^[a-f0-9]{64}$/.test(v)) ||
      typeof value.evaluated_at !== "string" || !Number.isFinite(Date.parse(value.evaluated_at))) throw "catalog_response_unsupported";
  snapshotKey(value.snapshot);
}
export async function catalogRead<K extends keyof Queries>(query: { operation: K } & Queries[K]): Promise<Results[K]> {
  const request = { schema_version: 2, capability: "memory-native-read-2", query: structuredClone(query) };
  const value = await transport("memory_catalog", { request }) as J;
  const control = query.operation === "lock" || query.operation === "unlock";
  const kind = query.operation === "page" ? "catalog_memory_page" : query.operation === "stats" ? "catalog_memory_stats" :
    query.operation === "detail" ? "native_memory_detail" : query.operation === "source" ? "native_source_excerpt" : "runtime_memory_catalog_status";
  if (!value || value.schema_version !== 2 || value.capability !== "memory-native-read-2" ||
      value.effect !== (control ? "native_control" : "native_read") || value.kind !== kind) throw "catalog_response_unsupported";
  if (kind === "runtime_memory_catalog_status") {
    if (value.mode !== "synthetic_segmented_only" || !["disabled", "initializing", "open", "locked", "failed", "closing"].includes(value.state) ||
        value.available !== (value.state === "open")) throw "catalog_response_unsupported";
    if (!control && value.state === "open") selection(value.selection);
  } else if (kind === "native_memory_detail" || kind === "native_source_excerpt") {
    selection(value.header?.selection);
    if (value.header.version !== 2 || value.header.scope !== "authorized_current_dependencies" ||
        value.header.algorithm !== (kind === "native_memory_detail" ? "authorized-native-detail-2" : "selected-source-excerpt-2")) throw "catalog_response_unsupported";
    if (kind === "native_memory_detail") {
      if (value.item === null) {
        if (value.fields !== null) throw "catalog_response_unsupported";
      } else if (!value.item || typeof value.item.title !== "string" || typeof value.item.base?.content !== "string" ||
          value.item.base?.memory?.memory_id !== (request.query as Queries["detail"]).memory_id ||
          !Number.isSafeInteger(value.item.base.memory.revision) || value.item.base.memory.revision < 1 ||
          !value.fields || typeof value.fields.title !== "string" || !Array.isArray(value.fields.evidence) ||
          value.fields.evidence.length > 128 || value.fields.evidence.some((e: J) => !e || typeof e.reference?.source_id !== "string" ||
            !Number.isSafeInteger(e.reference.source_revision) || e.reference.source_revision < 1 ||
            typeof e.reference.object_hash !== "string" || !/^[a-f0-9]{64}$/.test(e.reference.object_hash) ||
            typeof e.quote !== "string" || typeof e.speaker !== "string" || !Number.isSafeInteger(e.start) || e.start < 0 ||
            !Number.isSafeInteger(e.end) || e.end <= e.start || e.end > 16384 || e.end - e.start !== Array.from(e.quote).length)) throw "catalog_response_unsupported";
    } else {
      const sent = request.query as Queries["source"];
      if (value.source === null) {
        if (value.source_record !== null || value.excerpt !== null || value.start !== 0 || value.end !== 0 || value.total_characters !== 0 || value.complete_in_scope !== true) throw "catalog_response_unsupported";
      } else if (value.source?.source_id !== sent.source.source_id || value.source?.source_revision !== sent.source.source_revision ||
          value.source_record?.reference?.source_id !== value.source.source_id || value.source_record?.reference?.source_revision !== value.source.source_revision ||
          ![value.source_record.speaker, value.source_record.source_kind, value.source_record.evidence_class, value.source_record.anchor_hash].every(v => typeof v === "string") ||
          !/^[a-f0-9]{64}$/.test(value.source_record.anchor_hash) ||
          ![value.source_record.original_conversation_id, value.source_record.original_message_id].every(v => v === null || typeof v === "string") ||
          typeof value.excerpt !== "string" || value.start !== sent.start || !Number.isSafeInteger(value.end) || value.end < value.start ||
          value.end - value.start > sent.limit || value.end - value.start !== Array.from(value.excerpt).length ||
          !Number.isSafeInteger(value.total_characters) || value.total_characters < value.end ||
          value.complete_in_scope !== (value.end === value.total_characters)) throw "catalog_response_unsupported";
    }
  } else {
    selection(value.selection);
    if (value.scope !== "authorized_current_machine_revisions" || value.count_exact !== true ||
        !Number.isSafeInteger(value.matched_in_scope) || value.matched_in_scope < 0 || value.matched_in_scope > 65536 ||
        typeof value.authorized_at !== "string" || !Number.isFinite(Date.parse(value.authorized_at))) throw "catalog_response_unsupported";
    if (kind === "catalog_memory_page") {
      if (!Array.isArray(value.items) || value.items.length > (request.query as Queries["page"]).limit ||
          !Number.isSafeInteger(value.unknown_time_in_scope) || value.unknown_time_in_scope < 0 ||
          typeof value.complete_in_scope !== "boolean" || value.complete_in_scope !== (value.next === null) ||
          value.items.some((item: J) => !item || typeof item.title !== "string" || typeof item.content_lang !== "string" ||
            typeof item.base?.content !== "string" || typeof item.base?.memory?.memory_id !== "string" ||
            !Number.isSafeInteger(item.base?.memory?.revision) || item.base.memory.revision < 1 || item.base?.system_actor?.actor_type !== "system" ||
            ![item.base?.dimensions?.kind, item.base?.knowledge, item.base?.adoption, item.base?.validity, item.base?.attention].every(v => typeof v === "string"))) throw "catalog_response_unsupported";
      if (value.next !== null) {
        selection(value.next?.selection);
        if (typeof value.next.after !== "string" || catalogSelectionKey(value.next.selection) !== catalogSelectionKey(value.selection)) throw "catalog_response_unsupported";
      }
      const cursor = (request.query as Queries["page"]).cursor;
      if (cursor && catalogSelectionKey(cursor.selection) !== catalogSelectionKey(value.selection)) throw "catalog_response_unsupported";
    } else if (catalogSelectionKey((request.query as Queries["stats"]).selection) !== catalogSelectionKey(value.selection)) throw "catalog_response_unsupported";
  }
  return value as Results[K];
}
