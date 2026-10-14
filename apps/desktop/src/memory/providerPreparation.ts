// Recovery belongs to the original preparation inputs and write key.
import { call, newKey } from "./client.ts";

export function holdProviderPreparation(command: "external_prepare" | "extraction_prepare", args: Record<string, unknown>, request: typeof call = call) {
  const arguments_ = Object.freeze({ ...args });
  const key = newKey();
  return Object.freeze({ arguments: arguments_, prepare: () => request(command, arguments_, key) });
}
