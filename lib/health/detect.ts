import { statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { expandHome } from "./probe";

/**
 * Path auto-detection for onboarding.
 *
 * Two shapes are supported:
 * 1. The macOS default: `~/Library/Messages/chat.db` + `.../Attachments`.
 * 2. A "backup folder": a directory that holds `chat.db` and `Attachments/`
 *    side by side (the working-copy shape used for local QA). When the user
 *    points us at such a folder we resolve the real file/dir underneath it.
 */

export interface ResolvedPaths {
  dbPath: string;
  attachmentsPath: string;
  /** Where the guess came from, for messaging. */
  source: "default" | "backup-folder" | "explicit";
}

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function isFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

/** The macOS default location, home-expanded to absolute paths. */
export function defaultPaths(): ResolvedPaths {
  const messages = path.join(homedir(), "Library", "Messages");
  return {
    dbPath: path.join(messages, "chat.db"),
    attachmentsPath: path.join(messages, "Attachments"),
    source: "default",
  };
}

/**
 * Given whatever the user (or the auto-detector) hands us for a db path,
 * resolve it — and a best-guess attachments path — into concrete paths.
 *
 * - If `dbInput` is a directory that contains `chat.db`, treat it as a backup
 *   folder: db = `<dir>/chat.db`, attachments = `<dir>/Attachments` (when that
 *   exists and no explicit attachments path was given).
 * - Otherwise pass the paths through untouched (home-expanded).
 */
export function resolvePaths(
  dbInput: string,
  attachmentsInput?: string,
): ResolvedPaths {
  const db = expandHome(dbInput);

  if (isDir(db)) {
    const candidateDb = path.join(db, "chat.db");
    if (isFile(candidateDb)) {
      const siblingAttachments = path.join(db, "Attachments");
      const attachments =
        attachmentsInput && attachmentsInput.trim()
          ? expandHome(attachmentsInput)
          : isDir(siblingAttachments)
            ? siblingAttachments
            : "";
      return {
        dbPath: candidateDb,
        attachmentsPath: attachments,
        source: "backup-folder",
      };
    }
  }

  return {
    dbPath: db,
    attachmentsPath: attachmentsInput ? expandHome(attachmentsInput) : "",
    source: "explicit",
  };
}
