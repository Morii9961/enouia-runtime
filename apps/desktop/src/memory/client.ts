// Runtime's Memory client (ADR-025). The page reaches Enouia Memory only
// through the shell's `memory_call` and `memory_pick` commands.
// - `memory_call` forwards one workspace IPC v1 envelope to the embedded
//   Core at the pinned revision.
// - `memory_pick` opens a native dialog and returns a token, never a path.
// This mirrors Memory's reference client (apps/workspace/src/api.ts).
import { invoke } from "@tauri-apps/api/core";
import { labels, msg, t } from "../i18n/index.ts";

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
  "provider_confirm", "external_prepare", "external_send",
  "extraction_prepare", "extraction_apply", "extraction_pause", "history_materialize", "history_resume", "history_batch_prepare", "history_batch_apply",
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

const CODES: Record<string, string> = labels({
  vault_locked: msg("The Vault is not open, or it is locked"),
  vault_recovering: msg("The Vault is recovering and is read-only"),
  index_not_ready: msg("The index is unavailable. Retry, or use Rebuild index in Vault & recovery if it stays unavailable"),
  revision_conflict: msg("The content changed: the plan expired, the hash differs or the page is stale. Refresh and try again"),
  idempotency_conflict: msg("The same request key was used for different content"),
  not_found: msg("Not found. It may have been deleted, or its token expired"),
  invalid_request: msg("The request does not match the contract"),
  permission_denied: msg("Not permitted"),
  busy: msg("The Vault is busy. Try again in a moment"),
  storage_full: msg("The disk is full"),
  storage_failed: msg("Storage failed"),
  broken_provenance: msg("The source is missing or damaged"),
  cancelled: msg("Cancelled"),
  budget_exceeded: msg("The context budget was exceeded"),
});

