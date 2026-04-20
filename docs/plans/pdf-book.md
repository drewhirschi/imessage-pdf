# Plan: Hardbound Book PDF Export

**Status:** draft — needs review

## Summary

Upgrade from "printable PDF of a conversation" to a **print-ready book**: configurable trim size, margins sized for real hardbound binding, chapters, running headers, page numbers with alternating insets, title/copyright/TOC pages, and a date-range slice of a conversation. Intended to be uploaded to a print-on-demand service (Lulu, Blurb, BookVault, a local printer) and shipped as an actual hardcover.

## Motivation

The existing PDF export is a utilitarian transcript for screen reading. The user's eventual goal is a physical keepsake book — "give it date range X to Y, give me a book of trim size W × H". The current output won't survive printer specs (no bleed, wrong paper size, chat bubbles look wrong at small trim).

## Scope

### In scope (v1 — "Book mode")
- New UI flow: from the conversation view, a "Make a book…" button opens a form for title, subtitle, date range, trim size, margins, style.
- New API route `POST /api/generate-book` that takes the same inputs and streams a PDF.
- Trim size presets: 5.5×8.5, 6×9, 7×10, 8×10, A5, A4. Custom numeric input in inches or mm.
- Margin controls: inside (gutter), outside, top, bottom. Gutter default scales with page count estimate. Sensible defaults based on trim.
- Bleed toggle (off by default): when on, add 0.125" bleed on outer three sides.
- Front matter: title page, copyright/meta page, dedication (optional single line), TOC.
- Back matter: index of participants (optional), colophon.
- Body content:
  - Chaptering by **month** or **year** — user chooses.
  - Running headers: book title on verso, current chapter (e.g. "March 2024") on recto.
  - Page numbers in outer bottom corners.
  - Date separators within chapters.
  - Two layout modes: **"transcript"** (chat-bubble style, similar to current) and **"prose"** (Sender: message, denser, book-like). v1 ships prose as default because bubbles at 6×9 look off.
