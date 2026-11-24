// Registered entry: the recorded times behind Home's trace and the record strip.
// Turns: each captured conversation turn's own `occurred_at` (capture time is
// not talk time, so a turn without one is left out). Writes: Memory's recorded
// formation and correction events. Read once per catalog scope and shared.
import { useEffect, useState } from "react";
import { CATALOG_FILTER, catalogView } from "./catalog";
import type { RecordedWrite } from "../theme/recordedTrace";

export type RecordedTimes = { turns: number[]; writes: RecordedWrite[] };
const loads = new Map<string, Promise<RecordedTimes>>();

async function read(since: number): Promise<RecordedTimes> {
  const turns: number[] = [];
  let cursor: unknown | null = null;
  do {
    const page = await catalogView({ operation: "conversations", cursor, limit: 50 });
    for (const { conversation } of page.items) {
      // Only conversations that may have turns in the drawn weeks; an unknown end is read.
      if (Date.parse(conversation.ended_at.until ?? conversation.ended_at.from ?? "") < since) continue;
      let turn: unknown | null = null;
      do {
        const detail = await catalogView({ operation: "conversation_detail", conversation_id: conversation.conversation_id, cursor: turn, limit: 50 });
        for (const { source_record } of detail.turns) {
          const at = Date.parse(source_record.occurred_at ?? "");
          if (Number.isFinite(at)) turns.push(at);
        }
        turn = detail.next;
      } while (turn != null);
    }
    cursor = page.next;
  } while (cursor != null);
  const writes: RecordedWrite[] = [];
  cursor = null;
  do {
    // Newest first: stop at the first page that reaches before the drawn weeks.
    const page = await catalogView({ operation: "activity", filter: CATALOG_FILTER, query: { memory: null, event_kind: null, include_sources: false }, cursor, limit: 100 });
    for (const e of page.items) writes.push({ at: Date.parse(e.proof.written_at), kind: e.event_kind, adoption: e.adoption });
    cursor = page.items.some(e => Date.parse(e.proof.written_at) < since) ? null : page.next;
  } while (cursor != null);
  return { turns, writes: writes.filter(w => Number.isFinite(w.at)) };
}

export function useRecordedTimes(scope: string | null, since: number): { times: RecordedTimes | null; failed: boolean } {
  const key = scope ? `${scope}:${since}` : null;
  const [state, setState] = useState<{ key: string; times: RecordedTimes | null; failed: boolean } | null>(null);
  useEffect(() => {
    if (!key) return;
    let load = loads.get(key);
    if (!load) { load = read(since); loads.set(key, load); }
    let live = true;
    load.then(times => { if (live) setState({ key, times, failed: false }); },
      () => { loads.delete(key); if (live) setState({ key, times: null, failed: true }); });
    return () => { live = false; };
  }, [key, since]);
  return state && state.key === key ? state : { times: null, failed: false };
}
