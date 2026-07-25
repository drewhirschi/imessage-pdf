import { createHash } from "node:crypto";
import { getAppDatabase } from "./connection";

export function conversationSourceId(dbPath: string): string {
  return createHash("sha256").update(dbPath).digest("hex");
}

export function listPinnedConversations(dbPath: string): string[] {
  const sourceId = conversationSourceId(dbPath);
  const rows = getAppDatabase()
    .prepare(
      `SELECT chat_identifier
       FROM pinned_conversations
       WHERE source_id = ?
       ORDER BY chat_identifier ASC`,
    )
    .all(sourceId) as Array<{ chat_identifier: string }>;
  return rows.map((row) => row.chat_identifier);
}

export function setConversationPinned(
  dbPath: string,
  chatIdentifier: string,
  pinned: boolean,
): void {
  const sourceId = conversationSourceId(dbPath);
  if (pinned) {
    getAppDatabase()
      .prepare(
        `INSERT INTO pinned_conversations
           (source_id, chat_identifier, pinned_at)
         VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(source_id, chat_identifier) DO NOTHING`,
      )
      .run(sourceId, chatIdentifier);
  } else {
    getAppDatabase()
      .prepare(
        `DELETE FROM pinned_conversations
         WHERE source_id = ? AND chat_identifier = ?`,
      )
      .run(sourceId, chatIdentifier);
  }
}
