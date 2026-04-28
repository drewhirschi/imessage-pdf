// In-memory store for cover specs handed off between the
// /api/generate-cover endpoint and the /cover/print page Puppeteer renders.
// Specs are hydrated by token on the print page, then dropped after the PDF
// is produced. A 5-minute TTL covers stalled renders.

export interface CoverMessage {
  text: string;
  isFromMe: boolean;
}

export interface CoverSpec {
  /** Date/time string shown at the top of the front cover, e.g. "Dec 25, 2021, 8:00 AM". */
  dateLabel: string;
  messages: CoverMessage[];
  /** Trailing typing-indicator bubble (three dots, gray, on the receiver side). */
  showTypingIndicator: boolean;

  // ── Single-page spread geometry (Lulu-compatible) ─────────────────────────
  // Total page = bleed + (trim) + spine + (trim) + bleed wide,
  // bleed + trim + bleed tall.
  /** Per-face trim width (inches). Front and back cover are the same. */
  trimWidthIn: number;
  /** Per-face trim height (inches). */
  trimHeightIn: number;
  /** Spine width (inches). From Lulu's spine calculator: pages × paper-thickness. */
  spineWidthIn: number;
  /** Bleed (inches) on each outer edge. Lulu standard: 0.125. */
  bleedIn: number;
  /** Spine fill color (CSS color, e.g. "#000000"). */
  spineColor: string;
  /** Optional spine text rotated 90°. Empty = no text. */
  spineText: string;
  /** Spine text color. */
  spineTextColor: string;

  /** Margin (inches) on the front cover, measured from each trim edge. */
  marginIn: number;
  /** Column width (px) for bubbles on the front cover. */
  columnWidthPx: number;
  /** Multiplier applied to bubble font size, padding, radii, and spacing. 1.0 = native iMessage size. */
  bubbleScale: number;
  /** Back-cover image as a data URL. Fills the back face including bleed. */
  backImageDataUrl: string | null;
}

interface Entry {
  spec: CoverSpec;
  expiresAt: number;
}

const TTL_MS = 5 * 60 * 1000;

declare global {
  // Persist across Next.js HMR reloads in dev.
  var __coverSpecStore: Map<string, Entry> | undefined;
}

const store: Map<string, Entry> =
  globalThis.__coverSpecStore ?? (globalThis.__coverSpecStore = new Map());

function sweep() {
  const now = Date.now();
  for (const [token, entry] of store) {
    if (entry.expiresAt <= now) store.delete(token);
  }
}

export function putCoverSpec(spec: CoverSpec): string {
  sweep();
  const token =
    globalThis.crypto?.randomUUID?.() ??
    Math.random().toString(36).slice(2) + Date.now().toString(36);
  store.set(token, { spec, expiresAt: Date.now() + TTL_MS });
  return token;
}

export function getCoverSpec(token: string): CoverSpec | null {
  sweep();
  return store.get(token)?.spec ?? null;
}

export function deleteCoverSpec(token: string): void {
  store.delete(token);
}
