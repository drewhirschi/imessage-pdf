import { getDatabase } from "./connection";
import { decodeAttributedBody } from "./attributed-body";
import type {
  Chat,
  Message,
  Handle,
  Attachment,
  ConversationSummary,
  MessageWithAttachments,
  Reaction,
  ReactionType,
  DatabaseHealth,
} from "./types";

export function getAllConversations(
  phoneNumber?: string,
  handleIds?: string[],
  limit?: number,
  offset?: number
): { conversations: ConversationSummary[]; total: number } {
  const db = getDatabase();

  let query = `
    SELECT 
      c.ROWID as chat_id,
      c.chat_identifier,
      c.display_name,
      c.group_id,
      COUNT(DISTINCT cmj.message_id) as message_count,
      MAX(m.date) as last_message_date,
      MAX(CASE WHEN m.text IS NOT NULL AND m.text != '' THEN m.text ELSE NULL END) as last_message
    FROM chat c
    LEFT JOIN chat_message_join cmj ON c.ROWID = cmj.chat_id
    LEFT JOIN message m ON cmj.message_id = m.ROWID 
      AND (m.associated_message_type IS NULL OR m.associated_message_type < 2000 OR m.associated_message_type > 3005)
    WHERE c.is_archived = 0
  `;

  const params: (string | number)[] = [];

  const filterClauses: string[] = [];
  const filterParams: (string | number)[] = [];
  if (phoneNumber) {
    filterClauses.push("h.id LIKE ?");
    filterParams.push(`%${phoneNumber}%`);
  }
  if (handleIds && handleIds.length > 0) {
    const placeholders = handleIds.map(() => "?").join(",");
    filterClauses.push(`h.id IN (${placeholders})`);
    filterParams.push(...handleIds);
  }
  if (filterClauses.length > 0) {
    query += `
      AND EXISTS (
        SELECT 1
        FROM chat_handle_join chj
        JOIN handle h ON chj.handle_id = h.ROWID
        WHERE chj.chat_id = c.ROWID
        AND (${filterClauses.join(" OR ")})
      )
    `;
    params.push(...filterParams);
  }

  query += `
    GROUP BY c.ROWID, c.chat_identifier, c.display_name, c.group_id
    HAVING message_count > 0
    ORDER BY last_message_date DESC
  `;

  // Get total count before applying pagination
  const countQuery = `
    SELECT COUNT(*) as total FROM (${query})
  `;
  const countResult = db.prepare(countQuery).get(...params) as {
    total: number;
  };
  const total = countResult.total;

  // Add pagination if provided
  if (limit !== undefined && offset !== undefined) {
    query += ` LIMIT ? OFFSET ?`;
    params.push(limit, offset);
  }

  const conversations = db.prepare(query).all(...params) as Array<{
    chat_id: number;
    chat_identifier: string;
    display_name: string | null;
    group_id: string | null;
    message_count: number;
    last_message_date: number | null;
    last_message: string | null;
  }>;

  const conversationsWithParticipants = conversations.map((conv) => {
    // Get participants for this conversation
    const participantsQuery = `
      SELECT h.id
      FROM chat_handle_join chj
      JOIN handle h ON chj.handle_id = h.ROWID
      WHERE chj.chat_id = ?
    `;
    const participants = db.prepare(participantsQuery).all(conv.chat_id) as {
      id: string;
    }[];

    const participantIds = participants.map((p) => p.id);
    return {
      chat_id: conv.chat_id,
      chat_identifier: conv.chat_identifier,
      display_name: conv.display_name,
      participants: participantIds,
      last_message: conv.last_message,
      last_message_date: conv.last_message_date,
      message_count: conv.message_count,
      is_group: participantIds.length > 1,
    };
  });

  return {
    conversations: conversationsWithParticipants,
    total,
  };
}

