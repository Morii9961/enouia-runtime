// Retry recovers the same Core-owned operation; it never allocates a new
// send key for an already submitted request.
import { call, CallError, newKey } from "./client.ts";
import type { J } from "./client.ts";

export function holdProviderSend(result: J, request: typeof call = call) {
  const prepared = Object.freeze({ ...result });
  const args = Object.freeze({ callId: prepared.callId, wireHash: prepared.wireHash });
  const key = newKey();
  let submitted = false;
  return Object.freeze({ prepared, submitted: () => submitted, send: async () => {
    submitted = true;
    const started = await request("external_send", args, key);
    if (typeof started?.operationId !== "string" || !started.operationId || started.kind !== "external_send") {
      throw new CallError({ code: "invalid_request", retryable: false, rules: [] });
    }
    return started;
  } });
}
