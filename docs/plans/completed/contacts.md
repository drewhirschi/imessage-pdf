# Plan: Contacts Book

**Status:** shipped v1 (2026-04-20). The design below describes the implementation that landed, with one deviation noted at the end.

## Summary

Add a local contacts book so phone numbers (and emails) surface as real names everywhere in the app: conversation list, participant chips, message sender labels, reaction sender lists, and PDFs. Storage is a single JSON file edited in-app.

## Motivation

Handles in `chat.db` are raw identifiers. Today every UI surface shows `+14085050565` instead of a name. When browsing a multi-year history (or group chats with 3+ unknown numbers), this is painful. The user wants to avoid having to mentally resolve numbers.

## Scope

### In scope
- A flat JSON file mapping handle id → display name.
- Load into memory server-side on first request; cache; hot-reload on file mtime change.
- Pass the resolved map to the client alongside existing API responses (don't force a second round trip).
- Minimal inline editor: "add name" button next to any unresolved handle.
- Dedicated "Contacts" page listing every handle the DB has seen, with a text input per row.
- Seed: button to "import all unknown handles from DB" into the JSON as empty entries ready to fill.

### Out of scope (v1)
- Syncing with macOS AddressBook / iCloud contacts.
- Parsing vCard attachments *into* the contacts book (separate vcard rendering plan).
- Multiple profile pictures / avatars. (Nice-to-have v2.)
- Nicknames per-conversation. One global map for v1.

## Storage

Path: user-configurable, same pattern as `dbPath` and `attachmentsPath`. Default: `~/.imessage-pdf/contacts.json`. Saved in `localStorage` as `imessage-contacts-path`.

File shape (v1):

```json
{
  "version": 1,
  "contacts": {
    "+14085050565": { "name": "Hannah" },
    "+14086160645": { "name": "Mom" },
    "drew@enzo.health": { "name": "Drew" }
  }
}
```

Design notes:
- Keyed by raw handle string so lookup is O(1) and we don't have to normalize phone formatting on every read.
- Object values (not bare strings) so we can add fields later (nickname, avatar, role-in-group) without a migration.
- `version` field for forward-compat.

Normalization: do **not** normalize phone numbers on write (keep what iMessage stored). On lookup, try the exact key first; fall back to a normalized compare (strip `+`, `-`, spaces, parens) so `+14085050565` and `(408) 505-0565` both resolve.

## Server changes

- New module `lib/contacts/store.ts`:
  - `loadBook(path)` — reads JSON, parses, caches by mtime. Returns `ContactsBook`.
  - `buildResolver(book)` / `getResolver(path)` — exact then normalized-digit lookup.
  - `saveBook(path, book)` — atomic write (temp file + rename).
  - `upsertContact(path, handleId, name)` / `replaceBook(path, contacts)` — mutations used by the API route.
- New API route `app/api/contacts/route.ts`:
  - `GET ?path=` → whole book.
  - `PUT ?path=` body `{contacts}` → overwrite.
  - `PATCH ?path=` body `{handleId, name}` → upsert one entry. Empty `name` deletes.
- New API route `app/api/handles/route.ts`:
  - `GET ?dbPath=` → every unique handle in the DB with `message_count` and `last_seen`, used by `/contacts` to seed names and rank most-used handles first.
- `/api/generate-pdf` accepts optional `contactsPath` and threads resolved names into the PDF.
- **Deviation from plan:** `/api/conversations` and `/api/messages` were NOT extended to bake resolved names into the response. Resolution happens client-side via `ContactsProvider` so inline edits are instant (no refetch needed). The server-side resolver is only used where the server must render names itself — currently just PDF generation.

## UI changes

- `PathConfiguration` — add third input "Contacts file" with quick-set (`~/.imessage-pdf/contacts.json`) and a "create new" action that writes an empty book.
- `ConversationList` — show `resolved_display_name` if set, else fall back to existing behavior. For group chats, show comma-joined resolved names; unresolved numbers show truncated, e.g. `Hannah, Mom, +1…5050`.
- `MessageBubble` — the `sender` line uses `resolved_sender` when present. Add a small "add name" pencil icon next to unresolved senders; clicking opens an inline popover → PATCH + optimistic update.
- New page `/contacts`:
  - Full-width table: Handle | Name (editable) | Last seen | Message count | Action.
  - "Import unknown handles" button → PATCH for every missing handle with empty name.
  - Save button or save-on-blur per row.

## Open questions

1. **Word "Wonder"** in the ask is probably a speech-to-text glitch. I'm interpreting "allow just a custom setting for Wonder" as "allow a custom setting [file path] for this" — confirm?
2. Do you want **one global book** or **one per DB** (so the personal and work chat.db can have different maps)? Current plan assumes one per configured path — you'd just point to a different file. No code work needed to support both.
3. For the **participant chips in group chats**, should unresolved numbers stay fully visible or be trailing-masked like `+1…5050`? Trailing-mask is less intimidating but slightly lossy.
4. Should the contacts file also feed the PDF output? (Assumed yes — PR will wire it through.)

## Rollout order

1. JSON store + loader + resolver (no UI).
2. API route extensions so both list and messages surface resolved names.
3. `MessageBubble` + `ConversationList` read-only use of resolved names.
4. Inline "add name" popover (PATCH one entry).
5. `/contacts` page with full editor + bulk import.
6. PDF renderer reads the resolver and swaps sender labels.
