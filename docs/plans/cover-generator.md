# Plan: Book Cover Generator

**Status:** in progress

## Summary

A standalone page that produces the **front + back cover PDF** of the keepsake book (see `pdf-book.md`). Front cover is an iMessage-style mockup: a single date/time header on top, a small array of user-authored bubbles styled exactly like the conversation viewer, and an optional typing-indicator bubble. Back cover is a single uploaded image, scaled to the trim size.

## Motivation

The book PDF (in flight) ships front matter, body, back matter — but no cover. Print-on-demand services accept covers as a separate PDF. This is the cover side of that pipeline: a one-shot tool that spits out a 2-page PDF (page 1 = front, page 2 = back) at the trim size, ready to upload alongside the body PDF.

The user wants the front cover to look like the live iMessage view (bubble shape, colors, sender alignment). That's the same constraint we solved for the body PDF: render the actual web components in headless Chromium. Reuse `MessageBubble`, `MessageList`-style grouping, the same fonts and CSS — zero drift.

## Approach

1. **Front cover** is a print-only React page (`/cover/print`) that reuses `MessageBubble`. Inputs: ordered messages (`text`, `isFromMe`), one date/time string for the header, optional trailing typing bubble. Renders centered in a column at the trim width.
2. **Back cover** is a second `<div data-page>` on the same print page that fills the trim with the uploaded image (cover-fit / contain — start with `object-fit: cover`).
3. **Spec transport.** A POST endpoint (`/api/generate-cover`) accepts the form (multipart for the image, JSON-encoded `spec` field). It stashes the parsed spec in an in-memory `Map<token, CoverSpec>` (image kept as a base64 data URL) and launches Puppeteer at `/cover/print?token=…`. The print page fetches `/api/cover-spec/[token]` to hydrate. Spec is deleted after the PDF is rendered (or on a 5-min TTL safety net).
4. **Sizing.** Same trim presets as the book plan (5.5×8.5, 6×9, 7×10, A5, custom W×H). One trim applies to both pages. Margin only applies to the front cover (back cover bleeds the image edge-to-edge).
5. **UI.** New page at `/cover`. Form has: trim preset/custom W×H, header date+time (datetime-local), repeatable list of message rows (text + side toggle), an "include typing indicator" checkbox, and a back-cover image picker (drag/drop or `<input type="file">`). Submit posts to `/api/generate-cover`, downloads the PDF.
6. **Entry point.** Link from the home page sidebar/header so it's discoverable. No conversation context required — this is a freestanding tool.

## Why not the React-PDF book renderer?

`pdf-book.md` proposes `@react-pdf/renderer` for the body. The cover would need pixel-perfect bubble reproduction (rounded `[18px]`, asymmetric tail, SF Pro metrics, exact `#007AFF` blue) — the same drift problem we already hit. Puppeteer print is already wired up for the conversation export; the cover route is one more page that uses it.

## File layout

```
app/cover/page.tsx                      # form UI
app/cover/print/page.tsx                # render target for Puppeteer
app/api/generate-cover/route.ts         # POST: ingest spec, return PDF
app/api/cover-spec/[token]/route.ts     # GET: hydrate print page
lib/cover/spec.ts                       # CoverSpec type + in-memory store + TTL
components/CoverForm.tsx                # the form (extracted for clarity)
components/CoverPreview.tsx             # (optional) live preview reusing MessageBubble
```

## Open questions

1. **Single file vs per-page bleed.** Some printers want a single combined cover (front + spine + back as one wide sheet). For v1 we ship a 2-page PDF and let the user combine if their printer needs it. Spine width depends on page count, which the body pipeline doesn't expose yet.
2. **Bleed.** Defer until needed. v1 trims exactly to the requested size; user can request bleed later.
3. **Typing indicator styling.** The example image shows three gray dots in a tail bubble. Render as a `MessageBubble`-shaped gray bubble with three animated-but-static dots. Animation isn't useful in print; static is fine.
4. **Persisting drafts.** Skip — the form is short. Reload starts over.

## Out of scope

- Spine generation (needs body page count).
- Multi-line title text rendered separately from the bubbles.
- Color-accurate ICC. sRGB is fine.
- CLI entry point. The user's reference to "a little CLI" is satisfied by the in-app form; if a true CLI is desired later, it can wrap `/api/generate-cover`.
