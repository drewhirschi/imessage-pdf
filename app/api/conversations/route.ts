import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/connection";
import { getAllConversations } from "@/lib/db/queries";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dbPath = searchParams.get("dbPath");
    const phoneNumber = searchParams.get("phoneNumber");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    if (!dbPath) {
      return NextResponse.json(
        { error: "Database path is required" },
        { status: 400 }
      );
    }

    // Calculate offset
    const offset = (page - 1) * limit;

    // Connect to the database
    connectToDatabase(dbPath);

    // Get paginated conversations, optionally filtered by phone number
    const result = getAllConversations(phoneNumber || undefined, limit, offset);

    return NextResponse.json({
      conversations: result.conversations,
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