export function getMessagesForConversation(
  chatId: number,
  startDate?: number,
  endDate?: number,
  limit?: number,
  offset?: number
): { messages: MessageWithAttachments[]; total: number } {
  const db = getDatabase();

  let dateFilter = "";
  const params: (number | string)[] = [chatId];

  if (startDate) {
    dateFilter += " AND m.date >= ?";
    params.push(startDate);
  }

  if (endDate) {
    dateFilter += " AND m.date <= ?";
    params.push(endDate);
  }

  const query = `
    SELECT 
      m.*,
      h.id as handle_id,
      h.service as handle_service
    FROM message m
    JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
    LEFT JOIN handle h ON m.handle_id = h.ROWID
    WHERE cmj.chat_id = ? 
      AND (m.associated_message_type IS NULL OR m.associated_message_type < 2000 OR m.associated_message_type > 3005)
      ${dateFilter}
    ORDER BY m.date ASC
  `;

  // Get total count before applying pagination
  const countQuery = `
    SELECT COUNT(*) as total FROM (${query})
  `;
  const countResult = db.prepare(countQuery).get(...params) as {
    total: number;
  };
  const total = countResult.total;

  // Add pagination if provided
  let paginatedQuery = query;
  const paginatedParams = [...params];
  if (limit !== undefined && offset !== undefined) {
    paginatedQuery += ` LIMIT ? OFFSET ?`;
    paginatedParams.push(limit, offset);
  }

  const messages = db.prepare(paginatedQuery).all(...paginatedParams) as Array<
    Message & {
      handle_id: string | null;
      handle_service: string | null;
    }
  >;

  // OPTIMIZATION: Fetch ALL reactions for this conversation in one query
  // Build a map of message GUID -> reactions
  const reactionsQuery = `
    SELECT 
      m.ROWID,
      m.associated_message_guid,
      m.associated_message_type,
      m.handle_id,
      m.is_from_me,
      m.date,
      h.id as sender_id
    FROM message m
    JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
    LEFT JOIN handle h ON m.handle_id = h.ROWID
    WHERE cmj.chat_id = ?
      AND m.associated_message_type BETWEEN 2000 AND 2005
  `;

  const allReactions = db.prepare(reactionsQuery).all(chatId) as Array<{
    ROWID: number;
    associated_message_guid: string;
    associated_message_type: number;
    handle_id: number | null;
    is_from_me: number;
    date: number;
    sender_id: string | null;
  }>;

  // Build a map: message GUID -> array of reactions
  const reactionsMap = new Map<string, Reaction[]>();

  for (const reactionRow of allReactions) {
    const reaction: Reaction = {
      ROWID: reactionRow.ROWID,
      associated_message_type: reactionRow.associated_message_type,
      handle_id: reactionRow.handle_id,
      is_from_me: reactionRow.is_from_me,
      date: reactionRow.date,
      sender_id: reactionRow.sender_id,
      reaction_type: getReactionTypeFromCode(
        reactionRow.associated_message_type
      ),
    };

    // The associated_message_guid may have a prefix like "p:0/" or "bp:"
    // Extract the actual GUID from it
    const guidMatch =
      reactionRow.associated_message_guid.match(/([A-F0-9-]{36})/i);
    if (guidMatch) {
      const cleanGuid = guidMatch[1];
      if (!reactionsMap.has(cleanGuid)) {
        reactionsMap.set(cleanGuid, []);
      }
      reactionsMap.get(cleanGuid)!.push(reaction);
    }
  }

  const messagesWithAttachments = messages.map((msg) => {
    // Recover text for messages whose plain `text` column is empty but whose
    // `attributedBody` holds the archived NSAttributedString. This runs
    // server-side so the web viewer, print route, and PDF all benefit.
    if ((msg.text === null || msg.text === "") && msg.attributedBody != null) {
      const recovered = decodeAttributedBody(msg.attributedBody as Buffer);
      if (recovered) {
        msg.text = recovered;
      }
    }

    // Get attachments for this message
    const attachmentsQuery = `
      SELECT a.*
      FROM attachment a
      JOIN message_attachment_join maj ON a.ROWID = maj.attachment_id
      WHERE maj.message_id = ?
    `;
    const attachments = db
      .prepare(attachmentsQuery)
      .all(msg.ROWID) as Attachment[];

    // Get handle info
    const handle = msg.handle_id
      ? ({
          ROWID: msg.handle_id,
          id: msg.handle_id,
          country: null,
          service: msg.handle_service,
          uncanonicalized_id: null,
          person_centric_id: null,
        } as Handle)
      : null;

    // Get reactions from the pre-built map (instant lookup!)
    const reactions = reactionsMap.get((msg as Message).guid) || [];

    return {
      message: msg as Message,
      handle,
      attachments,
      reactions,
    };
  });

  return {
    messages: messagesWithAttachments,
    total,
  };
}

