import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  connectToDatabase,
  closeDatabase,
  getDatabase,
  isConnected,
} from "./connection";
import { createFixtureDb, TS, type Fixture } from "../../test/fixture";

let fixture: Fixture;

beforeAll(() => {
  fixture = createFixtureDb();
  closeDatabase();
});

afterAll(() => {
  closeDatabase();
  fixture.cleanup();
});

describe("connection (node:sqlite adapter)", () => {
  it("connects read-only and reports connection state", () => {
    expect(isConnected()).toBe(false);
    const db = connectToDatabase(fixture.dbPath);
    expect(isConnected()).toBe(true);
    expect(db).toBe(getDatabase());
  });

  it("rejects writes on the read-only handle", () => {
    const db = getDatabase();
    const pragma = db.prepare("PRAGMA query_only").get() as {
      query_only: number;
    };
    expect(pragma.query_only).toBe(1);
    expect(() => db.prepare("CREATE TABLE zzz (x INTEGER)").run()).toThrow(
      /readonly/i
    );
    expect(() =>
      db.prepare("INSERT INTO chat (chat_identifier) VALUES ('x')").run()
    ).toThrow(/readonly/i);
  });

  it("normalizes out-of-safe-range integers to JS numbers", () => {
    const db = getDatabase();
    const row = db
      .prepare("SELECT date FROM message WHERE ROWID = ?")
      .get(12) as { date: number };
    // TS.t4 exceeds Number.MAX_SAFE_INTEGER; node:sqlite would throw
    // without setReadBigInts, and returns BigInt with it. The adapter
    // must hand back a plain number (lossy, like better-sqlite3).
    expect(typeof row.date).toBe("number");
    expect(row.date).toBeGreaterThan(Number.MAX_SAFE_INTEGER);
    expect(row.date).toBeCloseTo(TS.t4, -6);
  });

  it("returns BLOB columns as Buffer, matching better-sqlite3", () => {
    const db = getDatabase();
    const row = db
      .prepare("SELECT CAST(x'0401AB' AS BLOB) AS blob")
      .get() as { blob: unknown };
    // node:sqlite hands back Uint8Array; the adapter must convert to Buffer
    // so JSON payload shapes ({type:'Buffer',data:[...]}) stay unchanged.
    expect(Buffer.isBuffer(row.blob)).toBe(true);
    expect(row.blob).toEqual(Buffer.from([0x04, 0x01, 0xab]));
  });

  it("closeDatabase tears down the singleton", () => {
    expect(isConnected()).toBe(true);
    closeDatabase();
    expect(isConnected()).toBe(false);
    expect(() => getDatabase()).toThrow(/not connected/i);
  });
});
