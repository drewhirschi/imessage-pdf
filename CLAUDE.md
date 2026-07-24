# CLAUDE.md

Guidance for Claude Code working in this repo.

## Project

Next.js 15 (App Router, Turbopack) app for browsing a local iMessage `chat.db` and exporting conversations to PDF. Runs entirely locally; no external services. DB access is read-only.

## Running

- **Node: >=24 recommended** (`engines` + `.nvmrc` pin 24). The DB layer uses Node's built-in `node:sqlite`, which is **stable in Node 24**. On **Node 22.5+** it lives behind `--experimental-sqlite`, so the `dev`/`build`/`start`/`test` scripts prepend `NODE_OPTIONS=--experimental-sqlite`. That flag is a harmless no-op on Node 24, so the scripts work on both — but the flag prefix is **temporary**; once everyone is on Node 24 it can be dropped. `pnpm install` does not hard-fail on Node 22 (pnpm only warns on `engines` unless `engine-strict` is set).
- Package manager: **pnpm** (v10+). `pnpm install` and `pnpm dev`.
- No more `better-sqlite3` — there is no native SQLite module to rebuild. The remaining native modules `sharp` and `unrs-resolver` must be in `pnpm.onlyBuiltDependencies` in `package.json` or pnpm v10 silently skips their build scripts.
- Dev server: `pnpm dev` → http://localhost:3000.
- Tests: `pnpm test` (Vitest). Suites live next to their code (`lib/db/*.test.ts`, `lib/utils/timestamp.test.ts`). The DB tests build a temp fixture `chat.db` with the iMessage schema subset via `test/fixture.ts` — they are self-contained and never touch the real backup. `pnpm test` also carries `NODE_OPTIONS=--experimental-sqlite` for Node 22.

## Working copy of real data

A large personal iMessage backup lives at `/home/drew/work/hannah-imessage/` (~82GB, not tracked). Use this for manual QA. It has `chat.db`, `chat.db-shm`, `chat.db-wal`, and `Attachments/`.

To inspect the DB directly: `sqlite3 -readonly /home/drew/work/hannah-imessage/chat.db` — schema highlights below.

## Architecture

### Routes (`app/`)

- `app/page.tsx` — home; `PathConfiguration` + `ConversationList`.
- `app/conversation/[id]/page.tsx` — conversation viewer; infinite-scroll messages (500/page), date range, PDF trigger.

### API (`app/api/`)

- `GET /api/conversations?dbPath&phoneNumber&page&limit` — paginated conversations.
- `GET /api/messages?chatId&dbPath&startDate&endDate&page&limit&getDetails` — paginated messages with attachments + reactions. `startDate` / `endDate` are **iMessage nanoseconds** (see timestamps below).
- `GET /api/attachments/[id]?dbPath&attachmentsPath` — serves a single attachment. Auto-converts HEIC → JPEG via `heic-convert` + `sharp`.
- `POST /api/generate-pdf` — renders a conversation to PDF via `@react-pdf/renderer`, streams the response. Accepts optional `contactsPath` in body to resolve phone numbers to names.
- `GET /api/file-system?path` — breadth-first directory listing for the path picker UI.
- `GET /api/handles?dbPath` — all unique handles in the DB with message count + last-seen, used by the contacts editor.
- `GET|PUT|PATCH /api/contacts?path` — contacts book CRUD. `PUT` replaces the whole book, `PATCH {handleId, name}` upserts (empty name deletes).

### Data layer (`lib/db/`)

- `connection.ts` — lazy singleton `node:sqlite` (`DatabaseSync`) connection, opened read-only. A thin adapter exposes a better-sqlite3-shaped `prepare().get()/.all()/.run()` API so `queries.ts` and the routes are unchanged. It enables `setReadBigInts(true)` and coerces the returned BigInts back to `Number` at the boundary, because `node:sqlite` otherwise **throws `ERR_OUT_OF_RANGE`** on iMessage's out-of-safe-range nanosecond dates; the Number coercion reproduces better-sqlite3's default (lossy) read behavior exactly.
- `queries.ts` — all SQL lives here. Key functions: `getAllConversations`, `getMessagesForConversation`, `getConversationDetails`, `getAttachmentPath`. Reactions are pulled in the same query and grouped by message GUID; reaction type codes **2000–2005** map to `heart | thumbs_up | thumbs_down | laugh | emphasize | question`.
- `types.ts` — `Chat`, `Message`, `Handle`, `Attachment` (raw schema); `ConversationSummary`, `MessageWithAttachments`, `Reaction` (view models).