// Rules that say more than their code (Memory ADR-MEM-46 and the import
// pipeline at the pinned revision).
const RULES: Record<string, string> = labels({
  "index.busy": msg("The index is busy or rebuilding. Try again in a moment"),
  "import.resume_existing": msg("This file's earlier import was interrupted. Resume it from the import list instead of starting it again"),
  "import.adapter_changed": msg("This import can no longer be resumed: this version reads the file differently than when the import started"),
  "history.batch_already_invoked": msg("This batch already has an invocation. Read its saved outcome; preparing again cannot resend it"),
  "history.batch_not_ready": msg("This batch is paused or completed. Read its saved state before continuing"),
  "history.model_changed": msg("The configured model differs from the saved task. Restore its exact model and read the task again"),
  "history.response_stale": msg("The saved response hash or application cursor changed. Inspect the saved response again; keep the original key for an uncertain step"),
  "history.batch_paused": msg("This saved job is paused. Read its current state; no candidate was approved"),
  "provider.extraction_preview": msg("The saved response cannot currently be inspected. Read the saved task and check source access"),
  "provider.extraction_apply": msg("The local step did not return a confirmed result. Keep its exact response hash, cursor and key, then inspect saved state"),
  "history.batch_not_selected": msg("This batch was not selected in the saved task. Read the task again"),
  "history.batch_missing": msg("This child job is missing. Explicitly resume missing local jobs first"),
  "history.task_unknown": msg("This saved task is unavailable in the current Vault. Read saved tasks again"),
  "history.import_unknown": msg("That import is not available in the current Vault"),
  "history.import_revision": msg("The import report changed. Read the import list again"),
  "history.import_incomplete": msg("Choose a completed original import; unfinished and duplicate imports cannot be planned"),
  "history.plan_stale": msg("The Vault opening, saved head or planning parameters changed. Read a fresh plan"),
  "history.source_missing": msg("The archive no longer has all of its original current source bindings. Reconciled or removed sources cannot be revived from this plan"),
  "history.source_binding": msg("An archived message no longer matches its current source revision. This plan is unavailable"),
  "history.source_read": msg("The current policy does not allow reading these sources for a planning preview"),
  "history.input_budget": msg("This planner accepts at most 64 MiB of received input. Use a smaller owner-selected archive"),
  "history.reference_budget": msg("The branch paths exceed the chosen reference budget. Review that bound before planning again"),
  "history.message_budget": msg("This planner accepts at most 100000 parsed messages or units"),
  "history.result_budget": msg("The planning page exceeds its output bound. Use fewer messages per batch"),
  "workspace.vault_in_use": msg("This Vault is open in another app. Lock it or exit there first"),
  "root.inside_repository": msg("That folder is inside a Git working tree, which cannot hold a Vault"),
  "root.cloud_sync_folder": msg("That folder is inside a sync folder such as OneDrive"),
  "root.not_local_fixed_disk": msg("That folder is not on a local fixed disk"),
  "root.unsupported_filesystem": msg("That disk is not NTFS or ReFS"),
  "root.system_location": msg("Program Files and the Windows folder cannot hold a Vault"),
  "root.reparse_point": msg("The path contains a symbolic link or junction"),
  "root.not_canonical": msg("Use the folder's full original path, not a short name or mapped drive"),
  "root.network_path": msg("A network location cannot hold a Vault"),
  "root.insufficient_space": msg("There is not enough free space on that disk"),
  "root.missing": msg("That folder does not exist"),
  "root.not_a_directory": msg("That is not a folder"),
  "root.unreadable": msg("That folder's properties could not be read"),
  "workspace.key_reuse": msg("This request key was already used for different content. Start the action again"),
  "workspace.token_busy": msg("That choice is already being used by another action. Wait for it to finish"),
  "workspace.excerpt_budget": msg("The excerpt budget is too small for this text"),
  "import.input_not_regular_file": msg("The chosen item is not a regular file. Choose the file again"),
  "import.input_changed": msg("The file changed after it was chosen. Choose it again"),
  "import.input_too_large": msg("The file is too large to import"),
  "mock.recompile_required": msg("The saved context is out of date. Ask again"),
  "provider.not_configured": msg("External providers are not set up on this computer"),
  "provider.api_not_configured": msg("That provider is not set up on this computer"),
  "provider.call_running": msg("A provider call is still running. Cancel it and wait for it to stop first"),
  "provider.call_unknown": msg("That prepared request is no longer available. Prepare it again"),
  "provider.call_expired": msg("That prepared request expired. Prepare it again"),
  "provider.plan_unknown": msg("That plan is no longer available. Create it again"),
  "review.stale_plan": msg("The content changed since you reviewed it. Review it again"),
  "workspace.extraction_range": msg("Choose a shorter part of the source (at most 32 KB)"),
});

