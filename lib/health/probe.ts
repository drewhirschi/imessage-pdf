import { statSync, accessSync, constants } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

/**
 * Filesystem/permission probing for the onboarding health check.
 *
 * The three states the UI cares about:
 * - `ok`               — path exists and is readable/openable.
 * - `not_found`        — path does not exist (ENOENT).
 * - `permission_denied`— path exists but we cannot read/open it. On macOS this
 *                        is the Full Disk Access case (EPERM/EACCES on the
 *                        stat/open, or SQLITE_CANTOPEN when node:sqlite tries
 *                        to open `~/Library/Messages/chat.db`).
 *
 * This module is deliberately filesystem-only and framework-free so it can be
 * unit-tested directly (simulate `permission_denied` with a mode-000 file).
 */

export type HealthStatus = "ok" | "not_found" | "permission_denied";

export interface PathHealth {
  status: HealthStatus;
  /** The absolute path we actually probed (after ~ expansion). */
  path: string;
  detail: string;
  /** Underlying errno/sqlite code when the probe failed, for debugging. */
  code?: string;
}

export function expandHome(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return path.join(homedir(), p.slice(2));
  return p;
}

/**
 * Map a caught error to one of our three health states. `ENOENT` is the only
 * "missing" signal; everything else that stopped us from reading an existing
 * path is treated as a permission problem (this is what the FDA screen keys
 * off of).
 */
export function classifyFsError(err: unknown): HealthStatus {
  const e = err as (NodeJS.ErrnoException & { message?: string }) | null;
  const code = e?.code ?? "";
  if (code === "ENOENT") return "not_found";
  if (code === "EACCES" || code === "EPERM") return "permission_denied";
  const msg = e?.message ?? "";
  if (
    /SQLITE_CANTOPEN|SQLITE_PERM|SQLITE_AUTH|not authorized|permission denied|operation not permitted/i.test(
      msg,
    )
  ) {
    return "permission_denied";
  }
  // Exists but could not be opened for some other reason (e.g. corrupt file).
  // Treat as needs-attention rather than pretending it's missing.
  return "permission_denied";
}

function codeOf(err: unknown): string | undefined {
  const e = err as (NodeJS.ErrnoException & { message?: string }) | null;
  return e?.code || (e?.message ? e.message.split(/[:\n]/)[0] : undefined);
}

/**
 * Probe an iMessage database file: it must exist, be readable, and open
 * read-only under node:sqlite.
 */
export function probeDatabase(rawPath: string): PathHealth {
  const p = expandHome(rawPath);

  // Existence + type check first, so a missing file is cleanly `not_found`.
  try {
    const st = statSync(p);
    if (st.isDirectory()) {
      return {
        status: "not_found",
        path: p,
        detail: "Path is a directory, not a chat.db file.",
      };
    }
  } catch (err) {
    const status = classifyFsError(err);
    return {
      status,
      path: p,
      detail:
        status === "not_found"
          ? "No database file at this path."
          : "Cannot access the database file.",
      code: codeOf(err),
    };
  }

  // Exists: confirm we can actually read and open it.
  try {
    accessSync(p, constants.R_OK);
    const db = new DatabaseSync(p, { readOnly: true });
    try {
      db.prepare("SELECT 1").get();
    } finally {
      db.close();
    }
    return { status: "ok", path: p, detail: "Database is readable." };
  } catch (err) {
    return {
      status: classifyFsError(err),
      path: p,
      detail:
        "The database exists but could not be opened. On macOS this usually means Full Disk Access has not been granted.",
      code: codeOf(err),
    };
  }
}

/**
 * Probe an attachments directory: it must exist, be a directory, and be
 * readable/traversable.
 */
export function probeDirectory(rawPath: string): PathHealth {
  const p = expandHome(rawPath);

  try {
    const st = statSync(p);
    if (!st.isDirectory()) {
      return {
        status: "not_found",
        path: p,
        detail: "Path exists but is not a directory.",
      };
    }
  } catch (err) {
    const status = classifyFsError(err);
    return {
      status,
      path: p,
      detail:
        status === "not_found"
          ? "No directory at this path."
          : "Cannot access the attachments directory.",
      code: codeOf(err),
    };
  }

  try {
    // Reading a directory requires both read and execute (traverse) bits.
    accessSync(p, constants.R_OK | constants.X_OK);
    return {
      status: "ok",
      path: p,
      detail: "Attachments directory is readable.",
    };
  } catch (err) {
    return {
      status: classifyFsError(err),
      path: p,
      detail:
        "The attachments directory exists but is not readable. On macOS this usually means Full Disk Access has not been granted.",
      code: codeOf(err),
    };
  }
}
