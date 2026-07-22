// Decodes the plain text out of an iMessage `attributedBody` blob.
// Apple stores this as a "typedstream"-encoded NSAttributedString. Rather
// than guessing where the text starts/ends by scanning for nearby markers,
// this reads the actual length byte that the format encodes right after
// the "NSString" marker, then pulls out exactly that many bytes as text.
export function decodeAttributedBody(buf: Buffer | null): string | null {
  if (!buf || buf.length === 0) return null;

  try {
    const marker = Buffer.from("NSString");
    const idx = buf.indexOf(marker);
    if (idx === -1) return null;

    // Look for the "+" byte (0x2B) that precedes the string's length
    // prefix. It normally appears within a few bytes of "NSString".
    const searchStart = idx + marker.length;
    const plusIdx = buf.indexOf(0x2b, searchStart);
    if (plusIdx === -1 || plusIdx - searchStart > 10) return null;

    const lengthByteIndex = plusIdx + 1;
    let length = buf[lengthByteIndex];
    let textStart = lengthByteIndex + 1;

    // A length byte of 0x81 means the real length is stored in the next
    // 2 bytes (little-endian) instead of in this single byte.
    if (length === 0x81) {
      length = buf.readUInt16LE(lengthByteIndex + 1);
      textStart = lengthByteIndex + 3;
    }

    if (!length || length <= 0 || textStart + length > buf.length) {
      return null;
    }

    const text = buf
      .subarray(textStart, textStart + length)
      .toString("utf8")
      .trim();

    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}
