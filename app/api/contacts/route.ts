import { NextRequest, NextResponse } from "next/server";
import {
  loadBook,
  replaceBook,
  upsertContact,
} from "@/lib/contacts/store";
import type { Contact } from "@/lib/contacts/types";

export async function GET() {
  try {
    const book = loadBook();
    return NextResponse.json(book);
  } catch (err) {
    console.error("Failed to load contacts book:", err);
    return NextResponse.json(
      { error: "Failed to load contacts" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      contacts?: Record<string, Contact>;
    };
    if (!body?.contacts || typeof body.contacts !== "object") {
      return NextResponse.json(
        { error: "`contacts` object required" },
        { status: 400 }
      );
    }
    const saved = replaceBook(body.contacts);
    return NextResponse.json(saved);
  } catch (err) {
    console.error("Failed to write contacts book:", err);
    return NextResponse.json(
      { error: "Failed to save contacts" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as { handleId?: string; name?: string };
    if (!body?.handleId) {
      return NextResponse.json(
        { error: "`handleId` required" },
        { status: 400 }
      );
    }
    const saved = upsertContact(body.handleId, body.name ?? "");
    return NextResponse.json(saved);
  } catch (err) {
    console.error("Failed to patch contacts book:", err);
    return NextResponse.json(
      { error: "Failed to update contact" },
      { status: 500 }
    );
  }
}
