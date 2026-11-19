// Separate native read-2 boundary. No Workspace/read-1 fallback or replay.
import { invoke } from "@tauri-apps/api/core";
import type { J } from "./client";
import { snapshotKey } from "./automation.ts";

export type CatalogFilter = { text: string; form: string | null; state: string | null; knowledge: string | null; adoption: string | null;
  validity: string | null; attention: string | null; entity: string | null; project: string | null; theme: string | null;
  time_axis: string | null; time_window: { from: string; until: string | null } | null; include_unknown_time: boolean };
export const CATALOG_FILTER: CatalogFilter = { text: "", form: null, state: null, knowledge: null, adoption: null, validity: null, attention: null,
  entity: null, project: null, theme: null, time_axis: null, time_window: null, include_unknown_time: false };
export type CatalogSelection = {
  algorithm: "owner-qualified-catalog-4"; version: 4; profile_hash: string; withdrawal_watermark: number;
  snapshot: { vault_id: string; base_commit_id: string; primary_epoch: number; policy_watermark: number; deletion_watermark: number };
  scope_hash: string; query_hash: string; evaluated_at: string;
};
export type CatalogCursor = { selection: CatalogSelection; after: string };
export type CatalogStatus = { kind: "runtime_memory_catalog_status"; mode: "synthetic_segmented_only" | "registered_owner_readonly";
  state: "disabled" | "initializing" | "open" | "locked" | "failed" | "closing"; available: boolean; selection?: CatalogSelection; reason?: string };
export type CatalogItem = { title: string; content_lang: string; base: {
  memory: { memory_id: string; revision: number }; content: string; system_actor: { actor_type: "system" };
  dimensions: { kind: string }; knowledge: string; adoption: string; validity: string; attention: string;
  project_id?: string | null; learned_at?: string; source_captured_at?: string;
}; event_time?: RecordTime; valid_time?: RecordTime; entities?: { entity_id: string; role: string }[]; effective_sensitivity?: string;
  formation_reason?: { interpretation: string; rule_version: string; prompt_version: string; model_version: string | null; mode: string; note: string | null; note_is_machine_annotation: boolean } };
export type CatalogPage = { kind: "catalog_memory_page"; selection: CatalogSelection; authorized_at: string; matched_in_scope: number;
  unknown_time_in_scope: number; items: CatalogItem[]; complete_in_scope: boolean; next: CatalogCursor | null; facets?: FacetGroup[] };
export type CatalogStats = { kind: "catalog_memory_stats"; selection: CatalogSelection; authorized_at: string; matched_in_scope: number; groups?: FacetGroup[] };
export type CatalogEvidence = { reference: { source_id: string; source_revision: number; object_hash: string }; quote: string; speaker: string; start: number; end: number };
export type CatalogDetail = { kind: "native_memory_detail"; header: { selection: CatalogSelection }; item: CatalogItem | null;
  fields: { title: string; evidence: CatalogEvidence[] } | null; history?: RevisionSummary[]; history_count_in_scope?: number };
export type CatalogSourceRef = { source_id: string; source_revision: number };
export type CatalogSource = { kind: "native_source_excerpt"; header: { selection: CatalogSelection }; source: CatalogSourceRef | null;
  source_record: { reference: CatalogSourceRef; speaker: string; source_kind: string; evidence_class: string; anchor_hash: string;
    original_conversation_id: string | null; original_message_id: string | null } | null;
  excerpt: string | null; start: number; end: number; total_characters: number; complete_in_scope: boolean };
type Queries = { status: object; page: { filter: CatalogFilter; cursor: CatalogCursor | null; limit: number; facets?: boolean };
  stats: { filter: CatalogFilter; selection: CatalogSelection }; detail: { filter: CatalogFilter; memory_id: string };
  source: { source: CatalogSourceRef; start: number; limit: number }; lock: object; unlock: object };
type Results = { status: CatalogStatus; page: CatalogPage; stats: CatalogStats; detail: CatalogDetail; source: CatalogSource; lock: CatalogStatus; unlock: CatalogStatus };
// Projection and process reads already in the pinned SegmentedMemoryReader
// (ADR-MEM-100/101/103). Runtime forwards them unchanged; Core owns counts,
// coverage and authorization. Only fields the surfaces read are typed.
export type RecordTime = { from: string | null; until: string | null; precision: string; bound: string; tz: string | null; basis: string };
export type FacetGroup = { axis: string; count_scope: string; values: { value: string; label: string; count: number }[]; total_values: number };
export type ViewHeader = { selection: CatalogSelection; algorithm: string; authorized_at: string; scope: string;
  matched_inputs?: number; included_inputs?: number; complete_in_scope?: boolean; limits?: string[] };
export type TargetRef = { memory: { memory_id: string; revision: number }; hash: string };
export type RevisionSummary = { memory: TargetRef; title: string; knowledge: string; adoption: string;
  interpretation: string; change: string; learned_at: string; effective_sensitivity: string };
