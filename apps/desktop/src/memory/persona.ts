// The public persona file as Enouia Memory writes it (public-persona-
// projection-1, ADR-MEM-128): the canonical bytes of the document, with keys
// sorted, two-space indentation, UTF-8, LF and one trailing LF. Only
// `exported_at` is unknown before Memory writes the file; the receipt names it.
import type { J } from "./client";

/** Stands in for `exported_at` until a receipt names it. */
export const EXPORTED_AT_SLOT = "\u0000exported_at\u0000";

function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sorted((value as Record<string, unknown>)[key])]));
}

/** The exact file text for a preview and an `exported_at` (or the slot). */
export function fileText(preview: J, exportedAt: string, memoryVersion: string): string {
  const document = {
    contract: preview.contract,
    exported_at: exportedAt,
    memory_version: memoryVersion,
    projection: preview.projection,
    projection_sha256: preview.projectionSha256,
    version: preview.version,
  };
  return `${JSON.stringify(sorted(document), null, 2)}\n`;
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
