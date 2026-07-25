import { DatabaseSync } from "node:sqlite";
import { homedir } from "node:os";
import path from "node:path";
import fs from "node:fs";

let database: DatabaseSync | null = null;
let connectedPath: string | null = null;

export function getAppDatabasePath(): string {
  return (
    process.env.IMESSAGE_PDF_APP_DB_PATH ??
    path.join(homedir(), ".imessage-pdf", "app.db")
  );
}

export function getAppDatabase(): DatabaseSync {
  const dbPath = getAppDatabasePath();
  if (database && connectedPath === dbPath) return database;
  if (database) database.close();

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  database = new DatabaseSync(dbPath);
  connectedPath = dbPath;
  database.exec("PRAGMA journal_mode = WAL");
  database.exec("PRAGMA foreign_keys = ON");
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS contacts (
      handle_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      note TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS pinned_conversations (
      source_id TEXT NOT NULL,
      chat_identifier TEXT NOT NULL,
      pinned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (source_id, chat_identifier)
    );

    INSERT OR IGNORE INTO schema_migrations (version) VALUES (1);
  `);
  return database;
}

export function closeAppDatabase(): void {
  if (!database) return;
  database.close();
  database = null;
  connectedPath = null;
}
