import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { connectToDatabase, closeDatabase } from "./connection";
import {
  getAllConversations,
  getMessagesForConversation,
  getConversationDetails,
  getAttachmentPath,
} from "./queries";
import {
  createFixtureDb,
  TS,
  ATTR_BODY_CHAT,
  type Fixture,
} from "../../test/fixture";

let fixture: Fixture;

beforeAll(() => {
  fixture = createFixtureDb();
  closeDatabase();
  connectToDatabase(fixture.dbPath);
});

afterAll(() => {
  closeDatabase();
  fixture.cleanup();
});

describe("getAllConversations", () => {
  it("returns non-archived conversations ordered by last message date", () => {
    const { conversations, total } = getAllConversations();
    // chat 3 is archived and must be excluded; chats 1 and 2 remain.
    expect(total).toBe(2);
    const ids = conversations.map((c) => c.chat_id);
    expect(ids).toContain(1);
    expect(ids).toContain(2);
    expect(ids).not.toContain(3);
  });

  it("computes message_count and flags groups", () => {
    const { conversations } = getAllConversations();
    const chat1 = conversations.find((c) => c.chat_id === 1)!;
    const chat2 = conversations.find((c) => c.chat_id === 2)!;
    // message_count is COUNT(cmj.message_id): 5 join rows in chat 1
    // (3 text + 2 reaction rows). The reaction rows are still counted
    // because the count keys off the join, not the filtered message —
    // pre-existing behavior, identical under better-sqlite3 and node:sqlite.
    expect(chat1.message_count).toBe(5);
    expect(chat1.is_group).toBe(false);
    // chat 2 has 3 participants => group.
    expect(chat2.is_group).toBe(true);
    expect(chat2.participants).toHaveLength(3);
  });

  it("preserves large iMessage nanosecond timestamps as numbers", () => {
    const { conversations } = getAllConversations();
    const chat1 = conversations.find((c) => c.chat_id === 1)!;
    expect(typeof chat1.last_message_date).toBe("number");
    // last real message in chat 1 is message 12 at TS.t4.
    expect(chat1.last_message_date).toBeGreaterThan(TS.t3);
  });

  it("filters by phone number substring", () => {
    const { conversations, total } = getAllConversations("3334444");
    // Only chat 2 has handle +15553334444.
    expect(total).toBe(1);
    expect(conversations[0].chat_id).toBe(2);
  });

  it("paginates with limit and offset", () => {
    const page1 = getAllConversations(undefined, undefined, 1, 0);
    const page2 = getAllConversations(undefined, undefined, 1, 1);
    expect(page1.total).toBe(2);
    expect(page1.conversations).toHaveLength(1);
    expect(page2.conversations).toHaveLength(1);
    expect(page1.conversations[0].chat_id).not.toBe(
      page2.conversations[0].chat_id
    );
  });
});

describe("getMessagesForConversation", () => {
  it("returns real messages in date order, excluding reactions", () => {
    const { messages, total } = getMessagesForConversation(1);
    expect(total).toBe(3);
    const rowids = messages.map((m) => m.message.ROWID);
    expect(rowids).toEqual([10, 11, 12]);
    // reaction rows 30/31 must not appear as messages
    expect(rowids).not.toContain(30);
    expect(rowids).not.toContain(31);
  });

  it("groups reactions onto their target messages by GUID", () => {
    const { messages } = getMessagesForConversation(1);
    const m10 = messages.find((m) => m.message.ROWID === 10)!;
    const m11 = messages.find((m) => m.message.ROWID === 11)!;
    const m12 = messages.find((m) => m.message.ROWID === 12)!;
    expect(m10.reactions).toHaveLength(1);
    expect(m10.reactions[0].reaction_type).toBe("heart");
    expect(m11.reactions).toHaveLength(1);
    expect(m11.reactions[0].reaction_type).toBe("thumbs_up");
    expect(m12.reactions).toHaveLength(0);
  });

  it("attaches attachments to the owning message", () => {
    const { messages } = getMessagesForConversation(1);
    const m12 = messages.find((m) => m.message.ROWID === 12)!;
    expect(m12.attachments).toHaveLength(1);
    expect(m12.attachments[0].mime_type).toBe("image/heic");
  });

  it("populates handle info from the join", () => {
    const { messages } = getMessagesForConversation(1);
    const m10 = messages.find((m) => m.message.ROWID === 10)!;
    // The SELECT aliases `h.id AS handle_id`, which shadows message.handle_id
    // (duplicate column name; last column wins). So handle.id is the string
    // handle identifier, not the numeric FK — identical across drivers.
    expect(m10.handle?.id).toBe("+15551112222");
    // is_from_me message has no handle
    const m11 = messages.find((m) => m.message.ROWID === 11)!;
    expect(m11.handle).toBeNull();
  });

  it("filters by startDate (iMessage nanoseconds)", () => {
    const { messages } = getMessagesForConversation(1, TS.t4);
    // Only message 12 is at/after t4.
    expect(messages.map((m) => m.message.ROWID)).toEqual([12]);
  });

  it("filters by endDate (iMessage nanoseconds)", () => {
    const { messages } = getMessagesForConversation(1, undefined, TS.t2);
    // messages 10 (t1) and 11 (t2), not 12 (t4).
    expect(messages.map((m) => m.message.ROWID)).toEqual([10, 11]);
  });

  it("filters by an inclusive date range", () => {
    const { messages } = getMessagesForConversation(1, TS.t2, TS.t3);
    expect(messages.map((m) => m.message.ROWID)).toEqual([11]);
  });

  it("paginates messages with limit and offset", () => {
    const page1 = getMessagesForConversation(1, undefined, undefined, 2, 0);
    const page2 = getMessagesForConversation(1, undefined, undefined, 2, 2);
    expect(page1.total).toBe(3);
    expect(page1.messages.map((m) => m.message.ROWID)).toEqual([10, 11]);
    expect(page2.messages.map((m) => m.message.ROWID)).toEqual([12]);
  });
});

