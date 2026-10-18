// Produce a non-secret settings draft only. Native parsing/loading remains
// authoritative (ADR-032); there is no file, Provider or credential port.
export const CONFIG_APIS = ["openai", "anthropic"] as const;
export type ConfigApi = (typeof CONFIG_APIS)[number];
export type DestinationDraft = {
  enabled: boolean;
  model: string;
  contextWindowTokens: string;
  maxOutputTokens: string;
  streaming: "" | "yes" | "no";
  verifiedAt: string;
};
export type ProviderConfigDraft = {
  destinations: Record<ConfigApi, DestinationDraft>;
  maxAttemptsPerSession: string;
  maxReservedTokensPerSession: string;
  verified: boolean;
};
export type ConfigIssue = { field: string; text: string };
export type ProviderSettings = {
  schemaVersion: 1;
  destinations: { api: ConfigApi; model: string; contextWindowTokens: number; maxOutputTokens: number; streaming: boolean; verifiedAt: string }[];
  maxAttemptsPerSession: number;
  maxReservedTokensPerSession: number;
};

export function emptyProviderConfigDraft(): ProviderConfigDraft {
  const destination = (): DestinationDraft => ({ enabled: false, model: "", contextWindowTokens: "", maxOutputTokens: "", streaming: "", verifiedAt: "" });
  return { destinations: { openai: destination(), anthropic: destination() }, maxAttemptsPerSession: "", maxReservedTokensPerSession: "", verified: false };
}

// The native Timestamp is exactly UTC with milliseconds, with real calendar
// bounds. Do not accept Date.parse's rolled dates or silently normalize input.
function verifiedTime(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString() === value;
}

function positive(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

export function buildProviderConfigDraft(draft: ProviderConfigDraft):
  { ok: true; settings: ProviderSettings; json: string } | { ok: false; issues: ConfigIssue[] } {
  const issues: ConfigIssue[] = [];
  const destinations: ProviderSettings["destinations"] = [];
  for (const api of CONFIG_APIS) {
    const item = draft.destinations[api];
    if (!item.enabled) continue;
    if (!/^[A-Za-z0-9_.:-]{1,160}$/.test(item.model)) issues.push({ field: `${api}.model`, text: `${api}: enter the exact model ID (letters, digits, -, _, . or :, at most 160 characters).` });
    const context = positive(item.contextWindowTokens), output = positive(item.maxOutputTokens);
    if (context == null) issues.push({ field: `${api}.contextWindowTokens`, text: `${api}: enter a positive whole context-window limit.` });
    if (output == null || (context != null && output >= context)) issues.push({ field: `${api}.maxOutputTokens`, text: `${api}: the output limit must be positive and smaller than its context window.` });
    if (!["yes", "no"].includes(item.streaming)) issues.push({ field: `${api}.streaming`, text: `${api}: choose whether the model supports streaming.` });
    if (!verifiedTime(item.verifiedAt)) issues.push({ field: `${api}.verifiedAt`, text: `${api}: enter the verification time as YYYY-MM-DDTHH:mm:ss.sssZ in UTC.` });
    if (context != null && output != null) destinations.push({ api, model: item.model, contextWindowTokens: context, maxOutputTokens: output, streaming: item.streaming === "yes", verifiedAt: item.verifiedAt });
  }
  if (destinations.length === 0 && !CONFIG_APIS.some(api => draft.destinations[api].enabled)) issues.push({ field: "destinations", text: "Choose at least one provider to configure." });
  const attempts = positive(draft.maxAttemptsPerSession), tokens = positive(draft.maxReservedTokensPerSession);
  if (attempts == null || attempts > 1000) issues.push({ field: "maxAttemptsPerSession", text: "Enter 1–1000 attempts per session." });
  if (tokens == null) issues.push({ field: "maxReservedTokensPerSession", text: "Enter a positive whole token budget per session." });
  if (!draft.verified) issues.push({ field: "verified", text: "Confirm that you checked the selected models, capabilities and limits for your API account." });
  if (issues.length || attempts == null || tokens == null) return { ok: false, issues };
  // Project the allowed fields explicitly. No extra input field (including
  // a key field) can enter the generated file through an object spread.
  const settings: ProviderSettings = { schemaVersion: 1, destinations, maxAttemptsPerSession: attempts, maxReservedTokensPerSession: tokens };
  return { ok: true, settings, json: JSON.stringify(settings, null, 2) + "\n" };
}
