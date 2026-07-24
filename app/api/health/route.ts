import { NextRequest, NextResponse } from "next/server";
import { probeDatabase, probeDirectory, type HealthStatus } from "@/lib/health/probe";
import { defaultPaths, resolvePaths } from "@/lib/health/detect";

/**
 * GET /api/health?dbPath&attachmentsPath
 *
 * Structured per-path readiness for the onboarding flow. With no params it
 * probes the macOS default location (used on first load to decide between
 * "straight to conversations", the Full Disk Access screen, and the manual
 * picker). With params it probes the given paths, transparently resolving the
 * "backup folder" shape (a directory containing chat.db + Attachments).
 *
 * Response shape:
 * {
 *   db:          { status, path, detail, code? },
 *   attachments: { status, path, detail, code? },
 *   overall:     "ok" | "permission_denied" | "not_found",
 *   resolved:    { dbPath, attachmentsPath, source },  // what the client should save
 *   probedDefault: boolean
 * }
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const dbParam = searchParams.get("dbPath");
  const attachmentsParam = searchParams.get("attachmentsPath");

  const probedDefault = !dbParam;
  const resolved = dbParam
    ? resolvePaths(dbParam, attachmentsParam ?? undefined)
    : { ...defaultPaths() };

  const db = probeDatabase(resolved.dbPath);

  // Attachments are optional-ish: only probe when we have a path to check.
  const attachments = resolved.attachmentsPath
    ? probeDirectory(resolved.attachmentsPath)
    : {
        status: "not_found" as HealthStatus,
        path: "",
        detail: "No attachments path detected.",
      };

  // Overall status: permission problems take priority (they need the FDA
  // screen), then missing, then ok. Attachments not being found is not fatal
  // for reading text, so `overall` keys primarily off the database.
  let overall: HealthStatus;
  if (db.status === "permission_denied" || attachments.status === "permission_denied") {
    overall = "permission_denied";
  } else if (db.status === "not_found") {
    overall = "not_found";
  } else if (db.status === "ok" && attachments.status === "ok") {
    overall = "ok";
  } else {
    // db ok but attachments missing — good enough to read the conversation.
    overall = db.status;
  }

  return NextResponse.json({
    db,
    attachments,
    overall,
    resolved: {
      dbPath: resolved.dbPath,
      attachmentsPath: resolved.attachmentsPath,
      source: resolved.source,
    },
    probedDefault,
  });
}
