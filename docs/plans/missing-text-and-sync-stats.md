# Plan: Fix Missing Message Text + Sync Diagnostics

**Status:** draft — needs review

## Summary

On a real user call (2026-07-22), many messages rendered with empty bubbles. The suspected cause was iCloud not syncing everything — but the far more likely cause is in our code: since macOS Ventura / iOS 16, Messages frequently stores the body **only** in `message.attributedBody` (a serialized typedstream blob) and leaves `message.text` NULL. We define `attributedBody` in `lib/db/types.ts` but never SELECT or decode it. Fix that first, then add a diagnostics view so genuinely-missing data (real iCloud gaps) is quantified instead of mysterious.

## Part 1: Decode `attributedBody`

### Approach

- Add `attributedBody` to the message SELECT in `lib/db/queries.ts`.
- When `text` is NULL/empty and `attributedBody` is present, decode it. The blob is Apple **typedstream** (`NSAttributedString` archive), not a plist. Two-tier decoder in `lib/db/attributed-body.ts`:
  1. Proper minimal typedstream walk: find the `NSString`/`NSMutableString` payload (the format is well documented; `imessage-exporter` has a reference implementation). Handles the length-prefix variants (1-byte, `0x81` + u16, `0x82` + u32).
  2. Fallback heuristic if parsing fails: scan the blob for the string segment after the `NSString` marker and strip control bytes. Ugly but recovers text rather than showing an empty bubble.
- Decode server-side so the API and PDF both benefit; the client never sees blobs.
- Also check: messages whose text is the object-replacement char U+FFFC (attachment placeholder) — already handled? Verify while in there.

### Validation

Against the working backup at `/home/drew/work/hannah-imessage/chat.db`:
`SELECT COUNT(*) FROM message WHERE (text IS NULL OR text = '') AND attributedBody IS NOT NULL` — before/after counts of empty bubbles in the viewer should drop to ~the number of genuinely body-less messages.

## Part 2: Sync / completeness diagnostics

### Problem

When something *is* missing (Messages in iCloud with "Optimize Mac Storage", partial sync, attachments offloaded), users have no way to see the shape of the gap and blame the tool.

### Approach

A "Database health" panel (linked from the home page, and per-conversation from the viewer):

- **Message stats**: total messages; messages with recoverable text (text or attributedBody); messages with neither (true empties); counts per year — sudden gaps in the histogram are the visual tell for partial sync.
- **Attachment stats**: attachments referenced in the DB vs. actually present on disk at the configured attachments path; total bytes missing. `attachment.transfer_state` / `ck_sync_state` columns may distinguish "never downloaded from iCloud" — investigate what the schema exposes and surface it if reliable.
- **Guidance panel**: if attachments are missing or year histogram has holes, show the likely causes and the fix: on the Mac, Messages → Settings → iMessage → keep "Download Attachments" / disable storage optimization, open Messages and let it finish syncing (status shown at the bottom of the conversation list in Messages.app), then re-copy the backup.
- Cheap to compute: all single aggregate queries; run on demand, not per page load.

## Open questions

1. Is there a JS library worth using for typedstream, or hand-roll the minimal walk? (Lean hand-roll — the subset we need is small and dependencies here have been a liability.)
2. What do `ck_sync_state` / `transfer_state` actually mean across macOS versions? Needs empirical checking against the real backup before we present them as facts in the UI.
3. Should the per-conversation viewer badge messages whose text came from the heuristic fallback (subtle "recovered text" marker) so odd rendering is explainable?

## Out of scope

- Triggering or automating iCloud sync — we're read-only observers.
- Editing/repairing the DB.
