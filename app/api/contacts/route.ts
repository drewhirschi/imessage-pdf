import { NextRequest, NextResponse } from "next/server";
import {
  loadBook,
  replaceBook,
  upsertContact,
} from "@/lib/contacts/store";
import type { Contact } from "@/lib/contacts/types";

function requirePath(request: NextRequest): string | NextResponse {
  const path = new URL(request.url).searchParams.get("path");
  if (!path) {
    return NextResponse.json(
      { error: "Contacts path is required" },
      { status: 400 }
    );
  }
  return path;
}

export async function GET(request: NextRequest) {
  const path = requirePath(request);
  if (path instanceof NextResponse) return path;
  try {
    const book = loadBook(path);
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
  const path = requirePath(request);
  if (path instanceof NextResponse) return path;
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
    const saved = replaceBook(path, body.contacts);
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
  const path = requirePath(request);
  if (path instanceof NextResponse) return path;
  try {
    const body = (await request.json()) as { handleId?: string; name?: string };
    if (!body?.handleId) {
      return NextResponse.json(
        { error: "`handleId` required" },
        { status: 400 }
      );
    }
    const saved = upsertContact(path, body.handleId, body.name ?? "");
    return NextResponse.json(saved);
  } catch (err) {
    console.error("Failed to patch contacts book:", err);
    return NextResponse.json(
      { error: "Failed to update contact" },
      { status: 500 }
    );
  }
}
