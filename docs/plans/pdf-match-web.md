# Plan: PDF Export That Matches the Web Rendering

**Status:** in progress

## Summary

Replace the `@react-pdf/renderer` export with a **headless Chromium print-to-PDF** pipeline that re-uses the actual web components. One source of truth for rendering (the `MessageBubble` tree), zero chance of drift between what the user sees and what they get.

## Motivation

`lib/pdf/MessagePDF.tsx` is a parallel implementation of the chat view. Every bubble/date/reaction/attachment rule that lives in the web renderer has to be re-implemented there. It already drifts: no swipe timestamps, no tapback tail, no sender-label spacing, no linkification, etc. The user's one hard requirement is "match the web rendering exactly" — so render the web.

## Approach

1. New route `app/conversation/[id]/print/page.tsx`: identical message rendering to the live conversation view, but stripped of sidebar, infinite scroll, drag handle, and any interactive chrome. All messages fetched at once (paginate through `/api/messages` server-side? or client?). Respects the same `startDate` / `endDate` query params as the viewer.
2. New modal `components/PDFOptionsDialog.tsx` with: page size (Letter / A4 / Legal / custom W×H in inches), margin (inches), column width in px (pre-filled with current viewer width). Submit posts to `/api/generate-pdf`.
3. Rewrite `app/api/generate-pdf/route.ts`: use `puppeteer-core` + system Chromium (`/usr/bin/chromium`), launch, navigate to `/conversation/[id]/print?…`, `waitUntil: 'networkidle0'`, then `page.pdf({ printBackground: true, width, height, margin })`. Stream the PDF back.
4. Wire the existing "Generate PDF" button to open the dialog instead of firing straight off.

### Why Puppeteer, not `@react-pdf/renderer`

`@react-pdf/renderer` runs on a Yoga layout engine, not on CSS. It cannot match the current bubble CSS (SF Pro metrics, percentage max-widths, `rounded-[18px]` with asymmetric tail, swipe layout). Matching "exactly" would mean rewriting all styles and reactions, and it would still drift. Chromium prints real HTML + CSS, so "exactly" is free.

### Date filter

PDF uses the same `startDate` / `endDate` (iMessage ns) the viewer passes today. The print route accepts them as query params; the API forwards whatever the dialog submits.

### Trade-offs

- Need a Chromium binary at runtime — `puppeteer-core` + system binary keeps node_modules small (system has chromium + chrome already).
- Dev server must be running to generate (Puppeteer hits localhost:3000). Fine; the current API already requires it.
- Group-of-bubbles heuristics (5-min gaps, sender runs, date separators) currently live in `app/conversation/[id]/page.tsx`. Extract to `lib/messages/grouping.ts` so print view and viewer share it — otherwise they'll drift.

## Out of scope (for now)

- Book mode (see `pdf-book.md`).
- Print layout tweaks (page breaks between sender changes, etc.) — we just render the column and let Chromium paginate.

## Open questions

1. Images inside the print view are served from `/api/attachments/[id]` — those will also be fetched by Puppeteer. Should be OK; the API is on the same origin. HEIC conversion is slow; `networkidle0` waits for it.
2. Column width vs. page width: if the user picks Letter with 0.5" margins and a 430px column, the column is much narrower than the page. Default: center the column. Could offer "full width" later.
