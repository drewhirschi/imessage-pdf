import { getDatabase } from "./connection";
import type {
  Chat,
  Message,
  Handle,
  Attachment,
  ConversationSummary,
  MessageWithAttachments,
  Reaction,
} from "./types";

export function getAllConversations(
  phoneNumber?: string,
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
    WHERE c.is_archived = 0
  `;

  const params: (string | number)[] = [];

  // Add phone number filter if provided
  if (phoneNumber) {
    query += `
      AND EXISTS (
        SELECT 1
        FROM chat_handle_join chj
        JOIN handle h ON chj.handle_id = h.ROWID
        WHERE chj.chat_id = c.ROWID
        AND h.id LIKE ?
      )
    `;
    params.push(`%${phoneNumber}%`);
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

    return {
      chat_id: conv.chat_id,
      chat_identifier: conv.chat_identifier,
      display_name: conv.display_name,
      participants: participants.map((p) => p.id),
      last_message: conv.last_message,
      last_message_date: conv.last_message_date,
      message_count: conv.message_count,
      is_group: conv.group_id !== null,
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
    WHERE cmj.chat_id = ? ${dateFilter}
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

  const messagesWithAttachments = messages.map((msg) => {
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

    return {
      message: msg as Message,
      handle,
      attachments,
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

  return {
    chat_id: chatId,
    display_name: chat.display_name,
    participants: participants.map((p) => p.id),
    is_group: chat.group_id !== null,
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

export function getReactionsForMessage(messageId: number): Reaction[] {
  const db = getDatabase();

  // Note: Reactions are stored in the message_summary_info blob
  // This is a simplified implementation - actual reaction parsing would need
  // to decode the binary data structure
  const query = `
    SELECT 
      m.ROWID as message_id,
      m.handle_id,
      m.date,
      'heart' as reaction_type
    FROM message m
    WHERE m.ROWID = ? AND m.message_summary_info IS NOT NULL
  `;

  const result = db.prepare(query).get(messageId) as Reaction | undefined;
  return result ? [result] : [];
}