const HOST: Record<string, string> = labels({
  permission_denied: msg("This window may not reach Memory"),
  worker_failed: msg("The Memory worker stopped unexpectedly"),
  runtime_closing: msg("Runtime is finishing Memory operations before exiting"),
  runtime_busy: msg("The Vault is changing state. Try again after it finishes"),
  root_in_use: msg("This Vault is already reserved by another Runtime. Exit that Runtime before opening it here"),
  root_admission_failed: msg("Runtime could not reserve this Vault folder. Choose the folder again after checking access"),
  root_token_unavailable: msg("Choose the Vault folder again before opening it"),
  startup_unavailable: msg("Login startup is not available"),
  startup_different_installation: msg("Another Enouia Runtime installation owns login startup. Turn it off there first"),
  startup_write_failed: msg("Login startup could not be changed"),
  provider_busy: msg("A provider call is still running. Cancel it and wait for it to stop first"),
  "provider_setup.busy": msg("A settings reload or key change is already in progress. Wait for it to finish"),
  "provider.call_running": msg("A provider call is still running. Wait for it to stop before reloading settings"),
  "provider_setup.refused": msg("Memory refused the new settings. The previously loaded setup remains active"),
  "provider_setup.malformed": msg("Check the JSON fields and values. API keys do not belong in this file"),
  "provider_setup.schema_version": msg("Use schemaVersion 1 in the settings file"),
  "provider_setup.destinations": msg("Configure one or two destinations: OpenAI and/or Anthropic"),
  "provider_setup.duplicate_api": msg("Configure each provider only once"),
  "provider_setup.model": msg("Use the exact model ID you verified, without spaces"),
  "provider_setup.limits": msg("The output limit must be positive and smaller than the context window"),
  "provider_setup.quota": msg("Use 1–1000 attempts per session and a positive session token budget"),
  "provider_setup.too_large": msg("The settings file must be no larger than 64 KiB"),
  "provider_setup.unreadable": msg("Runtime could not read its settings file. Check file access and reload"),
  "provider_setup.draft_name": msg("Use the file name memory-providers.json for this settings draft"),
  "provider_setup.draft_save_failed": msg("The settings draft could not be saved. Check the chosen folder and file access"),
  credential_malformed: msg("That key has spaces or characters an API key cannot contain. Nothing was saved"),
  credential_failed: msg("Windows Credential Manager could not save or remove the key"),
  automation_busy: msg("Automatic Memory is busy. Try the read again shortly."),
  automation_locked: msg("The automatic Memory library is locked"),
  automation_stale: msg("The automatic Memory library changed. Refresh the list."),
  automation_read_refused: msg("The automatic Memory read was refused"),
  automation_version_unsupported: msg("This automatic Memory version is unsupported"),
  credential_prompt_failed: msg("The Windows credential prompt could not be shown"),
  invalid_request: msg("The request does not match the contract"),
});

/** Human text for an error: the code, its rule identifiers, nothing else. */
export function describe(error: unknown): string {
  if (error instanceof CallError) {
    const specific = error.error.rules.map((rule) => RULES[rule]).find(Boolean);
    if (specific) return t(specific);
    const text = CODES[error.error.code] ? t(CODES[error.error.code]) : error.error.code;
    const rules = error.error.rules.length ? ` (${error.error.rules.join(", ")})` : "";
    return `${text}${rules}`;
  }
  if (typeof error === "string" && HOST[error]) return t(HOST[error]);
  return t("The Memory call failed");
}

export const retryable = (error: unknown): boolean => error instanceof CallError && error.error.retryable;

/** Native Provider setup state; never a key or a path (ADR-032). */
export const providerSetup = () => transport("memory_provider_setup", {}) as Promise<J>;

/** Reload the host-owned settings file; carries no path, key or request body. */
export const providerReload = () => transport("memory_provider_reload", {}) as Promise<J>;

export type DraftSaveResult = { cancelled: true } | { saved: true; file: "memory-providers.json" };
/** Native owner-operated save dialog. No page path, key or reload argument. */
export async function providerSaveDraft(draft: string): Promise<DraftSaveResult> {
  const result = await transport("memory_provider_save_draft", { draft }) as J;
  if (result && typeof result === "object" && !Array.isArray(result)) {
    const keys = Object.keys(result);
    if (keys.length === 1 && keys[0] === "cancelled" && result.cancelled === true) return result;
    if (keys.length === 2 && Object.hasOwn(result, "saved") && Object.hasOwn(result, "file") && result.saved === true && result.file === "memory-providers.json") return result;
  }
  throw new Error("The settings save result was not confirmed");
}

/** Set a key in the native Windows credential prompt, or remove it (ADR-032). */
export const providerKey = (api: string, action: "set" | "remove") =>
  transport("memory_provider_key", { api, action }) as Promise<J>;

/** The shell's own window and startup commands (ADR-026). */
export const shell = {
  lifecycleStatus: () => transport("shell_status", {}) as Promise<J>,
  showMain: () => transport("show_main", {}),
  hideWindow: () => transport("hide_window", {}),
  exit: () => transport("exit_app", {}),
  startupStatus: () => transport("startup_status", {}) as Promise<J>,
  startupSet: (enabled: boolean) => transport("startup_set", { enabled }) as Promise<J>,
};