describe("getConversationDetails", () => {
  it("returns participants and group flag", () => {
    const details = getConversationDetails(2)!;
    expect(details.is_group).toBe(true);
    expect(details.participants.sort()).toEqual([
      "+15551112222",
      "+15553334444",
      "+15555556666",
    ]);
  });

  it("returns null for unknown chat", () => {
    expect(getConversationDetails(999)).toBeNull();
  });
});

describe("group chat (chat 2) — multi-sender attribution", () => {
  it("attributes each message to the correct sender handle", () => {
    const { messages, total } = getMessagesForConversation(2);
    // 3 real messages (reaction row 40 excluded).
    expect(total).toBe(3);
    const byRow = new Map(messages.map((m) => [m.message.ROWID, m]));
    // handle.id is aliased to the string handle identifier in the query.
    expect(byRow.get(20)?.handle?.id).toBe("+15553334444");
    expect(byRow.get(21)?.handle?.id).toBe("+15555556666");
    // message 22 is from me → no handle.
    expect(byRow.get(22)?.handle).toBeNull();
    expect(byRow.get(22)?.message.is_from_me).toBe(1);
  });

  it("keeps three distinct senders across the run", () => {
    const { messages } = getMessagesForConversation(2);
    const senders = new Set(
      messages.map((m) =>
        m.message.is_from_me === 1 ? "me" : m.handle?.id ?? "unknown",
      ),
    );
    expect(senders.has("+15553334444")).toBe(true);
    expect(senders.has("+15555556666")).toBe(true);
    expect(senders.has("me")).toBe(true);
  });

  it("groups a reaction onto the right target and attributes its sender", () => {
    const { messages } = getMessagesForConversation(2);
    const m20 = messages.find((m) => m.message.ROWID === 20)!;
    expect(m20.reactions).toHaveLength(1);
    expect(m20.reactions[0].reaction_type).toBe("laugh");
    // The reaction was sent by handle 3 (+15555556666), not the message author.
    expect(m20.reactions[0].sender_id).toBe("+15555556666");
    expect(m20.reactions[0].is_from_me).toBe(0);
    // Other group messages carry no reactions.
    const m21 = messages.find((m) => m.message.ROWID === 21)!;
    expect(m21.reactions).toHaveLength(0);
  });
});

describe("getAttachmentPath", () => {
  it("returns the raw filename for an attachment", () => {
    expect(getAttachmentPath(100)).toBe(
      "~/Library/Messages/Attachments/ab/cd/photo.HEIC"
    );
  });

  it("returns null for a missing attachment", () => {
    expect(getAttachmentPath(999)).toBeNull();
  });
});

describe("attributedBody recovery + reaction/sticker filtering (chat 4)", () => {
  const { chatId, anchorGuid, recoveredRowIds } = ATTR_BODY_CHAT;

  it("recovers text from attributedBody when the text column is empty", () => {
    const { messages } = getMessagesForConversation(chatId);
    const byRow = new Map(messages.map((m) => [m.message.ROWID, m]));
    expect(byRow.get(recoveredRowIds.simple)!.message.text).toBe(
      "What are you up to? "
    );
    expect(byRow.get(recoveredRowIds.mutable)!.message.text).toBe(
      "Did you just get there? "
    );
  });

  it("leaves attachment-placeholder attributedBody (empty backing string) blank", () => {
    const { messages } = getMessagesForConversation(chatId);
    const empty = messages.find(
      (m) => m.message.ROWID === recoveredRowIds.emptyBlob
    )!;
    expect(empty.message.text ?? "").toBe("");
  });

  it("excludes reactions (2000-2005) and the sticker/edit band (2006-3005)", () => {
    const { messages, total } = getMessagesForConversation(chatId);
    // 4 real messages: anchor + 3 attributedBody rows. Reactions 60-65 and
    // sticker 70 are filtered out.
    expect(total).toBe(4);
    const rowids = messages.map((m) => m.message.ROWID).sort((a, b) => a - b);
    expect(rowids).toEqual([50, 51, 52, 53]);
    expect(
      messages.some((m) => m.message.text === "sticker-should-be-hidden")
    ).toBe(false);
  });

  it("groups all six reaction types (2000-2005) onto the anchor message", () => {
    const { messages } = getMessagesForConversation(chatId);
    const anchor = messages.find((m) => m.message.guid === anchorGuid)!;
    const types = (anchor.reactions ?? [])
      .map((r) => r.associated_message_type)
      .sort();
    expect(types).toEqual([2000, 2001, 2002, 2003, 2004, 2005]);
    const kinds = (anchor.reactions ?? [])
      .map((r) => r.reaction_type)
      .sort();
    expect(kinds).toEqual([
      "emphasize",
      "heart",
      "laugh",
      "question",
      "thumbs_down",
      "thumbs_up",
    ]);
  });
});
