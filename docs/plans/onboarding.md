# Plan: First-Run Onboarding — Permissions, Path Auto-Detection, Contacts

**Status:** implemented (2026-07-23). All four parts shipped. Verified with `pnpm test`
(51 tests green), `pnpm build`, `pnpm lint` (no new findings), and live checks against the
real backup at `/home/drew/work/hannah-imessage/`. macOS-only pieces (the FDA deep link,
`Quit & Reopen`, and the "found + readable default → straight to conversations" happy path)
are built and degrade gracefully but could only be exercised on macOS. See the
"What shipped" section below.

## What shipped

- **Health endpoint** `GET /api/health?dbPath&attachmentsPath`. With no params it probes the
  macOS default (`~/Library/Messages/chat.db` + `Attachments`); with params it probes the given
  paths and transparently resolves the *backup-folder* shape (a directory containing
  `chat.db` + `Attachments/`). Returns per-path `{status, path, detail, code?}` plus an
  `overall` status and the `resolved` paths the client should save. Probe logic lives in
  `lib/health/probe.ts` (framework-free, unit-tested) and `lib/health/detect.ts`
  (default + backup-folder resolution). Error mapping: `ENOENT → not_found`;
  `EACCES/EPERM/SQLITE_CANTOPEN → permission_denied`; readable+openable → `ok`.
- **First-load flow** (`app/page.tsx` state machine: loading → ready | permission | manual).
  No saved paths → probe defaults → `ok` saves silently and shows a "Using database at … (change)"
  banner above the conversation list; `permission_denied` → the Full Disk Access screen;
  `not_found` → the manual `PathConfiguration` picker, prefilled with the default paths and a
  hint about what we looked for. The FDA screen re-runs the health check on window focus so it
  clears itself once access is granted.
- **Full Disk Access screen** (`components/FullDiskAccessScreen.tsx`): read-only/local
  reassurance, the correct grantee (Electron app vs terminal, detected via a `window.electron`
  bridge), the `x-apple.systempreferences:…Privacy_AllFiles` deep link (via the Electron bridge's
  `openExternal`, else a best-effort browser navigation with written fallback instructions),
  an Electron-only "Quit & Reopen", plus Retry and manual-entry escapes.
- **Click-to-name** is wired on every raw-handle surface: group sender labels above bubbles
  (`MessageBubble` — already present, left minimal), sidebar participant chips (pencil now always
  visible for unresolved handles, hover-only once named), and `ReactionDetailsModal` sender rows.
- **Contacts polish**: nav link to `/contacts` from the home page and the conversation sidebar;
  Export (JSON download) / Import (JSON upload with a confirm-before-replace via `PUT`) on
  `/contacts`; and a "N unnamed numbers in this chat — name them" banner in the conversation
  sidebar.
- **Group-chat pass**: `test/fixture.ts` group chat now has 3 handles and 3 distinct senders
  plus a group reaction sent by a non-author; added query tests for multi-sender attribution
  and reaction-sender grouping. Verified a real 3-person group in the viewer and the print route
  (multi-sender labels, participant list, unnamed-group comma-joined title, unnamed banner, and
  click-to-name persisting through the PATCH flow into a throwaway contacts file).

Covers three user-facing asks that are really one flow: (1) tell the user clearly when macOS permissions are missing and how to grant them, (2) auto-detect `chat.db` and the `Attachments` folder instead of making the user type paths, (3) make sure adding contact names in-app is smooth. Pairs with [electron-app.md](electron-app.md) — this flow is what a non-developer sees the first time they open the packaged app.

## 1. Permission detection + guidance (Full Disk Access)

### Problem

Reading `~/Library/Messages/chat.db` requires **Full Disk Access** on macOS. Without it, the open fails with `EPERM`/`SQLITE_CANTOPEN` and today the user just sees a broken conversation list with no explanation.

### Approach

- New endpoint `GET /api/health?dbPath&attachmentsPath` that attempts to open the DB read-only and stat the attachments dir, and returns a structured result: `ok | not_found | permission_denied` per path.
- On `permission_denied`, show a dedicated full-screen explainer (not a toast):
  - What Full Disk Access is and why we need it (read-only, everything stays local).
  - Which app to grant it to: in Electron, the app itself; in dev, the terminal app running the server. Detect which mode we're in.
  - A button that deep-links straight to the right pane: `x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles` (opened via Electron `shell.openExternal`; in browser mode, show the System Settings path as text).
  - Clear instruction that macOS requires the app to be **restarted** after granting, with a "Quit & Reopen" button in Electron (relaunch via `app.relaunch()` — verify FDA actually needs the relaunch, or whether re-trying the open suffices).
