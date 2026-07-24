import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