export type TimeBuckets = { kind: "memory_time_buckets"; header: ViewHeader; unknown_time_in_scope: number; interval_rule: string;
  material_scope: string; buckets: { local_start: string; from: string; until: string; possible_records: number; staged: number; adopted: number; captured_material: number }[] };
export type GraphPage = { kind: "memory_graph_page"; header: ViewHeader; nodes: { memory: TargetRef; title: string; form: string; entities: string[] }[];
  edges: { from: string; to: string; relation: string; class: string }[]; edge_coverage: { relation: string; candidates: number; retained: number }[];
  semantic_neighbors_available: boolean; next: unknown | null };
export type ActivityPage = { kind: "memory_activity_page"; header: ViewHeader; matched_in_scope: number; complete_in_scope: boolean; next: unknown | null;
  time_derived_events_available: boolean; items: { event_id: string; event_kind: string; memory: { memory_id: string; revision: number } | null;
    title: string | null; change: string | null; adoption: string | null; effective_sensitivity: string; proof: { written_at: string } }[] };
export type Neighbors = { kind: "native_memory_neighbors"; header: ViewHeader; matched_in_scope: number;
  items: { other: RevisionSummary; relations: { relation: string; class: string; direction: string; witness_count_in_scope: number }[] }[]; next: unknown | null };
export type Conflicts = { kind: "memory_conflict_group"; header: ViewHeader; basis: string; matched_in_scope: number; items: CatalogItem[] };
export type ConversationMeta = { conversation_id: string; platform: string; title: string | null; started_at: RecordTime; ended_at: RecordTime; original_conversation_id: string | null };
export type Conversations = { kind: "native_conversation_page"; header: ViewHeader; matched_in_scope: number; next: unknown | null;
  items: { conversation: ConversationMeta; visible_captured_turns: number; visible_captured_sources: number; effective_sensitivity: string }[] };
export type ConversationDetail = { kind: "native_conversation_detail"; header: ViewHeader; conversation: ConversationMeta | null;
  visible_captured_turns: number; visible_captured_sources: number; next: unknown | null;
  turns: { turn: { turn_id: string; sequence: number; source: CatalogSourceRef }; source_record: { reference: CatalogSourceRef; speaker: string; source_kind: string } }[] };
type ViewQueries = {
  time_buckets: { filter: CatalogFilter; query: { axis: string; timezone: string; granularity: "day" | "month"; from_date: string; until_date: string }; selection: CatalogSelection | null };
  graph: { filter: CatalogFilter; query: { node_limit: number; edge_limit_per_kind: number }; cursor: unknown | null };
  activity: { filter: CatalogFilter; query: { memory: string | null; event_kind: string | null; include_sources: boolean }; cursor: unknown | null; limit: number };
  neighbors: { filter: CatalogFilter; memory_id: string; include_suggestions: boolean; cursor: unknown | null; limit: number };
  conflicts: { filter: CatalogFilter; memory_id: string; cursor: unknown | null; limit: number };
  conversations: { cursor: unknown | null; limit: number };
  conversation_detail: { conversation_id: string; cursor: unknown | null; limit: number };
};
type ViewResults = { time_buckets: TimeBuckets; graph: GraphPage; activity: ActivityPage; neighbors: Neighbors; conflicts: Conflicts;
  conversations: Conversations; conversation_detail: ConversationDetail };
const VIEW_KIND: Record<keyof ViewQueries, string> = { time_buckets: "memory_time_buckets", graph: "memory_graph_page", activity: "memory_activity_page",
  neighbors: "native_memory_neighbors", conflicts: "memory_conflict_group", conversations: "native_conversation_page", conversation_detail: "native_conversation_detail" };
/** One boundary check per projection read: envelope, kind and a typed selection. */
export async function catalogView<K extends keyof ViewQueries>(query: { operation: K } & ViewQueries[K]): Promise<ViewResults[K]> {
  const value = await transport("memory_catalog", { request: { schema_version: 2, capability: "memory-native-read-2", query: structuredClone(query) } }) as J;
  if (!value || value.schema_version !== 2 || value.capability !== "memory-native-read-2" || value.effect !== "native_read" ||
      value.kind !== VIEW_KIND[query.operation] || typeof value.header?.authorized_at !== "string" || typeof value.header?.scope !== "string") throw "catalog_response_unsupported";
  selection(value.header.selection);
  const lists = { time_buckets: "buckets", graph: "nodes", activity: "items", neighbors: "items", conflicts: "items", conversations: "items", conversation_detail: "turns" } as const;
  if (!Array.isArray(value[lists[query.operation]])) throw "catalog_response_unsupported";
  return value as ViewResults[K];
}
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
    if (!["synthetic_segmented_only", "registered_owner_readonly"].includes(value.mode) || !["disabled", "initializing", "open", "locked", "failed", "closing"].includes(value.state) ||
        (value.reason !== undefined && typeof value.reason !== "string") ||
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