- Re-run the health check on window focus so the screen clears itself as soon as access is granted.

## 2. Auto-detect chat.db and Attachments

### Problem

The path-configuration screen is the first thing users see, and most users' answer is always the same: `~/Library/Messages/`.

### Approach

- On first load (no localStorage paths), probe the defaults server-side: `~/Library/Messages/chat.db` and `~/Library/Messages/Attachments`. Also probe common backup layouts: a folder containing both `chat.db` and `Attachments/` side by side (the working-copy shape).
- If found and readable → save silently and go straight to the conversation list. Show a small "Using Messages database at …  (change)" affordance instead of the config form.
- If found but unreadable → the permission flow above.
- If not found (e.g. running against a copied backup) → the existing manual path picker, prefilled with the home directory, with a hint about what we looked for.
- `PathConfiguration` stays as the "custom path" escape hatch, reachable from a settings link.

## 3. In-app contact adding

Mostly shipped (see [completed/contacts.md](completed/contacts.md)): inline rename on any handle, full editor at `/contacts`, vCard "save to contacts" shortcut. Remaining gaps to close for non-developer users:

- **Discoverability**: nothing points a new user at `/contacts`. Add it to the main nav / conversation-list header.
- **Contacts book location**: `~/.imessage-pdf/contacts.json` is invisible to normal users. Fine as storage, but the UI should never mention the path; add an export/import button (JSON download/upload) so people can back up or share a contacts book.
- **Click-to-name in the conversation**: any raw handle shown in a chat (sender label above a group-chat bubble, participant chip in the sidebar/header, reaction sender list) is clickable and opens the inline name editor right there — name the number without leaving the conversation. `InlineNameEditor` exists; the work is wiring it into every surface that currently renders a raw handle read-only, and making the affordance visible (subtle underline/pencil on hover for unresolved handles).
- **Group-chat prompt**: when a conversation shows ≥N unresolved handles, show a one-line banner "3 unnamed numbers in this chat — name them" linking to the inline editors.
- Optional (v2): import names from a macOS AddressBook db or exported `.vcf` set in bulk.

## 4. Group-chat correctness pass

Group chats are the stress case for most of the app and need explicit test coverage, not just 1:1 chats:

- Fixture db for tests must include a group chat (3+ handles via `chat_handle_join`) so queries, sender attribution, and reaction grouping are tested with multiple senders.
- Verify in the viewer against the real backup: sender labels appear above bubbles from different senders, colors/ordering stable, reactions attribute to the right sender, participant list correct in the sidebar, conversation-list title for unnamed groups (comma-joined resolved names) behaves.
- Same checks on the print route / PDF.

## Open questions

1. Is a health/permission check on every window focus too chatty, or fine since it's one local `open()`?
   **Resolved:** we only re-probe on focus while the FDA screen is showing (not on every focus of
   a working session), so it's one cheap local `open()` exactly when it's useful. If we later want
   it everywhere it's still cheap, but scoping it to the permission screen avoided the chattiness
   concern entirely.
2. For pure-browser dev mode, can we reliably tell *which* terminal app needs FDA? (Probably not — generic instructions are fine there; the Electron path is the one that must be polished.)
   **Resolved as expected:** in browser mode we show generic "your terminal app (Terminal/iTerm)"
   guidance; the Electron branch (detected via a `window.electron` preload bridge) names the app
   itself and offers the deep link + relaunch.

## Follow-ups / notes

- The "backup folder" resolution keys off a directory literally containing `chat.db`. If a user
  points at a parent that only *contains* such a folder we do not recurse — kept intentionally
  shallow to avoid scanning large trees.
- The Electron bridge (`window.electron.openExternal` / `relaunch`) is referenced but the preload
  script itself belongs to the electron-app plan; until that ships the controls simply hide in
  browser mode.
- Overall status keys primarily off the database: `db ok` + `attachments not_found` still lets you
  read text, so it does not force the permission screen (attachments-only permission problems do,
  since those are the same FDA gate on macOS).

## Out of scope

- Windows/Linux path conventions.
- iCloud sync remediation (see [missing-text-and-sync-stats.md](missing-text-and-sync-stats.md)).
