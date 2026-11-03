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
type Queries = { status: object; page: { filter: CatalogFilter; cursor: CatalogCursor | null; limit: number };
  stats: { filter: CatalogFilter; selection: CatalogSelection }; lock: object; unlock: object };
type Results = { status: CatalogStatus; page: CatalogPage; stats: CatalogStats; lock: CatalogStatus; unlock: CatalogStatus };
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
  const kind = query.operation === "page" ? "catalog_memory_page" : query.operation === "stats" ? "catalog_memory_stats" : "runtime_memory_catalog_status";
  if (!value || value.schema_version !== 2 || value.capability !== "memory-native-read-2" ||
      value.effect !== (control ? "native_control" : "native_read") || value.kind !== kind) throw "catalog_response_unsupported";
  if (kind === "runtime_memory_catalog_status") {
    if (value.mode !== "synthetic_segmented_only" || !["disabled", "initializing", "open", "locked", "failed", "closing"].includes(value.state) ||
        value.available !== (value.state === "open")) throw "catalog_response_unsupported";
    if (!control && value.state === "open") selection(value.selection);
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
