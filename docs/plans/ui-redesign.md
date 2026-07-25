# Plan: Ground-Up UI Redesign — shadcn, Nav, One-Path Onboarding, Pins, Sync Stats

**Status:** draft — needs review (captured from user riff 2026-07-24)

## Theme

Stop making users think like developers. Today the app asks for three filesystem
paths, scatters features behind ad-hoc links, and looks like a dev tool. Target:
opens like an app, finds your data itself, one nav bar, polished shadcn look.

## 1. One path, not three (onboarding simplification)

- **Single location concept.** `chat.db` and `Attachments/` always live together
  (`~/Library/Messages/` live, or side-by-side in a backup folder). The UI asks for
  ONE folder at most — and usually zero, because auto-detect already probes the
  default. Attachments path is derived, never asked for.
  - The health/resolve endpoint already handles the backup-folder shape; make that
    the *only* client flow. An "Advanced" disclosure keeps separate custom paths as
    an escape hatch for weird layouts, hidden by default.
- **No contacts path, ever.** The contacts book becomes app-managed storage at a
  fixed location the user never sees. Move from "JSON at a user-chosen path" to a
  **writable SQLite db** via `node:sqlite` at `~/.imessage-pdf/app.db` (contacts
  table now; pins table below; room for future prefs). One-time transparent
  migration: if `~/.imessage-pdf/contacts.json` exists, import it on first open.
  - Kills the `contactsPath` query param threaded through every page/API call and
    the contacts-path input in onboarding. `/api/contacts` keeps its shape, drops
    the `path` param.
- Onboarding screens that remain: auto-detected → straight to conversations;
  permission → FDA explainer (unchanged); not found → ONE folder picker with the
  "what we looked for" hint.

## 2. Visual ground rewrite with shadcn/ui

- Adopt **shadcn/ui** (Tailwind is already in place; add the CLI, tokens, and the
  components we actually use: button, input, card, dialog, dropdown, tooltip,
  popover, badge, table, tabs, skeleton, sonner for toasts).
- **App shell with a top nav bar**: Conversations · Contacts · Stats,
  plus a settings affordance (change data folder). Replaces the random corner
  links. Active-route highlighting. The db-location banner collapses into a small
  status chip in the nav ("Using Messages database ✓" / warning state) with a
  popover for details.
- Redesign pass over every screen using shadcn primitives: conversation list
  (cards/rows, search, skeletons), conversation view header, date-range picker,
  PDF dialog, contacts editor (table + inline edit), diagnostics page (stat cards
  + histogram), FDA screen, folder picker.
- **The message rendering itself (bubbles, tapbacks, media, link cards) does NOT
  change** — it deliberately mimics iMessage, not shadcn. Only the chrome around
  it does.

## 3. Message pinning

- Hovering a message shows a subtle 📌 affordance on the right side (near the
  swipe-timestamp gutter). Click pins; pinned messages render in a compact
  **pinned strip at the top of the conversation** (collapsible if >2), click
  scrolls/jumps back to the message in context. Unpin from either place.
- Persistence: `pins` table in the new app db keyed by (chat guid, message guid) —
  survives restarts, no chat.db writes (that stays read-only).
- Pins render in the web viewer only for v1 (print/PDF unaffected).

## 4. Per-conversation sync summary ("what's actually here")

- When a conversation loads, show a one-line summary under the header: e.g.
  "4,812 messages · 97% with text · 62 of 71 attachments on disk", derived from a
  cheap per-chat aggregate (`getChatHealth(chatId)` — same buckets as the global
  diagnostics but scoped, plus attachment presence sampling).
- Info icon ⓘ with a tooltip/popover: if numbers look low, iCloud may not have
  synced everything to this Mac — link to the fuller guidance on the diagnostics
  page (Messages settings, keep originals downloaded, let sync finish, re-copy).
- Same stats surfaced as small badges in the conversation list rows later (v2 —
  needs to be cheap enough per-row first).

## Sequencing

1. **App db + contacts migration** (backend, no visuals) — unblocks removing
   contactsPath everywhere.
2. **Single-folder onboarding** — collapse the path flow onto the health resolver.
3. **shadcn adoption + app shell/nav** — the big visual pass.
4. **Pins + per-conversation sync summary** — features on top of the new shell.

Each step lands independently; the pipeline (Opus implement → Fable review →
merge) applies per step.

## Open questions

1. shadcn install prefers Tailwind v4; repo is on v3.4. Upgrade Tailwind as part
   of step 3, or pin shadcn to the v3-compatible path? (Lean: upgrade — v4 is
   stable and the app's Tailwind surface is small.)
2. Pinned-message strip: show full bubbles or one-line text excerpts? (Lean:
   excerpts, like iMessage's pinned UI.)
3. Does the per-chat health query stay fast on 15k-message chats with attachment
   stat sampling? Measure; cache per (chat, db mtime) if not.
4. User noted "a bunch of things still look off" — more specifics coming; leave
   room in step 3 for a punch-list.

## Out of scope

- Any change to bubble/tapback/media rendering or the print/PDF output.
- Electron shell changes (nav lives in the web app; Electron just hosts it).
- Multi-user/profile support in the app db.
