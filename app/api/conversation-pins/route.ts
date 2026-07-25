import { NextRequest, NextResponse } from "next/server";
import {
  listPinnedConversations,
  setConversationPinned,
} from "@/lib/app-db/conversation-pins";

export async function GET(request: NextRequest) {
  const dbPath = new URL(request.url).searchParams.get("dbPath");
  if (!dbPath) {
    return NextResponse.json({ error: "Database path is required" }, { status: 400 });
  }
  return NextResponse.json({ pinned: listPinnedConversations(dbPath) });
}

export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      dbPath?: string;
      chatIdentifier?: string;
      pinned?: boolean;
    };
    if (
      !body.dbPath ||
      !body.chatIdentifier ||
      typeof body.pinned !== "boolean"
    ) {
      return NextResponse.json(
        { error: "dbPath, chatIdentifier, and pinned are required" },
        { status: 400 },
      );
    }
    setConversationPinned(body.dbPath, body.chatIdentifier, body.pinned);
    return NextResponse.json({ ok: true, pinned: body.pinned });
  } catch (error) {
    console.error("Failed to update conversation pin:", error);
    return NextResponse.json(
      { error: "Failed to update conversation pin" },
      { status: 500 },
    );
  }
}