### PDF (`lib/pdf/`)

- `MessagePDF.tsx` — React component compiled by `@react-pdf/renderer`.
- `styles.ts`, `fonts.ts` — styling + font registration.
- Attachments pipeline: read from disk → HEIC → JPEG → resize to 800×1000 max via `sharp` → base64 data URL → embed.

### Components (`components/`)

- `PathConfiguration` — path inputs; persists to `localStorage` (`imessage-db-path`, `imessage-attachments-path`). The DB path and attachments path are passed as query/body params on every API call.
- `ConversationList` — infinite scroll, debounced phone search (500ms), writes filter to URL.
- `MessageBubble` — renders text (with URL linkification), attachments (image/video/generic), reactions. **Non-image, non-video attachments currently fall through to a generic 📎 placeholder at `MessageBubble.tsx:140-146`** — this is the hook point for vcard/location rendering.
- `ImageAttachment`, `VideoAttachment` — media with loading states.
- `ReactionIndicator`, `ReactionDetailsModal` — reaction emoji + sender list.
- `DateRangePicker` — URL-driven date filter.
- `FileExplorer` — modal directory picker.

## Timestamps

iMessage stores dates as **nanoseconds since 2001-01-01 UTC**. Unix epoch is 1970-01-01. Convert with `lib/utils/timestamp.ts` — `imessageToDate` and `unixToImessageTimestamp`. API accepts/returns iMessage nanoseconds; UI converts at the edges.

## Handles / contacts

Handles in `chat.db` are raw identifiers (phone number or email). Name resolution flows through a JSON contacts book (default `~/.imessage-pdf/contacts.json`), keyed by raw handle with a normalized phone-digits fallback. Server-side resolver lives in `lib/contacts/store.ts`; client-side provider is `components/ContactsProvider.tsx`. Every UI that shows a sender (`ConversationList`, `MessageBubble`, `ReactionDetailsModal`, conversation sidebar) reads through `useContacts().resolve()`. Inline rename uses `InlineNameEditor`; the full editor is at `/contacts`. The plan that drove this is `docs/plans/completed/contacts.md`.

## VCard attachments

`.vcf` (`public.vcard`) and `.loc.vcf` (`public.vlocation`) render via dedicated components (`VCardAttachment`, `LocationAttachment`) instead of the generic 📎 placeholder. Dispatch happens in `MessageBubble.tsx`; **`.loc.vcf` must be checked before `.vcf`** because it also ends in `.vcf`. The parser is hand-rolled in `lib/vcard/parse.ts` (vCard 3.0 subset, enough for Apple's variants). Contact cards offer a "Save to contacts book" shortcut that PATCHes the resolver with `FN` keyed on the primary phone. Plan: `docs/plans/completed/vcard-rendering.md`.

## Conventions

- **Plans live in `docs/plans/`.** Before non-trivial work, write or update a plan there and reach alignment before coding. Plan files are markdown with a short summary, scope, open questions, and a proposed approach. Shipped plans move to `docs/plans/completed/` with their status line updated.
- Prefer editing files over adding new ones.
- Don't add feature flags or compat shims "just in case" — this is a personal tool.
- Native-module errors after a fresh install usually mean pnpm skipped a build script. See Running above.

## Known gotchas

- `next.config.js` and `next.config.ts` both exist — Next will prefer one; verify which is in effect before editing config.
- Turbopack is the default dev bundler (`next dev --turbopack`), but Webpack config is also present and will warn.
- `AttachmentsPath` resolution: the API strips `~/Library/Messages/` or `/Library/Messages/` prefixes from `attachment.filename` and joins against the user-provided `attachmentsPath`. If paths look broken, check that prefix handling in `/api/attachments/[id]`.
