import { DatabaseSync } from "node:sqlite";

/**
 * Thin better-sqlite3-compatible adapter over Node's built-in `node:sqlite`.
 *
 * Why the adapter exists:
 * - `node:sqlite` throws `ERR_OUT_OF_RANGE` when an integer column exceeds
 *   `Number.MAX_SAFE_INTEGER`. iMessage stores dates as nanoseconds since
 *   2001-01-01, which are ~7.8e17 — well past the safe range. We enable
 *   `setReadBigInts(true)` on every statement and coerce BigInt back to
 *   Number at the boundary. This reproduces better-sqlite3's default
 *   behavior exactly (lossy doubles for huge ints), so the rest of the app
 *   — which does `timestamp / 1e9` math and `JSON.stringify` — is unchanged.
 * - The old code used `db.prepare(sql).get(...)/.all(...)`; this adapter keeps
 *   that surface so `queries.ts` and the API routes need no changes.
 *
 * node:sqlite is stable in Node 24. On Node 22 it lives behind
 * `--experimental-sqlite` (injected via NODE_OPTIONS in package.json scripts).
 */

interface PreparedStatement {
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  run(...params: unknown[]): unknown;
}

export interface DbHandle {
  prepare(sql: string): PreparedStatement;
  close(): void;
}

function normalizeRow(row: unknown): unknown {
  if (row == null || typeof row !== "object") {
    return row;
  }
  const record = row as Record<string, unknown>;
  for (const key in record) {
    if (typeof record[key] === "bigint") {
      // Number() on an out-of-safe-range BigInt yields a lossy double,
      // matching better-sqlite3's default read behavior.
      record[key] = Number(record[key]);
    } else if (record[key] instanceof Uint8Array && !Buffer.isBuffer(record[key])) {
      // node:sqlite returns BLOBs as Uint8Array; better-sqlite3 returned
      // Buffer, and JSON payload shapes differ between the two.
      record[key] = Buffer.from(record[key] as Uint8Array);
    }
  }
  return record;
}

function wrap(database: DatabaseSync): DbHandle {
  return {
    prepare(sql: string): PreparedStatement {
      const stmt = database.prepare(sql);
      stmt.setReadBigInts(true);
      return {
        get: (...params: unknown[]) =>
          normalizeRow(stmt.get(...(params as never[]))),
        all: (...params: unknown[]) =>
          stmt.all(...(params as never[])).map(normalizeRow),
        run: (...params: unknown[]) => stmt.run(...(params as never[])),
      };
    },
    close(): void {
      database.close();
    },
  };
}

let db: DbHandle | null = null;
let connectedPath: string | null = null;

export function connectToDatabase(dbPath: string): DbHandle {
  // Reuse only when it's the same file; a changed path (user switched
  // databases) must reconnect, or every query silently reads the old db.
  if (db && connectedPath === dbPath) {
    return db;
  }
  if (db) {
    db.close();
    db = null;
    connectedPath = null;
  }

  try {
    const database = new DatabaseSync(dbPath, { readOnly: true });
    // Defense in depth: readOnly prevents filesystem writes at open time;
    // query_only also makes SQLite reject writes issued through this handle.
    database.exec("PRAGMA query_only = ON");
    db = wrap(database);
    connectedPath = dbPath;
    return db;
  } catch (error) {
    console.error("Failed to connect to database:", error);
    throw new Error(`Failed to connect to database at ${dbPath}`);
  }
}

export function getDatabase(): DbHandle {
  if (!db) {
    throw new Error("Database not connected. Call connectToDatabase first.");
  }
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    connectedPath = null;
  }
}

export function isConnected(): boolean {
  return db !== null;
}
