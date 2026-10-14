// Only the pinned Core's saved outcome and structured code are displayed.
// No current provider configuration or transport message explains history.
import { CallError, describe } from "./client.ts";

const STATES: Record<string, string> = {
  completed: "completed", length: "stopped at the output limit", failed: "failed", cancelled: "closed locally",
  outcome_unknown: "outcome unknown: the request may have reached the provider",
};
const CODES = new Set(["unauthenticated", "permission_denied", "not_found", "vault_locked", "vault_recovering", "busy",
  "revision_conflict", "idempotency_conflict", "invalid_request", "invalid_source", "broken_provenance", "unsupported_schema",
  "index_not_ready", "budget_exceeded", "unsupported_budget", "storage_full", "storage_failed", "audit_unavailable",
  "provider_unavailable", "offline", "cancelled", "clock_regression", "intentionally_purged"]);

export function recordedInvocationOutcome(state: unknown, code: unknown) {
  const outcome = typeof state === "string" && Object.hasOwn(STATES, state) ? STATES[state] : "Saved outcome unavailable";
  const error = code == null ? null : typeof code === "string" && CODES.has(code)
    ? describe(new CallError({ code, retryable: false, rules: [] })) : "Saved error unavailable";
  return { outcome, error };
}