export function getConversationById(chatId: number): Chat | null {
  const db = getDatabase();

  const query = "SELECT * FROM chat WHERE ROWID = ?";
  const result = db.prepare(query).get(chatId) as Chat | undefined;

  return result || null;
}

export function getConversationDetails(chatId: number): {
  chat_id: number;
  display_name: string | null;
  participants: string[];
  is_group: boolean;
} | null {
  const db = getDatabase();

  const chatQuery = "SELECT * FROM chat WHERE ROWID = ?";
  const chat = db.prepare(chatQuery).get(chatId) as Chat | undefined;

  if (!chat) {
    return null;
  }

  // Get participants
  const participantsQuery = `
    SELECT h.id
    FROM chat_handle_join chj
    JOIN handle h ON chj.handle_id = h.ROWID
    WHERE chj.chat_id = ?
  `;
  const participants = db.prepare(participantsQuery).all(chatId) as {
    id: string;
  }[];

  const participantIds = participants.map((p) => p.id);
  return {
    chat_id: chatId,
    display_name: chat.display_name,
    participants: participantIds,
    is_group: participantIds.length > 1,
  };
}

export function getAttachmentPath(attachmentId: number): string | null {
  const db = getDatabase();

  const query = "SELECT filename FROM attachment WHERE ROWID = ?";
  const result = db.prepare(query).get(attachmentId) as
    | { filename: string }
    | undefined;

  return result?.filename || null;
}

// iMessage epoch (2001-01-01 UTC) offset from the Unix epoch, in seconds.
const IMESSAGE_EPOCH_OFFSET_SECONDS = 978307200;

/** Strip the macOS Messages prefix so a stored filename can be joined against a
 * user-supplied attachments directory. Mirrors /api/attachments/[id]. */
function toRelativeAttachmentPath(filename: string): string {
  if (filename.startsWith("~/Library/Messages/Attachments/")) {
    return filename.slice("~/Library/Messages/Attachments/".length);
  }
  if (filename.startsWith("/Library/Messages/Attachments/")) {
    return filename.slice("/Library/Messages/Attachments/".length);
  }
  if (filename.startsWith("~/Library/Messages/")) {
    return filename.slice("~/Library/Messages/".length);
  }
  if (filename.startsWith("/Library/Messages/")) {
    return filename.slice("/Library/Messages/".length);
  }
  return filename;
}

/**
 * Aggregate database-health diagnostics for the whole DB. The attachment
 * on-disk check is sampled (random subset, stat'd in batches) so it stays cheap
 * even on backups with 100k+ attachments.
 */
