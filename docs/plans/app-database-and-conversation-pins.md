# App Database, Contacts, and Conversation Pins

**Status:** complete

## Goal

Add one writable, app-owned SQLite database at `~/.imessage-pdf/app.db`.
The Messages `chat.db` remains read-only. Move contacts into the app database
and let users pin conversations to the top of the conversation list.

## Scope

1. **App database**
   - Add a small `node:sqlite` data layer that creates and migrates `app.db`.
   - Initial tables: `schema_migrations`, `contacts`, and
     `pinned_conversations`.
   - Store conversation pins by Messages database identity plus stable chat
     identity, rather than relying only on a `ROWID` that may differ between
     backups.

2. **Contacts migration**
   - Import `~/.imessage-pdf/contacts.json` once when the contacts table is
     empty, preserving the JSON file as a backup.
   - Keep the existing `/api/contacts` response shape, but remove its `path`
     parameter.
   - Remove `contactsPath` from local storage, providers, URLs, PDF requests,
     onboarding, and the contacts editor.

3. **Conversation pins**
   - Add a pins API for listing, pinning, and unpinning conversations.
   - Add a pin control to conversation rows with accessible hover/focus states.
   - Sort pinned conversations first while preserving last-message order within
     pinned and unpinned groups.
   - Keep pins local to each selected Messages database or backup.

4. **Verification**
   - Unit-test database creation, migration idempotency, JSON contact import,
     contact CRUD, and pin CRUD.
   - Exercise pin ordering and contact resolution in the UI.
   - Run lint, tests, production build, and Electron-window visual checks.

## Not Included

- Writing any state to Apple’s `chat.db`.
- Message-level pins or a pinned-message strip.
- Cloud sync or multi-user profiles.

## Progress

- Implemented the app database schema and writable connection.
- Added a one-time, non-destructive import from the legacy contacts JSON.
- Moved contacts CRUD and name resolution to `app.db`.
- Removed contacts-path inputs, local-storage usage, URL parameters, and PDF
  plumbing.
- Added `PRAGMA query_only = ON` on top of the read-only Messages database open.
- Implemented conversation pin CRUD scoped to each Messages database.
- Added optimistic row controls and server-side pinned-first ordering before
  pagination, with recency ordering preserved inside each group.
