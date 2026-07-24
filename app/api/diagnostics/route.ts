import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/connection";
import { getDatabaseHealth } from "@/lib/db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/diagnostics?dbPath&attachmentsPath&sampleSize
 *
 * Whole-database health diagnostics (message text recoverability, per-year
 * histogram, attachment presence). Distinct from /api/health, which is the
 * first-run readiness probe.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dbPath = searchParams.get("dbPath");
    const attachmentsPath = searchParams.get("attachmentsPath") || undefined;
    const sampleSize = searchParams.get("sampleSize");

    if (!dbPath) {
      return NextResponse.json(
        { error: "Database path is required" },
        { status: 400 }
      );
    }

    connectToDatabase(dbPath);

    // Clamp: NaN would make node:sqlite throw on the LIMIT bind, and a huge
    // value would stat every attachment on disk.
    const parsedSample = sampleSize ? parseInt(sampleSize, 10) : NaN;
    const health = await getDatabaseHealth({
      attachmentsPath,
      sampleSize: Number.isFinite(parsedSample)
        ? Math.min(Math.max(parsedSample, 1), 5000)
        : undefined,
    });

    return NextResponse.json(health);
  } catch (error) {
    console.error("Error computing database diagnostics:", error);
    return NextResponse.json(
      { error: "Failed to compute database diagnostics" },
      { status: 500 }
    );
  }
}
