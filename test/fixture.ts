import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hex, BLOB_SIMPLE, BLOB_MUTABLE, BLOB_EMPTY } from "./blobs";

/**
 * Builds a temporary SQLite database with the subset of the iMessage
 * `chat.db` schema that our queries touch, populated with deterministic
 * fixture data. Returns the on-disk path plus a cleanup function.
 *
 * The dates use realistic iMessage nanosecond magnitudes (ns since
 * 2001-01-01) so tests also exercise the BigInt -> Number normalization
 * in lib/db/connection.ts.
 */

// A few reference iMessage-nanosecond timestamps (ns since 2001-01-01).
// These exceed Number.MAX_SAFE_INTEGER, matching real data.
export const TS = {
  t1: 700000000000000000, // earliest
  t2: 700000600000000000, // +10 min
  t3: 700001800000000000, // +30 min from t1
  t4: 700100000000000000, // much later
};

const UUID_A = "11111111-1111-1111-1111-111111111111";
const UUID_B = "22222222-2222-2222-2222-222222222222";
const UUID_C = "33333333-3333-3333-3333-333333333333";

export interface Fixture {
  dbPath: string;
  cleanup: () => void;
}

/**
 * Identifiers for the archived chat 4 that carries attributedBody messages,
 * full 2000-2005 reaction coverage, and a sticker-band (2007) message.
 */
export const ATTR_BODY_CHAT = {
  chatId: 4,
  anchorGuid: "abcdabcd-0000-0000-0000-000000000050",
  /** ROWIDs of the messages whose text is recovered from attributedBody. */
  recoveredRowIds: { simple: 51, mutable: 52, emptyBlob: 53 },
  stickerRowId: 70,
} as const;

