import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import convert from "heic-convert";
import sharp from "sharp";

const pending = new Map<string, Promise<Buffer>>();

function cacheDirectory(): string {
  return (
    process.env.IMESSAGE_PDF_IMAGE_CACHE_DIR ??
    path.join(homedir(), ".imessage-pdf", "cache", "image-previews")
  );
}

export async function getImagePreview(
  fullPath: string,
  extension: string,
): Promise<Buffer> {
  const stat = fs.statSync(fullPath);
  const key = createHash("sha256")
    .update(`${fullPath}:${stat.mtimeMs}:${stat.size}:520x640:webp82`)
    .digest("hex");
  const outputPath = path.join(cacheDirectory(), `${key}.webp`);

  if (fs.existsSync(outputPath)) return fs.readFileSync(outputPath);
  const active = pending.get(outputPath);
  if (active) return active;

  const task = (async () => {
    let input: Buffer = fs.readFileSync(fullPath);
    if (extension === ".heic" || extension === ".heif") {
      const converted = await convert({
        buffer: input as unknown as ArrayBufferLike,
        format: "JPEG",
        quality: 0.9,
      });
      input = Buffer.from(converted);
    }

    const preview = await sharp(input)
      .rotate()
      .resize({
        width: 520,
        height: 640,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toBuffer();

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    const tempPath = `${outputPath}.${process.pid}.tmp`;
    fs.writeFileSync(tempPath, preview);
    fs.renameSync(tempPath, outputPath);
    return preview;
  })();

  pending.set(outputPath, task);
  try {
    return await task;
  } finally {
    pending.delete(outputPath);
  }
}
