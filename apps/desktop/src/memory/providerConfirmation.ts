// A held plan owns one immutable confirmation payload and write key.
import { call, newKey } from "./client.ts";
import type { J } from "./client.ts";

export function holdProviderConfirmation(plan: J, request: typeof call = call) {
  const held = Object.freeze({ kind: plan.kind, inspection: plan.inspection,
    planId: plan.planId, diffHash: plan.diffHash });
  const args = Object.freeze({ planId: held.planId, diffHash: held.diffHash });
  const key = newKey();
  return Object.freeze({ plan: held, confirm: () => request("provider_confirm", args, key) });
}
