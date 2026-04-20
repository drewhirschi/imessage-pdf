# Plan: VCard + Location Attachment Rendering

**Status:** shipped v1 (2026-04-20). Parser + both components + MessageBubble dispatch are in. Avatar rendering from `PHOTO;ENCODING=b` is supported. Static map previews are still deferred per open question 1.

## Summary

Parse and nicely render the two Apple-flavored vCard attachments that currently fall through to the generic 📎 placeholder: **contact cards** (`public.vcard`) and **shared locations** (`public.vlocation`). Applies to both the web viewer and the PDF export.

## Motivation

The very first message from `+12063343694` in the test DB is a shared location that shows as `📎 CL.loc.vcf`. There are also real contact cards (e.g. `Candaus Lowery.vcf`). Both are common, and showing them as mystery file icons loses obvious context.

## What's in the data

From the test DB, two related MIME types exist:

| File | mime | UTI | Meaning |
| --- | --- | --- | --- |
| `CL.loc.vcf` | `text/x-vlocation` | `public.vlocation` | Shared location (Apple Maps) |
| `Candaus Lowery.vcf` | `text/vcard` | `public.vcard` | Contact card |

Both are plain text vCard 3.0. Examples from the backup:

**Shared location:**
```
BEGIN:VCARD
VERSION:3.0
N:;Current Location;;;
FN:Current Location
item1.URL;type=pref:http://maps.apple.com/?ll=40.252414\,-111.661599&q=40.252414\,-111.661599
item1.X-ABLabel:map url
END:VCARD
```

**Contact:**
```
BEGIN:VCARD
VERSION:3.0
N:Lowery;Candaus;;;
FN:Candaus Lowery
ORG:Aptive\, has place to live.;
TEL;type=CELL;type=VOICE;type=pref:615.785.4578
END:VCARD
```

Unescape rule: vCard escapes commas as `\,` and semicolons as `\;`. Multi-value fields like `N:` and `ORG:` are `;`-separated.

## Approach

### Parser

Small module `lib/vcard/parse.ts`. No external dep — the subset we need is tiny.

API:
```ts
type VCard = { kind: 'contact'; fn?: string; org?: string; tel: string[]; email: string[] };
type VLocation = { kind: 'location'; label: string; lat: number; lng: number; mapsUrl: string };
type Parsed = VCard | VLocation;

function parseVCard(raw: string): Parsed | null;
```

Detection order:
1. If any URL contains `maps.apple.com` with `ll=<lat>,<lng>` query params → `VLocation`.
2. Otherwise → `VCard` with `FN`, `ORG`, and all `TEL` / `EMAIL` entries collected.

### Delivery

Two options — recommending **(a)** for simplicity:

**(a) Client fetches raw, parses in browser.** The attachments route already serves arbitrary files. For vCard/vLocation, client detects by extension/mime and fetches as text rather than blob. Tiny files (<2KB typically).

**(b) New server endpoint** `/api/attachments/[id]/parsed` that reads + parses + returns JSON. Cleaner separation, extra round-trip.

v1 goes with (a). If performance or privacy needs it, promote to (b).

### Components

New components:
- `components/VCardAttachment.tsx` — card with name, org, phone(s), email(s). Phone numbers are `tel:` links; emails are `mailto:`. Avatar is a generated initials circle.
- `components/LocationAttachment.tsx` — small card with label ("Shared location" or custom), the coords, and a "View in Maps" link. Optional: embed a static map image (see open questions).

Wire-up in `MessageBubble.tsx` at the attachment-type dispatch (`MessageBubble.tsx:115-150`):

```ts
const isVCard    = mime === 'text/vcard' || filename?.endsWith('.vcf');
const isLocation = mime === 'text/x-vlocation' || filename?.endsWith('.loc.vcf');
```

`isLocation` must be checked **before** `isVCard` because `.loc.vcf` also ends with `.vcf`.

### PDF rendering

Add corresponding blocks in `lib/pdf/MessagePDF.tsx`:
- Contact card → bordered box with name + org + phone/email lines.
- Location → bordered box with label, coords, and the Apple Maps URL (clickable in PDF viewers).

For the PDF, the vcard file is already on disk at generation time, so the server-side PDF route can parse inline — no extra fetch needed.

## Open questions

1. **Static map image for locations?** We could embed a tile snapshot (e.g. via an offline map source or, less ideally, a public tile server). Adds a dependency and potentially external network for a feature the user flagged as nice-to-have. Default v1: no image, just label + coords + link.
2. **Avatars for contacts** — iMessage sometimes includes a `PHOTO;ENCODING=b:...` block. None seen in the sample but they exist. Detect and render the embedded base64 if present? Probably yes, low cost.
3. **Auto-populate contacts book?** When a `VCard` with a `TEL` lands that matches an unresolved handle in the contacts book, offer a "save name" button. Lives in the contacts plan but worth cross-referencing.
4. **Escape handling edge cases** — the hand-rolled parser will struggle with folded lines (`\r\n ` line continuations) or quoted-printable encoded values. Sample data has neither, so v1 skips them. Add if we hit real failures.

## Rollout order

1. `parseVCard` + unit tests against the two sample files.
2. Hook new components into `MessageBubble`.
3. PDF renderer updates.
4. (If desired) avatar rendering + auto-populate prompt for contacts book.
