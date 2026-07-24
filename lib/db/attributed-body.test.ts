import { describe, it, expect } from "vitest";
import { decodeAttributedBody } from "./attributed-body";
import {
  hex,
  BLOB_SIMPLE,
  BLOB_SIMPLE_TEXT,
  BLOB_MUTABLE,
  BLOB_MUTABLE_TEXT,
  BLOB_EMOJI,
  BLOB_EMOJI_TEXT,
  BLOB_EMPTY,
} from "../../test/blobs";

/**
 * Build a minimal-but-valid typedstream envelope around `text` so we can test
 * the length-marker variants precisely. Mirrors the real layout:
 *   ...NSString <ver bytes> 2B <len-varint> <utf8 bytes>...
 */
function makeBlob(text: string): Buffer {
  const body = Buffer.from(text, "utf8");
  const header = Buffer.from(
    "040B73747265616D747970656481E803840140848484124E5341747472696275746564537472696E67008484084E534F626A656374008592848484084E53537472696E670194840100",
    "hex"
  );
  const prefix = header.subarray(0, header.length - 2); // up to `01 94 84`
  let lenBytes: Buffer;
  if (body.length <= 0x80) {
    lenBytes = Buffer.from([body.length]);
  } else if (body.length <= 0xffff) {
    const b = Buffer.alloc(3);
    b[0] = 0x81;
    b.writeUInt16LE(body.length, 1);
    lenBytes = b;
  } else {
    const b = Buffer.alloc(5);
    b[0] = 0x82;
    b.writeUInt32LE(body.length, 1);
    lenBytes = b;
  }
  return Buffer.concat([
    prefix,
    Buffer.from([0x2b]),
    lenBytes,
    body,
    Buffer.from([0x86, 0x86]),
  ]);
}

describe("decodeAttributedBody — Tier 1 structured parse", () => {
  it("decodes a simple NSAttributedString blob", () => {
    expect(decodeAttributedBody(hex(BLOB_SIMPLE))).toBe(BLOB_SIMPLE_TEXT);
  });

  it("decodes an NSMutableAttributedString wrapper", () => {
    expect(decodeAttributedBody(hex(BLOB_MUTABLE))).toBe(BLOB_MUTABLE_TEXT);
  });

  it("decodes multi-byte UTF-8 (emoji) at exact byte length", () => {
    expect(decodeAttributedBody(hex(BLOB_EMOJI))).toBe(BLOB_EMOJI_TEXT);
  });

  it("returns null for an empty backing string (attachment placeholder)", () => {
    expect(decodeAttributedBody(hex(BLOB_EMPTY))).toBeNull();
  });
});

describe("decodeAttributedBody — length-marker variants", () => {
  it("reads a 1-byte length (<= 0x80)", () => {
    const text = "a".repeat(120);
    expect(decodeAttributedBody(makeBlob(text))).toBe(text);
  });

  it("reads the boundary length of 128 bytes", () => {
    const text = "b".repeat(128);
    expect(decodeAttributedBody(makeBlob(text))).toBe(text);
  });

  it("reads a 0x81 uint16 length (> 127 bytes)", () => {
    const text = "Long message ".repeat(40); // ~520 bytes
    expect(text.length).toBeGreaterThan(127);
    expect(decodeAttributedBody(makeBlob(text))).toBe(text);
  });

  it("reads a 0x82 uint32 length (> 65535 bytes)", () => {
    const text = "x".repeat(70000);
    expect(decodeAttributedBody(makeBlob(text))).toBe(text);
  });
});

describe("decodeAttributedBody — Tier 2 heuristic fallback", () => {
  it("recovers text when the structured length prefix is corrupt", () => {
    // Valid-looking envelope but the length byte after 2B is bogus (0x7A = 122)
    // which overruns the actual 11-byte body -> structured parse bails, the
    // lenient/heuristic tier recovers the readable run.
    const parts = [
      Buffer.from(
        "040B73747265616D747970656481E80384014084848408" +
          "4E53537472696E67019484012B7A",
        "hex"
      ),
      Buffer.from("hello world", "utf8"),
      Buffer.from([0x86, 0x86]),
    ];
    expect(decodeAttributedBody(Buffer.concat(parts))).toBe("hello world");
  });

  it("returns null for a blob with no recoverable text", () => {
    expect(
      decodeAttributedBody(Buffer.from([0x00, 0x01, 0x02, 0x03]))
    ).toBeNull();
  });

  it("does not mistake typedstream class-name tokens for message text", () => {
    const noise = Buffer.from(
      "040B73747265616D747970656481E803840140848484124E5341747472696275746564537472696E67008484084E534F626A65637400",
      "hex"
    );
    expect(decodeAttributedBody(noise)).toBeNull();
  });
});

describe("decodeAttributedBody — guards", () => {
  it("returns null for null / empty input", () => {
    expect(decodeAttributedBody(null)).toBeNull();
    expect(decodeAttributedBody(undefined)).toBeNull();
    expect(decodeAttributedBody(Buffer.alloc(0))).toBeNull();
  });

  it("accepts a Uint8Array as well as a Buffer", () => {
    const u8 = new Uint8Array(hex(BLOB_SIMPLE));
    expect(decodeAttributedBody(u8)).toBe(BLOB_SIMPLE_TEXT);
  });
});
