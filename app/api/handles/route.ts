import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase, getDatabase } from "@/lib/db/connection";

interface HandleRow {
  id: string;
  service: string | null;
  message_count: number;
  last_seen: number | null;
}

export async function GET(request: NextRequest) {
  try {
    const dbPath = new URL(request.url).searchParams.get("dbPath");
    if (!dbPath) {
      return NextResponse.json(
        { error: "Database path is required" },
        { status: 400 }
      );
    }
    connectToDatabase(dbPath);
    const db = getDatabase();

    const rows = db
      .prepare(
        `
        SELECT
          h.id as id,
          GROUP_CONCAT(DISTINCT h.service) as service,
          COUNT(m.ROWID) as message_count,
          MAX(m.date) as last_seen
        FROM handle h
        LEFT JOIN message m ON m.handle_id = h.ROWID
        GROUP BY h.id
        ORDER BY message_count DESC, h.id ASC
      `
      )
      .all() as HandleRow[];

    return NextResponse.json({ handles: rows });
  } catch (err) {
    console.error("Error fetching handles:", err);
    return NextResponse.json(
      { error: "Failed to fetch handles" },
      { status: 500 }
    );
  }
}
