import type { Contact } from "./types";

export function normalizeHandle(h: string): string {
  if (h.includes("@")) return h.toLowerCase().trim();
  return h.replace(/\D/g, "");
}

export function resolveName(
  entries: Record<string, Contact>,
  handleId: string | null | undefined
): string | null {
  if (!handleId) return null;
  const exact = entries[handleId];
  if (exact?.name) return exact.name;
  const target = normalizeHandle(handleId);
  for (const [k, v] of Object.entries(entries)) {
    if (!v?.name) continue;
    if (normalizeHandle(k) === target) return v.name;
  }
  return null;
}
