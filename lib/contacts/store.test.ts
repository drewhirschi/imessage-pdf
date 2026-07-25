import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeAppDatabase, getAppDatabase } from "@/lib/app-db/connection";
import {
  loadBook,
  replaceBook,
  resetContactsMigrationForTests,
  upsertContact,
} from "./store";
import {
  listPinnedConversations,
  setConversationPinned,
} from "@/lib/app-db/conversation-pins";

let tempDir: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "imessage-pdf-app-db-"));
  process.env.IMESSAGE_PDF_APP_DB_PATH = path.join(tempDir, "app.db");
  process.env.IMESSAGE_PDF_LEGACY_CONTACTS_PATH = path.join(
    tempDir,
    "contacts.json",
  );
  resetContactsMigrationForTests();
});

afterEach(() => {
  closeAppDatabase();
  delete process.env.IMESSAGE_PDF_APP_DB_PATH;
  delete process.env.IMESSAGE_PDF_LEGACY_CONTACTS_PATH;
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("app-owned contacts store", () => {
  it("creates the app schema and persists contact CRUD", () => {
    expect(loadBook()).toEqual({ version: 1, contacts: {} });

    upsertContact("+1 (555) 010-1111", "Maya");
    expect(loadBook().contacts["+1 (555) 010-1111"]?.name).toBe("Maya");

    upsertContact("+1 (555) 010-1111", "");
    expect(loadBook().contacts).toEqual({});

    const tables = getAppDatabase()
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      )
      .all() as Array<{ name: string }>;
    expect(tables.map((row) => row.name)).toEqual(
      expect.arrayContaining([
        "contacts",
        "pinned_conversations",
        "schema_migrations",
      ]),
    );
  });

  it("imports the legacy JSON book once without deleting it", () => {
    const legacyPath = process.env.IMESSAGE_PDF_LEGACY_CONTACTS_PATH!;
    fs.writeFileSync(
      legacyPath,
      JSON.stringify({
        version: 1,
        contacts: {
          "+15550101111": { name: "Maya" },
          "person@example.com": { name: "Alex", note: "Work" },
        },
      }),
    );

    expect(loadBook().contacts).toEqual({
      "+15550101111": { name: "Maya" },
      "person@example.com": { name: "Alex", note: "Work" },
    });
    expect(fs.existsSync(legacyPath)).toBe(true);

    replaceBook({ "+15550102222": { name: "Jordan" } });
    resetContactsMigrationForTests();
    expect(loadBook().contacts).toEqual({
      "+15550102222": { name: "Jordan" },
    });
  });

  it("persists pins independently for each Messages database", () => {
    setConversationPinned("/backup/a/chat.db", "chat-group", true);
    setConversationPinned("/backup/a/chat.db", "+15550101111", true);
    setConversationPinned("/backup/b/chat.db", "chat-group", true);

    expect(listPinnedConversations("/backup/a/chat.db")).toEqual([
      "+15550101111",
      "chat-group",
    ]);
    expect(listPinnedConversations("/backup/b/chat.db")).toEqual([
      "chat-group",
    ]);

    setConversationPinned("/backup/a/chat.db", "chat-group", false);
    expect(listPinnedConversations("/backup/a/chat.db")).toEqual([
      "+15550101111",
    ]);
  });
});
