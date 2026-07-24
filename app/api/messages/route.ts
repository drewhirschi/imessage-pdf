import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/connection";
import {
  getMessagesForConversation,
  getConversationDetails,
} from "@/lib/db/queries";
import { decodeRichLink } from "@/lib/link-preview/decode";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const chatId = searchParams.get("chatId");
    const dbPath = searchParams.get("dbPath");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "500", 10);
    const getDetails = searchParams.get("getDetails") === "true";

    if (!chatId || !dbPath) {
      return NextResponse.json(
        { error: "Chat ID and database path are required" },
        { status: 400 }
      );
    }

    // Connect to the database
    connectToDatabase(dbPath);

    // Parse date parameters - these are already in iMessage timestamp format (nanoseconds since 2001-01-01)
    const startTimestamp = startDate ? parseInt(startDate) : undefined;
    const endTimestamp = endDate ? parseInt(endDate) : undefined;

    // Calculate offset
    const offset = (page - 1) * limit;

    // Get messages for the conversation
    const result = getMessagesForConversation(
      parseInt(chatId),
      startTimestamp,
      endTimestamp,
      limit,
      offset
    );

    // Decode the rich URL preview (LPLinkMetadata) from each message's
    // payload_data server-side, and drop the raw blob so the JSON stays small.
    // For rich-link messages message.text is usually NULL — the decoded link is
    // the only thing the client can render.
    const enriched = result.messages.map((m) => {
      const richLink = decodeRichLink(m.message.payload_data);
      // payload_data is a large binary blob (the archived LPLinkMetadata) that
      // the client never uses directly once decoded — strip it from the wire.
      const { payload_data, ...message } = m.message;
      void payload_data;
      return { ...m, message, richLink };
    });

    const response: {
      messages: typeof enriched;
      total: number;
      page: number;
      limit: number;
      hasMore: boolean;
      conversationDetails?: ReturnType<typeof getConversationDetails>;
    } = {
      messages: enriched,
      total: result.total,
      page,
      limit,
      hasMore: offset + result.messages.length < result.total,
    };

    // Optionally include conversation details
    if (getDetails) {
      response.conversationDetails = getConversationDetails(parseInt(chatId));
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error fetching messages:", error);
    return NextResponse.json(
      { error: "Failed to fetch messages" },
      { status: 500 }
    );
  }
}
