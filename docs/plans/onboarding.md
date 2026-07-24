# Plan: First-Run Onboarding — Permissions, Path Auto-Detection, Contacts

**Status:** draft — needs review

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
2. For pure-browser dev mode, can we reliably tell *which* terminal app needs FDA? (Probably not — generic instructions are fine there; the Electron path is the one that must be polished.)

## Out of scope

- Windows/Linux path conventions.
- iCloud sync remediation (see [missing-text-and-sync-stats.md](missing-text-and-sync-stats.md)).