export async function getDatabaseHealth(options?: {
  attachmentsPath?: string;
  sampleSize?: number;
}): Promise<DatabaseHealth> {
  const db = getDatabase();
  const sampleSize = options?.sampleSize ?? 500;

  const displayableFilter =
    "(associated_message_type IS NULL OR associated_message_type < 2000 OR associated_message_type > 3005)";

  const totalMessages = (
    db.prepare("SELECT COUNT(*) as c FROM message").get() as { c: number }
  ).c;

  const displayableMessages = (
    db
      .prepare(`SELECT COUNT(*) as c FROM message WHERE ${displayableFilter}`)
      .get() as { c: number }
  ).c;

  // Text recoverability buckets, scoped to displayable messages so reactions and
  // stickers (which legitimately carry no text) don't inflate the empty counts.
  const withText = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM message WHERE ${displayableFilter} AND text IS NOT NULL AND text != ''`
      )
      .get() as { c: number }
  ).c;
  const recoverableText = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM message WHERE ${displayableFilter} AND (text IS NULL OR text = '') AND attributedBody IS NOT NULL`
      )
      .get() as { c: number }
  ).c;
  const trueEmpty = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM message WHERE ${displayableFilter} AND (text IS NULL OR text = '') AND attributedBody IS NULL`
      )
      .get() as { c: number }
  ).c;

  // Per-year histogram of displayable messages.
  const yearRows = db
    .prepare(
      `SELECT CAST(strftime('%Y', (date / 1000000000) + ${IMESSAGE_EPOCH_OFFSET_SECONDS}, 'unixepoch') AS INTEGER) as year,
              COUNT(*) as count
       FROM message
       WHERE ${displayableFilter} AND date > 0
       GROUP BY year
       ORDER BY year ASC`
    )
    .all() as Array<{ year: number | null; count: number }>;
  const messagesByYear = yearRows
    .filter((r) => r.year != null)
    .map((r) => ({ year: r.year as number, count: r.count }));

  // Attachment stats.
  const attachmentsTotal = (
    db.prepare("SELECT COUNT(*) as c FROM attachment").get() as { c: number }
  ).c;
  const attachmentsWithFilename = (
    db
      .prepare("SELECT COUNT(*) as c FROM attachment WHERE filename IS NOT NULL")
      .get() as { c: number }
  ).c;
  const byTransferState = db
    .prepare(
      "SELECT transfer_state as state, COUNT(*) as count FROM attachment GROUP BY transfer_state ORDER BY count DESC"
    )
    .all() as Array<{ state: number; count: number }>;
  const byCkSyncState = db
    .prepare(
      "SELECT ck_sync_state as state, COUNT(*) as count FROM attachment GROUP BY ck_sync_state ORDER BY count DESC"
    )
    .all() as Array<{ state: number; count: number }>;

  // Sampled on-disk presence check.
  let onDisk: DatabaseHealth["attachments"]["onDisk"] = null;
  if (options?.attachmentsPath && attachmentsWithFilename > 0) {
    const { promises: fs } = await import("fs");
    const path = await import("path");
    const sample = db
      .prepare(
        "SELECT filename FROM attachment WHERE filename IS NOT NULL ORDER BY RANDOM() LIMIT ?"
      )
      .all(sampleSize) as Array<{ filename: string }>;

    let present = 0;
    let missing = 0;
    const BATCH = 200;
    for (let i = 0; i < sample.length; i += BATCH) {
      const batch = sample.slice(i, i + BATCH);
      const results = await Promise.all(
        batch.map(async (row) => {
          const rel = toRelativeAttachmentPath(row.filename);
          const full = path.join(options.attachmentsPath as string, rel);
          try {
            await fs.access(full);
            return true;
          } catch {
            return false;
          }
        })
      );
      for (const ok of results) {
        if (ok) present++;
        else missing++;
      }
    }
    const sampled = present + missing;
    const presentRate = sampled > 0 ? present / sampled : 0;
    onDisk = {
      sampled,
      present,
      missing,
      presentRate,
      estimatedPresent: Math.round(attachmentsWithFilename * presentRate),
      estimatedMissing: Math.round(attachmentsWithFilename * (1 - presentRate)),
    };
  }

  return {
    totalMessages,
    displayableMessages,
    withText,
    recoverableText,
    trueEmpty,
    messagesByYear,
    attachments: {
      total: attachmentsTotal,
      withFilename: attachmentsWithFilename,
      byTransferState,
      byCkSyncState,
      onDisk,
    },
  };
}

// Helper function to map associated_message_type to reaction type
function getReactionTypeFromCode(code: number): ReactionType {
  const reactionMap: Record<number, ReactionType> = {
    2000: "heart",
    2001: "thumbs_up",
    2002: "thumbs_down",
    2003: "laugh",
    2004: "emphasize",
    2005: "question",
  };
  return reactionMap[code] || "heart";
}
