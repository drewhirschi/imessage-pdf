import fs from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import { getAppDatabase } from "@/lib/app-db/connection";
import { EMPTY_BOOK, type Contact, type ContactsBook } from "./types";

let migrationChecked = false;

function getLegacyContactsPath(): string {
  return (
    process.env.IMESSAGE_PDF_LEGACY_CONTACTS_PATH ??
    path.join(homedir(), ".imessage-pdf", "contacts.json")
  );
}

function normalizeHandle(h: string): string {
  if (h.includes("@")) return h.toLowerCase().trim();
  return h.replace(/\D/g, "");
}

function importLegacyContactsOnce(): void {
  if (migrationChecked) return;
  migrationChecked = true;

  const db = getAppDatabase();
  const row = db.prepare("SELECT COUNT(*) AS count FROM contacts").get() as {
    count: number;
  };
  const legacyPath = getLegacyContactsPath();
  if (Number(row.count) > 0 || !fs.existsSync(legacyPath)) return;

  try {
    const parsed = JSON.parse(
      fs.readFileSync(legacyPath, "utf8"),
    ) as ContactsBook;
    if (!parsed?.contacts || typeof parsed.contacts !== "object") return;

    const insert = db.prepare(
      "INSERT OR IGNORE INTO contacts (handle_id, name, note) VALUES (?, ?, ?)",
    );
    for (const [handleId, contact] of Object.entries(parsed.contacts)) {
      if (!contact?.name?.trim()) continue;
      insert.run(handleId, contact.name.trim(), contact.note ?? null);
    }
  } catch (error) {
    console.error("Failed to import legacy contacts book:", error);
  }
}

export function loadBook(): ContactsBook {
  importLegacyContactsOnce();
  const rows = getAppDatabase()
    .prepare("SELECT handle_id, name, note FROM contacts ORDER BY handle_id")
    .all() as Array<{ handle_id: string; name: string; note: string | null }>;
  if (rows.length === 0) return EMPTY_BOOK;

  const contacts: Record<string, Contact> = {};
  for (const row of rows) {
    contacts[row.handle_id] = {
      name: row.name,
      ...(row.note ? { note: row.note } : {}),
    };
  }
  return { version: 1, contacts };
}

export interface Resolver {
  book: ContactsBook;
  has: (handleId: string) => boolean;
  resolve: (handleId: string | null | undefined) => string | null;
  nameMap: Record<string, string>;
}

export function buildResolver(book: ContactsBook): Resolver {
  const exact = new Map<string, string>();
  const norm = new Map<string, string>();
  const nameMap: Record<string, string> = {};
  for (const [key, contact] of Object.entries(book.contacts)) {
    if (!contact?.name) continue;
    exact.set(key, contact.name);
    norm.set(normalizeHandle(key), contact.name);
    nameMap[key] = contact.name;
  }
  return {
    book,
    nameMap,
    has(handleId) {
      return exact.has(handleId) || norm.has(normalizeHandle(handleId));
    },
    resolve(handleId) {
      if (!handleId) return null;
      return exact.get(handleId) ?? norm.get(normalizeHandle(handleId)) ?? null;
    },
  };
}

export function getResolver(): Resolver {
  return buildResolver(loadBook());
}

export function upsertContact(
  handleId: string,
  name: string,
): ContactsBook {
  const db = getAppDatabase();
  const trimmed = name.trim();
  if (!trimmed) {
    db.prepare("DELETE FROM contacts WHERE handle_id = ?").run(handleId);
  } else {
    db.prepare(
      `INSERT INTO contacts (handle_id, name, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(handle_id) DO UPDATE SET
         name = excluded.name,
         updated_at = CURRENT_TIMESTAMP`,
    ).run(handleId, trimmed);
  }
  return loadBook();
}

export function replaceBook(
  contacts: Record<string, Contact>,
): ContactsBook {
  const db = getAppDatabase();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec("DELETE FROM contacts");
    const insert = db.prepare(
      "INSERT INTO contacts (handle_id, name, note) VALUES (?, ?, ?)",
    );
    for (const [handleId, contact] of Object.entries(contacts)) {
      if (!contact?.name?.trim()) continue;
      insert.run(handleId, contact.name.trim(), contact.note ?? null);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return loadBook();
}

export function resetContactsMigrationForTests(): void {
  migrationChecked = false;
}

export { normalizeHandle };
