import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { getImagePreview } from "./image-preview";

let tempDir: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "imessage-preview-"));
  process.env.IMESSAGE_PDF_IMAGE_CACHE_DIR = path.join(tempDir, "cache");
});

afterEach(() => {
  delete process.env.IMESSAGE_PDF_IMAGE_CACHE_DIR;
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("getImagePreview", () => {
  it("creates and reuses a display-sized WebP derivative", async () => {
    const source = path.join(tempDir, "large.png");
    await sharp({
      create: {
        width: 1200,
        height: 1800,
        channels: 3,
        background: "#1473e6",
      },
    })
      .png()
      .toFile(source);

    const first = await getImagePreview(source, ".png");
    const second = await getImagePreview(source, ".png");
    expect(second).toEqual(first);

    const metadata = await sharp(first).metadata();
    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBeLessThanOrEqual(520);
    expect(metadata.height).toBeLessThanOrEqual(640);
    expect(fs.readdirSync(process.env.IMESSAGE_PDF_IMAGE_CACHE_DIR!)).toHaveLength(1);
  });
});
