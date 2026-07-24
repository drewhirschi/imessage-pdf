// Classify the *shape* of a message's text with respect to the URLs it contains.
// This drives how MessageBubble renders: a message that is nothing but a URL
// becomes a link card, whereas a URL trailing/inline in a sentence stays inline
// text with the link highlighted.
//
// Pure + deterministic so it can be unit tested (classify.test.ts). No network.

export type MessageShape =
  | "no-url" // no http(s) URL anywhere
  | "bare-url" // the entire message is a single URL (nothing else)
  | "trailing-url" // some text followed by a single trailing URL
  | "inline"; // URL(s) embedded in the middle, or multiple URLs

export interface ClassifiedMessage {
  shape: MessageShape;
  /** All http(s) URLs found, in order, with trailing punctuation trimmed. */
  urls: string[];
}

// Matches http:// or https:// followed by non-whitespace. Trailing punctuation
// is trimmed afterwards so "(see https://x.com/a.)" yields "https://x.com/a".
const URL_RE = /https?:\/\/[^\s]+/gi;

// Trailing characters that are almost never part of a URL when they end one.
// We also balance a single trailing ")" only if the URL has no "(" of its own.
const TRAILING_PUNCT = /[.,;:!?'"»）】\]]+$/;

/** Trim punctuation that commonly follows, but isn't part of, a URL. */
export function trimUrl(raw: string): string {
  let url = raw;
  // Repeatedly strip trailing punctuation.
  let prev: string;
  do {
    prev = url;
    url = url.replace(TRAILING_PUNCT, "");
    // Drop a dangling ) that has no matching ( inside the URL.
    if (url.endsWith(")") && !url.includes("(")) url = url.slice(0, -1);
  } while (url !== prev);
  return url;
}

/**
 * Extract every http(s) URL from `text`, trailing punctuation trimmed.
 */
export function extractUrls(text: string): string[] {
  const urls: string[] = [];
  for (const m of text.matchAll(URL_RE)) {
    const trimmed = trimUrl(m[0]);
    if (trimmed) urls.push(trimmed);
  }
  return urls;
}

/**
 * A clean host label for display: strips a leading "www." and lowercases.
 * Falls back to the raw string if the URL can't be parsed.
 */
export function displayDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return url.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split(/[/?#]/)[0].toLowerCase();
  }
}

/**
 * Classify a message body. `text` may be null/empty (e.g. attachment-only or a
 * rich-link message whose URL lives in payload_data) — those are "no-url".
 */
export function classifyMessage(text: string | null | undefined): ClassifiedMessage {
  const value = (text ?? "").trim();
  if (!value) return { shape: "no-url", urls: [] };

  const urls = extractUrls(value);
  if (urls.length === 0) return { shape: "no-url", urls };

  // Multiple URLs → always inline.
  if (urls.length > 1) return { shape: "inline", urls };

  // Single URL: locate it and inspect what surrounds it.
  const only = urls[0];
  const idx = value.toLowerCase().indexOf(only.toLowerCase());
  const before = value.slice(0, idx).trim();
  // Everything after the URL, minus any trailing punctuation trimUrl stripped.
  const after = value.slice(idx + only.length).replace(TRAILING_PUNCT, "").trim();

  if (before === "" && after === "") return { shape: "bare-url", urls };
  if (after === "") return { shape: "trailing-url", urls };
  return { shape: "inline", urls };
}
