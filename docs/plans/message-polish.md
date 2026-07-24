# Plan: Message Rendering Polish — Attachments, Link Cards, QR Codes

**Status:** draft — needs review

## Summary

Three rendering problems observed on real data (2026-07-23):

1. **Attachments are janky** — a full-size image renders as a huge block above the text instead of an iMessage-style media bubble.
2. **Bare URLs look bad** — long raw links wrap awkwardly inside bubbles. iMessage shows a link-preview card.
3. **Links in print/PDF are dead** — on paper you can't click. Replace/augment with a QR code so a reader can scan and follow.

All changes flow through `MessageBubble` and friends, so the PDF (which prints the same components via the print route) inherits them automatically — with a print-only variant for QR.

## 1. iMessage-like attachment layout

- Images/videos render as their own rounded media bubble (18px radius, no blue/gray bubble background) — matching how Messages separates media from text: when a message has both an attachment and text, they are **two stacked bubbles** (media bubble above, then a normal text bubble), tail only on the last one.
- Constrain media size: max height ~340px at the iPhone column width, preserve aspect ratio, `object-fit: cover` never crops content vertically beyond Messages' behavior — check reference screenshots in `docs/reference/`.
- Multiple images in one message: 2-up grid like Messages (up to a point, then +N overlay).
- Portrait monsters (screenshots) must not dominate the scroll: cap by height, not just width.
- Print route: same layout; ensure images don't split across page breaks (`break-inside: avoid`).

## 2. Link preview cards

- Detect messages that are a bare URL (or text + trailing URL, as Messages does) and render an iMessage-style link card: rounded card with domain name and title.
- **No network fetches at render time by default** — title/preview would require fetching the page, which is slow and often dead years later. v1 card shows: favicon-less card with the page domain prominent + full URL truncated middle. Optionally: Apple stores rich link metadata in `message.payload_data` (a `NSKeyedArchiver` plist with title/summary/image for messages sent with previews) — investigate decoding it; if usable, render the real title/preview image exactly as it appeared.
- Mixed text keeps current linkification for inline URLs inside sentences.

## 3. QR codes in print/PDF

- In the print route only (`/conversation/[id]/print`), each link card gets a small QR code (~64–80px) of the URL, placed inside the card on the right; a bare inline link inside a text bubble gets a QR beside/below the bubble in the margin gutter or as a compact trailing chip.
- Generate QR client-side with the `qrcode` npm package (pure JS, no native deps) as data-URL `<img>`s — no runtime network, works in headless-Chromium print and later Electron printToPDF.
- Web viewer: no QR (links are clickable); this is print-only.

## Testing

- Unit tests for the URL/message-shape classifier (bare URL vs text+URL vs inline) and for `payload_data` decoding if implemented (fixture blobs from the real backup).
- Visual verification against `/home/drew/work/hannah-imessage/` conversations with heavy image + link traffic; before/after screenshots on web and print routes.

## Open questions

1. Decode `payload_data` for real link titles/preview images in v1, or ship domain-only cards first? (Lean: ship domain-only, decode as fast-follow if the format cooperates.)
2. QR for *every* link, or only messages that are pure link shares? Inline-sentence links might get noisy.

## Out of scope

- Fetching live link previews over the network.
- Video thumbnails/poster-frame extraction changes (current behavior stays).
