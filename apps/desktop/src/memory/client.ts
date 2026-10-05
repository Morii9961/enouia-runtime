// Runtime's Memory client (ADR-025). The page reaches Enouia Memory only
// through the shell's `memory_call` and `memory_pick` commands.
// - `memory_call` forwards one workspace IPC v1 envelope to the embedded
//   Core at the pinned revision.
// - `memory_pick` opens a native dialog and returns a token, never a path.
// This mirrors Memory's reference client (apps/workspace/src/api.ts).
import { invoke } from "@tauri-apps/api/core";

export type MemoryError = { code: string; retryable: boolean; rules: string[] };
// Result fields are shaped by the Core: camelCase rows, with stored records
// embedded in snake_case. src-tauri/tests/memory_core.rs pins the fields the
// surfaces render.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type J = any;

export class CallError extends Error {
  readonly error: MemoryError;
  constructor(error: MemoryError) {
    super(error.code);
    this.error = error;
  }
}

// Must equal the pinned contract's write commands. A Rust test in src-tauri
// checks this list against `enouia_memory_contract::workspace::is_write`.
const WRITES = new Set([
  "review_confirm", "forget_plan", "remember", "correction_propose", "import_start",
  "import_resume", "session_new", "session_ask", "session_checkpoint", "context_preview",
]);

export const PICK_KINDS = ["import_file", "vault_root", "backup_destination", "export_folder"] as const;
export type PickKind = (typeof PICK_KINDS)[number];
export type Picked = { token: string; displayName: string; bytes: number | null };

type Transport = (command: string, args: Record<string, unknown>) => Promise<unknown>;
let transport: Transport = (command, args) => invoke(command, args);

/** Replace the shell transport. Only tests use this; production never does. */
export function setTransport(next: Transport): void {
  transport = next;
}

/** A fresh idempotency key. Keep it to retry the same write safely. */
export const newKey = (): string => `ui-${crypto.randomUUID()}`;

export async function call(command: string, args: Record<string, unknown> = {}, key?: string): Promise<J> {
  const request = {
    schemaVersion: 1,
    requestId: `req_${crypto.randomUUID()}`,
    command,
    idempotencyKey: WRITES.has(command) ? key ?? newKey() : null,
    arguments: args,
  };
  const response = (await transport("memory_call", { request })) as J;
  if (response.kind === "memory_error") throw new CallError(response.error);
  return response.result;
}

export async function pick(kind: PickKind): Promise<Picked | null> {
  const result = (await transport("memory_pick", { kind })) as J;
  if (result.cancelled) return null;
  if (result.error) throw new CallError({ retryable: false, rules: [], ...result.error });
  return result as Picked;
}

const CODES: Record<string, string> = {
  vault_locked: "The Vault is not open, or it is locked",
  vault_recovering: "The Vault is recovering and is read-only",
  index_not_ready: "The index is busy or rebuilding. Try again in a moment",
  revision_conflict: "The content changed: the plan expired, the hash differs or the page is stale. Refresh and try again",
  idempotency_conflict: "The same request key was used for different content",
  not_found: "Not found. It may have been deleted, or its token expired",
  invalid_request: "The request does not match the contract",
  permission_denied: "Not permitted",
  busy: "The Vault is busy. Try again in a moment",
  storage_full: "The disk is full",
  storage_failed: "Storage failed",
  broken_provenance: "The source is missing or damaged",
  cancelled: "Cancelled",
  budget_exceeded: "The context budget was exceeded",
};

const HOST: Record<string, string> = {
  permission_denied: "This window may not reach Memory",
  worker_failed: "The Memory worker stopped unexpectedly",
  runtime_closing: "Runtime is finishing Memory operations before exiting",
  runtime_busy: "The Vault is changing state. Try again after it finishes",
};

/** Human text for an error: the code, its rule identifiers, nothing else. */
export function describe(error: unknown): string {
  if (error instanceof CallError) {
    const text = CODES[error.error.code] ?? error.error.code;
    const rules = error.error.rules.length ? ` (${error.error.rules.join(", ")})` : "";
    return `${text}${rules}`;
  }
  if (typeof error === "string" && HOST[error]) return HOST[error];
  return "The Memory call failed";
}

export const retryable = (error: unknown): boolean => error instanceof CallError && error.error.retryable;
