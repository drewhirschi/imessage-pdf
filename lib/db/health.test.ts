import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { connectToDatabase, closeDatabase } from "./connection";
import { getDatabaseHealth } from "./queries";
import { createHealthFixtureDb, type HealthFixture } from "../../test/fixture";

let fx: HealthFixture;

beforeAll(() => {
  fx = createHealthFixtureDb();
  closeDatabase();
  connectToDatabase(fx.dbPath);
});

afterAll(() => {
  closeDatabase();
  fx.cleanup();
});

describe("getDatabaseHealth — message text buckets", () => {
  it("reports totals and partitions displayable messages", async () => {
    const h = await getDatabaseHealth();
    // 6 displayable + 1 reaction + 1 sticker
    expect(h.totalMessages).toBe(8);
    expect(h.displayableMessages).toBe(6);
    expect(h.withText).toBe(2);
    expect(h.recoverableText).toBe(3);
    expect(h.trueEmpty).toBe(1);
    expect(h.withText + h.recoverableText + h.trueEmpty).toBe(
      h.displayableMessages
    );
  });
});

describe("getDatabaseHealth — per-year histogram", () => {
  it("groups displayable messages by year, excluding reactions/stickers", async () => {
    const h = await getDatabaseHealth();
    const map = Object.fromEntries(
      h.messagesByYear.map((r) => [r.year, r.count])
    );
    expect(map[2020]).toBe(2);
    expect(map[2021]).toBe(3);
    expect(map[2022]).toBe(1);
    // reaction (2020) and sticker (2021) are NOT counted.
    const totalHistogram = h.messagesByYear.reduce((a, r) => a + r.count, 0);
    expect(totalHistogram).toBe(h.displayableMessages);
  });
});

describe("getDatabaseHealth — attachments", () => {
  it("reports counts and transfer_state / ck_sync_state distributions", async () => {
    const h = await getDatabaseHealth();
    expect(h.attachments.total).toBe(3);
    expect(h.attachments.withFilename).toBe(2);
    const ts = Object.fromEntries(
      h.attachments.byTransferState.map((r) => [r.state, r.count])
    );
    expect(ts[5]).toBe(2);
    expect(ts[0]).toBe(1);
    const ck = Object.fromEntries(
      h.attachments.byCkSyncState.map((r) => [r.state, r.count])
    );
    expect(ck[1]).toBe(2);
    expect(ck[2]).toBe(1);
  });

  it("samples on-disk presence when given an attachmentsPath", async () => {
    const h = await getDatabaseHealth({ attachmentsPath: fx.attachmentsPath });
    expect(h.attachments.onDisk).not.toBeNull();
    expect(h.attachments.onDisk!.sampled).toBe(2);
    expect(h.attachments.onDisk!.present).toBe(1);
    expect(h.attachments.onDisk!.missing).toBe(1);
    expect(h.attachments.onDisk!.estimatedPresent).toBe(1);
  });

  it("omits the on-disk check without an attachmentsPath", async () => {
    const h = await getDatabaseHealth();
    expect(h.attachments.onDisk).toBeNull();
  });
});
