# Plan: Fix Missing Message Text + Sync Diagnostics

**Status:** shipped (2026-07-23). Both parts implemented; verified against the real backup. See "What shipped" and "Findings" below.

## What shipped

### Part 1 — attributedBody decoding

- `lib/db/attributed-body.ts` — hand-rolled typedstream decoder, `decodeAttributedBody(buf) => string | null`. Failure tiers:
  1. **Strict structured parse**: anchor on the `NSString` class name, find the `+` (0x2B) byte-content marker, read the typedstream length varint (1-byte, `0x81`+u16 LE, `0x82`+u32 LE), slice exactly that many UTF-8 bytes. Rejects the slice if it contains a U+FFFD (means we sliced mid-codepoint / latched the wrong marker).
  2. **Lenient structured parse**: same anchor+offset but clamp the declared length to the buffer and cut at the first replacement char — recovers truncated / mis-sized blobs.
  3. **Printable-run heuristic**: no usable `NSString` anchor → return the longest run of natural-looking text between control bytes, filtered against known typedstream class-name tokens.
  - Empty backing strings (`2B 00`, attachment placeholders) decode to `null` so those bubbles stay empty.
- Wired into `getMessagesForConversation` (`lib/db/queries.ts`): when `text` is NULL/empty and `attributedBody` is present, `msg.text` is filled server-side. Because the web viewer, print route, and PDF all read through `/api/messages`, all three benefit.
- Tests: `lib/db/attributed-body.test.ts` (13 cases) with real innocuous blobs in `test/blobs.ts` covering simple/mutable/emoji/empty, the 1-byte / `0x81` / `0x82` length variants, the heuristic fallback on corrupt input, and guards. Plus `lib/db/queries.test.ts` asserts decode-through-query on a new archived chat 4.

### Part 2 — Database health diagnostics

- `getDatabaseHealth()` in `lib/db/queries.ts` — single aggregate pass: total vs displayable messages; withText / recoverableText / trueEmpty buckets (scoped to displayable messages so reactions/stickers don't inflate empties); per-year histogram of displayable messages; attachment counts, `transfer_state` and `ck_sync_state` distributions, and a **sampled** on-disk presence check (random `LIMIT`, `fs.access` in batches of 200, extrapolated to the full population) so we never serially stat 100k files.
- `GET /api/diagnostics?dbPath&attachmentsPath&sampleSize` (named to avoid colliding with onboarding's `/api/health` readiness probe).
- UI: `/diagnostics` page + `components/DiagnosticsPanel.tsx`, linked from the home page ("Database health →"). Shows text-recoverability stat tiles, the per-year bar histogram (holes = the partial-sync tell), and attachment tables.
- Tests: `lib/db/health.test.ts` against a dedicated `createHealthFixtureDb()` with fully-known composition.

## Findings

- **Decoder recovery is essentially total.** On the real backup, `SELECT COUNT(*) FROM message WHERE (text IS NULL OR text='') AND attributedBody IS NOT NULL` = **99,828** globally. For the worst conversation (chat 39): **15,348** empty-text messages before; after server-side decode via `/api/messages` only **17** remain empty — and exactly 17 of those had no attributedBody at all. Zero decode failures observed.
- **`attachment.transfer_state`** — meaning determined empirically (sampled file existence per state): `5` = downloaded / present on disk (≈99% of state-5 files exist), `0` = not downloaded / absent (0/100 sampled existed), `-1` = failed/unknown (also absent). This is a reliable "is the file actually here" signal and is surfaced with labels in the panel.
- **`ck_sync_state`** — CloudKit sync bookkeeping. On messages it is nearly constant (`1` for 462,013 rows vs `0` for 30), so it carries almost no diagnostic signal; on attachments it varies (`1` dominant, some `2`/`0`/`4`) but does not correlate with on-disk presence the way `transfer_state` does. Surfaced as a raw distribution with a caveat, not presented as a presence signal.

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

1. ~~JS library vs hand-roll for typedstream?~~ **Resolved:** hand-rolled (`lib/db/attributed-body.ts`). The needed subset is tiny and recovered 100% of recoverable messages on the real backup with zero failures.
2. ~~What do `ck_sync_state` / `transfer_state` mean?~~ **Resolved empirically** (see Findings): `transfer_state` 5/0/-1 = present/absent/failed on disk (reliable, surfaced with labels); `ck_sync_state` = CloudKit bookkeeping, near-constant on messages and not a reliable presence signal, so surfaced as a raw distribution with a caveat only.
3. **Still open:** should the viewer badge messages whose text came from the *heuristic* tier (vs strict parse) with a subtle "recovered text" marker? Not implemented — decode is currently transparent (the API returns plain `text`). On the real backup every recovered message used the strict tier, so the marker would rarely fire; deferred until a case shows heuristic recovery producing questionable text.

### Needs macOS verification

- `transfer_state` / `ck_sync_state` meanings were derived from **one** backup (macOS export). Values could differ across macOS versions; the labels in the panel are best-effort. The `ck_sync_state` = "CloudKit sync" reading in particular is inferred, not confirmed against Apple docs.
- The panel's on-disk check assumes the `/api/attachments/[id]` path-stripping convention (`~/Library/Messages/Attachments/` prefix). Verified against this backup's filename shape; other exports may store paths differently.

## Out of scope

- Triggering or automating iCloud sync — we're read-only observers.
- Editing/repairing the DB.
