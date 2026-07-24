# Plan: Message Rendering Polish — Attachments, Link Cards, QR Codes

**Status:** shipped (2026-07-23). All three parts implemented and verified against the real backup (web + print + a generated PDF). See "Implementation notes" below.

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

## Open questions — resolved

1. **Decode `payload_data` or ship domain-only?** → **Decoded.** The format cooperates
   completely. `payload_data` is a `bplist00` NSKeyedArchiver archive of a `RichLink`
   wrapper whose `richLinkMetadata` is an `LPLinkMetadata`. We hand-rolled a minimal
   binary-plist reader + NSKeyedArchiver deref (`lib/link-preview/decode.ts`) and pull
   `originalURL`/`URL` (NSURL → `NS.relative`), `title`, `siteName`, `summary`. Against 12
   real recent blobs from the backup we got **12/12** clean extractions (url + title, most
   with siteName + summary). Rich-link messages have `text = NULL`, so this decode is the
   *only* way to render them — domain-only would have shown nothing useful. Decoding runs
   **server-side** in `/api/messages` (payload stays off the wire).
2. **QR for every link or only pure shares?** → **Only link *cards*** (bare-URL messages and
   rich links). Inline/trailing URLs inside sentences keep plain linkification with no QR, so
   the print output isn't noisy.

## Implementation notes

- **Classifier** (`lib/link-preview/classify.ts`, `classifyMessage`): `no-url` |
  `bare-url` (whole message is one URL, trailing punctuation tolerated) | `trailing-url`
  (text then a single URL at the end) | `inline` (URL mid-sentence, or 2+ URLs). Only http/https
  count; other schemes (mailto:/tel:/ftp:) are ignored. `trimUrl` strips trailing sentence
  punctuation and a dangling `)` that has no matching `(` inside the URL. Bare-URL and rich-link
  messages render a `LinkCard` in place of the text bubble; trailing/inline keep linkified text.
- **Attachment layout** (`MessageBubble.tsx`): media renders as its own rounded 18px bubble
  stacked above the text bubble (real iMessage behavior); the tail corner is applied only to the
  last bubble of the stack. Single image = one media bubble (height-capped at 320px so portrait
  screenshots don't dominate); 2+ images = a 2-up `object-cover` grid. vCard/location/video/
  generic attachments each become their own bubble. `ImageAttachment` is now layout-agnostic
  (parent owns radius/size).
- **QR** (`components/QRCode.tsx`): rendered as **inline SVG** built synchronously from
  `qrcode`'s module matrix, ~64px, inside the link card, print-only (`forPrint`).
  *Deviation from the plan's "data-URL `<img>`":* inline SVG is guaranteed present at render
  with no async image decode, so the print-ready gate (which waits on `<img>` load) can never
  miss it, and it's vector-crisp. Still the pure-JS `qrcode` package, no network.
- **Print CSS** (`globals.css`): `@media print` sets `break-inside/page-break-inside: avoid`
  on `.message-bubble-item` (and its media) and forces `print-color-adjust: exact` so blue
  bubbles and link cards keep their backgrounds under `page.pdf()`.

### Verification

- `pnpm test` green (55 tests incl. 19 classifier + 5 decode with 2 real innocuous fixture blobs
  in `lib/link-preview/__fixtures__/`). `pnpm build` passes. `pnpm lint`: no new errors from these
  files (only a pre-existing `tailwind.config.ts` `require()` error remains).
- Generated a real 11-page Letter PDF via `POST /api/generate-pdf` for a Sept–Oct 2025 window of
  chat 2 (link + image heavy): 11 link cards each with a scannable QR, 2-up image grids, and a
  height-capped portrait screenshot all rendered correctly with backgrounds intact.

## Out of scope

- Fetching live link previews over the network.
- Video thumbnails/poster-frame extraction changes (current behavior stays).
- Rich-link *preview images* embedded in `payload_data` (stored as a separate HEIC attachment
  substitute) — the card uses a domain monogram instead; wiring the embedded image is a
  possible fast-follow.
