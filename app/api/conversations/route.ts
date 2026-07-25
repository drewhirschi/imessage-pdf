import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/connection";
import { getAllConversations } from "@/lib/db/queries";
import { listPinnedConversations } from "@/lib/app-db/conversation-pins";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dbPath = searchParams.get("dbPath");
    const phoneNumber = searchParams.get("phoneNumber");
    const handleIdsRaw = searchParams.get("handleIds");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    if (!dbPath) {
      return NextResponse.json(
        { error: "Database path is required" },
        { status: 400 }
      );
    }

    const offset = (page - 1) * limit;

    connectToDatabase(dbPath);

    const handleIds = handleIdsRaw
      ? handleIdsRaw.split(",").map((s) => s.trim()).filter(Boolean)
      : undefined;

    const pinnedIdentifiers = listPinnedConversations(dbPath);
    const pinnedSet = new Set(pinnedIdentifiers);
    const result = getAllConversations(
      phoneNumber || undefined,
      handleIds,
      limit,
      offset,
      pinnedIdentifiers,
    );

    return NextResponse.json({
      conversations: result.conversations.map((conversation) => ({
        ...conversation,
        is_pinned: pinnedSet.has(conversation.chat_identifier),
      })),
      total: result.total,
      page,
      limit,
      hasMore: offset + result.conversations.length < result.total,
    });
  } catch (error) {
    console.error("Error fetching conversations:", error);
    return NextResponse.json(
      { error: "Failed to fetch conversations" },
      { status: 500 }
    );
  }
}