export function createFixtureDb(): Fixture {
  const dir = mkdtempSync(join(tmpdir(), "imessage-fixture-"));
  const dbPath = join(dir, "chat.db");
  const db = new DatabaseSync(dbPath);

  db.exec(`
    CREATE TABLE chat (
      ROWID INTEGER PRIMARY KEY,
      chat_identifier TEXT,
      display_name TEXT,
      group_id TEXT,
      is_archived INTEGER DEFAULT 0
    );
    CREATE TABLE handle (
      ROWID INTEGER PRIMARY KEY,
      id TEXT,
      service TEXT
    );
    CREATE TABLE message (
      ROWID INTEGER PRIMARY KEY,
      guid TEXT,
      text TEXT,
      attributedBody BLOB,
      handle_id INTEGER,
      is_from_me INTEGER DEFAULT 0,
      date INTEGER,
      associated_message_type INTEGER,
      associated_message_guid TEXT,
      service TEXT
    );
    CREATE TABLE attachment (
      ROWID INTEGER PRIMARY KEY,
      filename TEXT,
      mime_type TEXT,
      transfer_name TEXT
    );
    CREATE TABLE chat_message_join (
      chat_id INTEGER,
      message_id INTEGER
    );
    CREATE TABLE chat_handle_join (
      chat_id INTEGER,
      handle_id INTEGER
    );
    CREATE TABLE message_attachment_join (
      message_id INTEGER,
      attachment_id INTEGER
    );
  `);

  // Handles. Handle 3 is a third participant so the group chat exercises
  // multi-sender attribution (review flagged that 2 handles was too few).
  db.exec(`
    INSERT INTO handle (ROWID, id, service) VALUES
      (1, '+15551112222', 'iMessage'),
      (2, '+15553334444', 'iMessage'),
      (3, '+15555556666', 'iMessage');
  `);

  // Chats: chat 1 is a 1:1 (handle 1), chat 2 is a group (handles 1, 2 & 3),
  // chat 3 is archived and must be excluded.
  db.exec(`
    INSERT INTO chat (ROWID, chat_identifier, display_name, group_id, is_archived) VALUES
      (1, '+15551112222', '', NULL, 0),
      (2, 'chat-group', 'Group Chat', 'grp1', 0),
      (3, '+15559998888', '', NULL, 1);
  `);

  db.exec(`
    INSERT INTO chat_handle_join (chat_id, handle_id) VALUES
      (1, 1),
      (2, 1),
      (2, 2),
      (2, 3),
      (3, 1);
  `);

  // Regular messages in chat 1 (associated_message_type NULL => normal text).
  const insMsg = db.prepare(
    `INSERT INTO message
       (ROWID, guid, text, handle_id, is_from_me, date, associated_message_type, associated_message_guid, service)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  // chat 1 messages
  insMsg.run(10, UUID_A, "Hey there", 1, 0, TS.t1, null, null, "iMessage");
  insMsg.run(11, UUID_B, "Reply from me", null, 1, TS.t2, null, null, "iMessage");
  insMsg.run(12, UUID_C, "Later message", 1, 0, TS.t4, null, null, "iMessage");
  // chat 2 (group) messages from three distinct senders: handle 2, handle 3,
  // and me. Exercises multi-sender attribution.
  const GROUP_MSG_20 = "44444444-4444-4444-4444-444444444444";
  insMsg.run(20, GROUP_MSG_20, "Group hello", 2, 0, TS.t3, null, null, "iMessage");
  insMsg.run(21, "aaaa1111-4444-4444-4444-444444444444", "Hi from three", 3, 0, TS.t3, null, null, "iMessage");
  insMsg.run(22, "bbbb2222-4444-4444-4444-444444444444", "Reply in the group", null, 1, TS.t4, null, null, "iMessage");

  // A laugh reaction (2003) in the group from handle 3, targeting message 20.
  insMsg.run(
    40,
    "cccc3333-4444-4444-4444-444444444444",
    null,
    3,
    0,
    TS.t4,
    2003,
    `p:0/${GROUP_MSG_20}`,
    "iMessage"
  );

  // A reaction (heart, 2000) targeting message 10 (guid UUID_A), prefixed guid.
  insMsg.run(
    30,
    "55555555-5555-5555-5555-555555555555",
    null,
    2,
    0,
    TS.t2,
    2000,
    `p:0/${UUID_A}`,
    "iMessage"
  );
  // A thumbs_up reaction (2001) targeting message 11 (guid UUID_B).
  insMsg.run(
    31,
    "66666666-6666-6666-6666-666666666666",
    null,
    null,
    1,
    TS.t3,
    2001,
    `p:0/${UUID_B}`,
    "iMessage"
  );

  db.exec(`
    INSERT INTO chat_message_join (chat_id, message_id) VALUES
      (1, 10), (1, 11), (1, 12), (1, 30), (1, 31),
      (2, 20), (2, 21), (2, 22), (2, 40);
  `);

  // --- Chat 4: attributedBody + full reaction-code coverage + sticker band ---
  // Archived so getAllConversations still returns exactly chats 1 & 2, but the
  // per-conversation queries and the attributedBody decoder can be exercised
  // against it directly. ROWIDs 50+ avoid the onboarding fixture's 10-40 range.
  db.exec(
    "INSERT INTO chat (ROWID, chat_identifier, display_name, group_id, is_archived) VALUES (4, '+15557778888', '', NULL, 1);"
  );
  db.exec("INSERT INTO chat_handle_join (chat_id, handle_id) VALUES (4, 1);");

  const ANCHOR_GUID = ATTR_BODY_CHAT.anchorGuid;
  // Insert including attributedBody. A dedicated statement keeps the 9-arg
  // insMsg calls above untouched.
  const insMsgBody = db.prepare(
    `INSERT INTO message
       (ROWID, guid, text, attributedBody, handle_id, is_from_me, date, associated_message_type, associated_message_guid, service)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  // Anchor message with real text (reaction target).
  insMsgBody.run(50, ANCHOR_GUID, "Anchor message", null, 1, 0, TS.t1, null, null, "iMessage");
  // NULL text + attributedBody -> recovered "What are you up to? "
  insMsgBody.run(51, "abcdabcd-0000-0000-0000-000000000051", null, hex(BLOB_SIMPLE), 1, 0, TS.t2, null, null, "iMessage");
  // Empty text + attributedBody -> recovered "Did you just get there? "
  insMsgBody.run(52, "abcdabcd-0000-0000-0000-000000000052", "", hex(BLOB_MUTABLE), 1, 0, TS.t3, null, null, "iMessage");
  // attributedBody present but decodes empty (attachment placeholder) -> stays empty
  insMsgBody.run(53, "abcdabcd-0000-0000-0000-000000000053", null, hex(BLOB_EMPTY), 1, 0, TS.t4, null, null, "iMessage");

  // All six reaction codes 2000-2005 targeting the anchor message.
  let reactionRowId = 60;
  for (let type = 2000; type <= 2005; type++) {
    insMsgBody.run(
      reactionRowId++,
      `abcdabcd-0000-0000-0000-0000000000${type}`,
      null,
      null,
      1,
      0,
      TS.t2,
      type,
      `p:0/${ANCHOR_GUID}`,
      "iMessage"
    );
  }
  // A sticker/edit-band message (2006-3005) that must be excluded everywhere.
  insMsgBody.run(70, "abcdabcd-0000-0000-0000-000000000070", "sticker-should-be-hidden", null, 1, 0, TS.t3, 2007, `p:0/${ANCHOR_GUID}`, "iMessage");

  db.exec(`
    INSERT INTO chat_message_join (chat_id, message_id) VALUES
      (4, 50), (4, 51), (4, 52), (4, 53),
      (4, 60), (4, 61), (4, 62), (4, 63), (4, 64), (4, 65),
      (4, 70);
  `);

  // Attachment on message 12.
  db.exec(`
    INSERT INTO attachment (ROWID, filename, mime_type, transfer_name) VALUES
      (100, '~/Library/Messages/Attachments/ab/cd/photo.HEIC', 'image/heic', 'photo.HEIC');
    INSERT INTO message_attachment_join (message_id, attachment_id) VALUES
      (12, 100);
  `);

  db.close();

  return {
    dbPath,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

export interface HealthFixture {
  dbPath: string;
  attachmentsPath: string;
  cleanup: () => void;
}

// iMessage nanoseconds for Jan 1 of a given year.
function imessageTsForYear(year: number): number {
  const unixSec = Date.UTC(year, 0, 1) / 1000;
  return (unixSec - 978307200) * 1_000_000_000;
}

/**
 * A dedicated fixture with fully-known composition for exercising
 * `getDatabaseHealth`: 2 plain-text, 3 attributedBody-recoverable, 1 true-empty
 * displayable messages (spread across 2020-2022), plus a reaction and a sticker
 * that must be excluded from the displayable buckets; and three attachments with
 * varied transfer_state, one of which is present on disk.
 */
export function createHealthFixtureDb(): HealthFixture {
  const dir = mkdtempSync(join(tmpdir(), "imessage-health-"));
  const dbPath = join(dir, "chat.db");
  const attachmentsPath = join(dir, "Attachments");
  mkdirSync(attachmentsPath, { recursive: true });

  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE chat (ROWID INTEGER PRIMARY KEY, chat_identifier TEXT,
      display_name TEXT, group_id TEXT, is_archived INTEGER DEFAULT 0);
    CREATE TABLE message (
      ROWID INTEGER PRIMARY KEY, guid TEXT, text TEXT, attributedBody BLOB,
      handle_id INTEGER, is_from_me INTEGER DEFAULT 0, date INTEGER,
      associated_message_type INTEGER, associated_message_guid TEXT,
      ck_sync_state INTEGER DEFAULT 1
    );
    CREATE TABLE attachment (
      ROWID INTEGER PRIMARY KEY, filename TEXT, mime_type TEXT,
      transfer_state INTEGER DEFAULT 5, ck_sync_state INTEGER DEFAULT 1
    );
    CREATE TABLE chat_message_join (chat_id INTEGER, message_id INTEGER);
  `);
  db.exec("INSERT INTO chat (ROWID, chat_identifier, is_archived) VALUES (1, '+15550000000', 0);");

  const ins = db.prepare(
    `INSERT INTO message (ROWID, guid, text, attributedBody, date, associated_message_type)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const y2020 = imessageTsForYear(2020);
  const y2021 = imessageTsForYear(2021);
  const y2022 = imessageTsForYear(2022);
  // withText x2 (2020)
  ins.run(1, "h1", "Hello", null, y2020, null);
  ins.run(2, "h2", "World", null, y2020, null);
  // recoverable x3 (2021)
  ins.run(3, "h3", null, hex(BLOB_SIMPLE), y2021, null);
  ins.run(4, "h4", "", hex(BLOB_MUTABLE), y2021, null);
  ins.run(5, "h5", null, hex(BLOB_EMPTY), y2021, null);
  // trueEmpty x1 (2022)
  ins.run(6, "h6", null, null, y2022, null);
  // reaction + sticker (excluded from displayable buckets)
  ins.run(7, "h7", null, null, y2020, 2000);
  ins.run(8, "h8", "sticker", null, y2021, 2007);

  db.exec(`
    INSERT INTO chat_message_join (chat_id, message_id) VALUES
      (1,1),(1,2),(1,3),(1,4),(1,5),(1,6),(1,7),(1,8);
  `);

  // Attachments: one present on disk, one missing, one with no filename.
  mkdirSync(join(attachmentsPath, "aa", "bb"), { recursive: true });
  writeFileSync(join(attachmentsPath, "aa", "bb", "present.jpg"), "data");
  db.exec(`
    INSERT INTO attachment (ROWID, filename, mime_type, transfer_state, ck_sync_state) VALUES
      (1, '~/Library/Messages/Attachments/aa/bb/present.jpg', 'image/jpeg', 5, 1),
      (2, '~/Library/Messages/Attachments/cc/dd/missing.jpg', 'image/jpeg', 0, 2),
      (3, NULL, NULL, 5, 1);
  `);

  db.close();
  return {
    dbPath,
    attachmentsPath,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}