- Attachments:
  - Images embedded inline, sized to column width; very large images get a dedicated centered page.
  - Video / audio shown as a labeled placeholder with timestamp (can't print video).
  - VCard / Location rendered per the vcard plan.

### Out of scope (v1)
- Cover design (spine, front cover art, back cover blurb). Print services accept covers separately. Could add a "generate cover PDF" later.
- Multi-volume splitting when page count exceeds a bindery max (~800pp).
- Color-accurate ICC profiles. Default sRGB is fine for first iteration.
- EPUB output.

## Inputs

```ts
type BookRequest = {
  chatId: number;
  dbPath: string;
  attachmentsPath: string;
  contactsPath?: string;

  title: string;
  subtitle?: string;
  authors?: string[];            // "For the bookshelf of ..."
  dedication?: string;

  startDate?: number;            // iMessage ns
  endDate?: number;              // iMessage ns

  trim: { widthIn: number; heightIn: number };
  margins: { insideIn: number; outsideIn: number; topIn: number; bottomIn: number };
  bleed: boolean;

  chapterBy: 'month' | 'year' | 'none';
  layout: 'prose' | 'transcript';

  includeTOC: boolean;
  includeParticipantIndex: boolean;
};
```

## Implementation

### Renderer

Stay on `@react-pdf/renderer` — it already ships, supports flexible page sizes (`size={[width, height]}`), and `@react-pdf`'s `<Document>` / `<Page>` / `<View>` / `<Text>` / `<Image>` primitives are enough for book layout. Page size accepts points; convert inches × 72.

Trade-off noted: `@react-pdf/renderer` has no native hyphenation, tight widow/orphan control, or automatic index generation. For a personal book this is acceptable; if output quality is disappointing, alternatives are (a) Puppeteer + print CSS, (b) a dedicated book engine like Paged.js + Chromium, or (c) LaTeX via `tectonic`. Defer that decision.

### File layout

```
lib/pdf/book/
  BookPDF.tsx            # top-level Document — assembles front matter, body, back matter
  pages/
    TitlePage.tsx
    CopyrightPage.tsx
    DedicationPage.tsx
    TOCPage.tsx
    BodyPage.tsx         # wrapper that adds running header + page number
  blocks/
    Chapter.tsx          # chapter opener
    DateHeading.tsx
    MessageBlock.tsx     # prose layout
    MessageBubble.tsx    # transcript layout (reuse existing styling, adapted)
    AttachmentImage.tsx
    VCardBlock.tsx       # from vcard plan
    LocationBlock.tsx
  styles/
    theme.ts             # fonts, colors, spacing
    pageGeometry.ts      # computes margins, header/footer positions from trim + bleed
  fonts.ts
```

### Pagination / layout pipeline

1. Fetch all messages in range (no pagination — book needs the whole thing in memory). The existing `getMessagesForConversation` already supports `startDate`/`endDate`; call with a huge `limit`.
2. Pre-process attachments in parallel (HEIC → JPEG, resize, base64), just like the current `/api/generate-pdf`.
3. Group by chapter (month or year).
4. Within each chapter, group by date; drop identical-timestamp clustering rules from the chat view and use book-appropriate density.
5. Render. `@react-pdf/renderer`'s `<Page>` handles the page breaks; we just need to make sure images don't orphan their captions etc.

### Page numbers & running headers

`@react-pdf/renderer` supports `render={({ pageNumber, totalPages, subPageNumber })}` on `<Text>` inside `<View fixed>`. Use one `<View fixed>` for header, one for footer, conditionally left/right-aligned based on `pageNumber % 2`.

Suppress header/footer on title, copyright, dedication, and chapter-opener pages (standard book typography).

## UI

New component `components/BookExportDialog.tsx` — modal opened from the conversation page. Form groups:

- **What's in it** — title, subtitle, date range (pre-filled from the current filter), dedication.
- **Physical** — trim size preset + custom, margins, bleed.
- **Style** — chapter granularity, layout (prose/transcript), include TOC, include participant index.

Submit → POST to `/api/generate-book` → browser downloads `Title.pdf`.

## Open questions

1. **Prose vs transcript default** — I'm betting on prose for book aesthetics. Worth a sample render of each to decide.
2. **Image handling strategy** — inline-with-text, or a dedicated "plates" section every 32 pages? Inline is simpler; plates look nicer for photo-heavy conversations. Lean inline for v1.
3. **Font pairing** — serif body (e.g. Source Serif, EB Garamond) + sans for timestamps? Any licensed font needs to be registered with `@react-pdf/renderer` and bundled. Open to user preference.
4. **Group chats** — sender names appear on every message in prose layout. Gets noisy. Options: (a) always show sender, (b) only when sender changes, (c) left-rail gutter with sender name. v1 default: (b).
5. **Reactions** — in prose, render inline as `(Drew reacted ❤️)`. In transcript, keep the bubble overlay style. Confirm?
6. **Date range UX** — a visual picker that shows message density per month? Useful for picking natural volume breaks. Probably v2.
7. **Maximum book size** — warn when estimated page count > ~800 (common bindery limit). Offer to auto-split by year.

## Rollout order

1. `pageGeometry` + bare bones `BookPDF` that renders title page + one prose chapter at 6×9.
2. Running headers + page numbers with odd/even alternation.
3. Chapter breaks (month/year).
4. Attachment rendering (inline images, vcard/location per the vcard plan, video placeholders).
5. TOC generation.
6. UI dialog + API route wired end-to-end.
7. Polish: widow/orphan pass, dedication/copyright pages, bleed toggle.
8. (Deferred) participant index, cover PDF helper.

## Dependencies on other plans

- `docs/plans/contacts.md` — book output should prefer resolved names over raw handles.
- `docs/plans/vcard-rendering.md` — vcard and location blocks are shared.

Both should land before (or alongside) v1 polish.
