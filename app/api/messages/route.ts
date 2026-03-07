import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/connection";
import {
  getMessagesForConversation,
  getConversationDetails,
} from "@/lib/db/queries";

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

    const response: {
      messages: typeof result.messages;
      total: number;
      page: number;
      limit: number;
      hasMore: boolean;
      conversationDetails?: ReturnType<typeof getConversationDetails>;
    } = {
      messages: result.messages,
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
