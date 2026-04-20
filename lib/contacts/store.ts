import fs from "fs";
import path from "path";
import { homedir } from "os";
import { EMPTY_BOOK, type Contact, type ContactsBook } from "./types";

const cache = new Map<string, { book: ContactsBook; mtimeMs: number }>();

function expandPath(raw: string): string {
  if (raw.startsWith("~")) return path.join(homedir(), raw.slice(1));
  return raw;
}

function normalizeHandle(h: string): string {
  if (h.includes("@")) return h.toLowerCase().trim();
  return h.replace(/\D/g, "");
}

export function loadBook(rawPath: string | null | undefined): ContactsBook {
  if (!rawPath) return EMPTY_BOOK;
  const p = expandPath(rawPath);
  try {
    const stat = fs.statSync(p);
    const hit = cache.get(p);
    if (hit && hit.mtimeMs === stat.mtimeMs) return hit.book;
    const raw = fs.readFileSync(p, "utf8");
    const parsed = JSON.parse(raw) as ContactsBook;
    if (!parsed || typeof parsed !== "object" || !parsed.contacts) {
      return EMPTY_BOOK;
    }
    cache.set(p, { book: parsed, mtimeMs: stat.mtimeMs });
    return parsed;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return EMPTY_BOOK;
    console.error("Failed to load contacts book:", err);
    return EMPTY_BOOK;
  }
}

export function saveBook(rawPath: string, book: ContactsBook): void {
  const p = expandPath(rawPath);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = p + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(book, null, 2), "utf8");
  fs.renameSync(tmp, p);
  const stat = fs.statSync(p);
  cache.set(p, { book, mtimeMs: stat.mtimeMs });
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
      return (
        exact.get(handleId) ?? norm.get(normalizeHandle(handleId)) ?? null
      );
    },
  };
}

export function getResolver(rawPath: string | null | undefined): Resolver {
  return buildResolver(loadBook(rawPath));
}

export function upsertContact(
  rawPath: string,
  handleId: string,
  name: string
): ContactsBook {
  const book = loadBook(rawPath);
  const contacts: Record<string, Contact> = { ...book.contacts };
  const trimmed = name.trim();
  if (!trimmed) {
    delete contacts[handleId];
  } else {
    contacts[handleId] = { ...contacts[handleId], name: trimmed };
  }
  const next: ContactsBook = { version: 1, contacts };
  saveBook(rawPath, next);
  return next;
}

export function replaceBook(
  rawPath: string,
  contacts: Record<string, Contact>
): ContactsBook {
  const next: ContactsBook = { version: 1, contacts };
  saveBook(rawPath, next);
  return next;
}

export { normalizeHandle };
