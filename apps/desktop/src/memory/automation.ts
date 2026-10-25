// Independent native capability; never routes through workspace IPC v1.
import { invoke } from "@tauri-apps/api/core";
import type { J } from "./client";
type Transport = (command: string, args: Record<string, unknown>) => Promise<unknown>;
let transport: Transport = (command, args) => invoke(command, args);
export function setAutomationTransport(next: Transport): void { transport = next; }
const kinds = new Set(["runtime_memory_automation_status", "automation_memory_page", "automation_memory_detail", "automation_memory_absent", "memory_recall_simulation"]);
export async function automationRead(query: Record<string, unknown>): Promise<J> {
  const request = { schema_version: 2, capability: "memory-native-read-1", query: structuredClone(query) };
  const operation = String(request.query.operation);
  const pureRead = ["status", "page", "detail", "simulate"].includes(operation);
  let response: unknown;
  for (let attempt = 0; ; attempt += 1) {
    try { response = await transport("memory_automation", { request }); break; }
    catch (error) {
      // Native Busy occurs before the read; every retry rechecks live authority.
      // Never replay controls, unknown outcomes, version errors or stale cursors.
      if (!pureRead || error !== "automation_busy" || attempt >= 2) throw error;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  }
  const value = response as J;
  // Gate the capability/effect before consumers inspect business fields.
  const effect = pureRead ? "native_read" : "native_control";
  if (!value || value.schema_version !== 2 || value.capability !== "memory-native-read-1" || value.effect !== effect || !kinds.has(value.kind)) {
    throw new Error("This automatic Memory response is not supported by this build");
  }
  const expected: Record<string, string[]> = { status: ["runtime_memory_automation_status"], lock: ["runtime_memory_automation_status"], unlock: ["runtime_memory_automation_status"], page: ["automation_memory_page"], detail: ["automation_memory_detail", "automation_memory_absent"], simulate: ["memory_recall_simulation"] };
  if (!expected[operation]?.includes(value.kind)) throw new Error("Unexpected automatic Memory response");
  if (value.kind === "runtime_memory_automation_status" && value.mode !== "synthetic_only") throw new Error("Unsupported automatic Memory mode");
  return value;
}

export function snapshotKey(snapshot: J): string {
  if (!snapshot || typeof snapshot.vault_id !== "string" || typeof snapshot.base_commit_id !== "string" ||
      ![snapshot.primary_epoch, snapshot.policy_watermark, snapshot.deletion_watermark].every(n => Number.isSafeInteger(n) && n > 0)) {
    throw new Error("Automatic Memory snapshot is unavailable");
  }
  return [snapshot.vault_id, snapshot.base_commit_id, snapshot.primary_epoch, snapshot.policy_watermark, snapshot.deletion_watermark].join(":");
}
