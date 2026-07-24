/**
 * Decoder for the `attributedBody` column of the iMessage `message` table.
 *
 * Modern iMessage stores the message body as an `NSAttributedString` archived
 * with the legacy NeXTSTEP `typedstream` format, and leaves the plain `text`
 * column NULL. To recover the text we walk the typedstream just far enough to
 * find the backing `NSString` and read its bytes.
 *
 * Failure tiers (see `decodeAttributedBody`):
 *   Tier 1 — structured parse: anchor on the `NSString` class name, find the
 *            `+` (0x2B) byte-content marker, read the typedstream length varint
 *            (1-byte, or 0x81 = uint16 LE, 0x82 = uint32 LE), slice UTF-8.
 *   Tier 2 — heuristic fallback: if the structured parse can't anchor or the
 *            length is out of bounds / decodes to invalid UTF-8 (corrupt or
 *            truncated blob), recover the longest run of natural-looking text.
 *
 * The format was reverse-engineered from a real backup; the length-marker
 * encoding was verified against messages whose UTF-8 body exceeds 127 bytes
 * (encoded as `2B 81 <uint16 LE>`).
 */

// typedstream tokens we never want the heuristic tier to mistake for message text.
const TYPEDSTREAM_TOKENS = new Set([
  "streamtyped",
  "NSString",
  "NSMutableString",
  "NSObject",
  "NSAttributedString",
  "NSMutableAttributedString",
  "NSDictionary",
  "NSMutableDictionary",
  "NSNumber",
  "NSValue",
  "__kIMMessagePartAttributeName",
  "__kIMBaseWritingDirectionAttributeName",
  "__kIMFileTransferGUIDAttributeName",
  "__kIMDataDetectedAttributeName",
  "__kIMLinkAttributeName",
  "iI",
]);

const REPLACEMENT_CHAR = "�";

interface LengthRead {
  value: number;
  next: number;
}

/**
 * Read a typedstream length/integer starting at `pos`.
 * - byte <= 0x80 -> literal length (0..128)
 * - 0x81         -> next 2 bytes little-endian uint16
 * - 0x82         -> next 4 bytes little-endian uint32
 * Returns null on truncation or an unrecognised marker.
 */
function readTypedstreamLength(buf: Buffer, pos: number): LengthRead | null {
  if (pos >= buf.length) return null;
  const b = buf[pos];
  if (b <= 0x80) {
    return { value: b, next: pos + 1 };
  }
  if (b === 0x81) {
    if (pos + 2 >= buf.length) return null;
    return { value: buf.readUInt16LE(pos + 1), next: pos + 3 };
  }
  if (b === 0x82) {
    if (pos + 4 >= buf.length) return null;
    return { value: buf.readUInt32LE(pos + 1), next: pos + 5 };
  }
  return null;
}

interface Located {
  /** byte offset of the first content byte after the length prefix */
  start: number;
  /** declared length from the varint */
  declaredLen: number;
}

/** Locate the NSString content region: anchor + `+` marker + length varint. */
function locateString(buf: Buffer): Located | null {
  const anchor = buf.indexOf("NSString", 0, "latin1");
  if (anchor === -1) return null;
  // The class name is followed by a few version/inheritance bytes and then the
  // `+` (0x2B) marker that introduces the length-prefixed byte content.
  const plus = buf.indexOf(0x2b, anchor + "NSString".length);
  if (plus === -1) return null;
  const len = readTypedstreamLength(buf, plus + 1);
  if (!len || len.value < 0) return null;
  return { start: len.next, declaredLen: len.value };
}

/** Tier 1: strict structured parse — declared length must fit and decode cleanly. */
function parseStrict(buf: Buffer, loc: Located): string | null {
  const end = loc.start + loc.declaredLen;
  if (end > buf.length) return null;
  const decoded = buf.subarray(loc.start, end).toString("utf8");
  // A U+FFFD replacement char means we sliced across a UTF-8 boundary, i.e. we
  // latched onto the wrong marker. Fall through to the more forgiving tiers.
  if (decoded.includes(REPLACEMENT_CHAR)) return null;
  return decoded;
}

/**
 * Tier 2: lenient structured parse for truncated / mis-sized blobs. We still
 * trust the content start offset but clamp the length to what's actually
 * present and strip the trailing typedstream marker noise.
 */
function parseLenient(buf: Buffer, loc: Located): string | null {
  const end = Math.min(loc.start + loc.declaredLen, buf.length);
  if (end <= loc.start) return null;
  let decoded = buf.subarray(loc.start, end).toString("utf8");
  // Drop everything from the first replacement char onward (trailing binary).
  const cut = decoded.indexOf(REPLACEMENT_CHAR);
  if (cut !== -1) decoded = decoded.slice(0, cut);
  decoded = decoded.trim();
  return decoded.length >= 2 ? decoded : null;
}

/**
 * Tier 3: printable-run heuristic for blobs with no usable NSString anchor.
 * Returns the longest run of natural-looking text that isn't a typedstream token.
 */
function parsePrintableRuns(buf: Buffer): string | null {
  const text = buf.toString("utf8");
  // Split on control characters (NUL through US, 0x00-0x1F).
  const runs = text.split(/[\x00-\x1f]+/);
  let best = "";
  for (const raw of runs) {
    const cleaned = raw.split(REPLACEMENT_CHAR).join("").trim();
    if (cleaned.length < 2) continue;
    if (TYPEDSTREAM_TOKENS.has(cleaned)) continue;
    // Skip runs that are a single class-name-ish token (capitalised, no spaces).
    if (!cleaned.includes(" ") && /^[A-Z][A-Za-z0-9]*$/.test(cleaned)) continue;
    // Fuzzy-reject near-misses of typedstream vocabulary: exact-token matching
    // misses runs where one byte was corrupted or a marker byte glued two
    // tokens together ("NSStri@g", "@SAttributedString", "streamtyped@").
    if (/streamtyped|NS[A-Z]|__kIM|CFAttributed|Attribute(Name|dString)/.test(cleaned)) continue;
    // Require natural-text shape: real message fragments contain a space or
    // are mostly lowercase; identifier-shaped soup is never message text.
    if (!cleaned.includes(" ")) {
      const lower = (cleaned.match(/[a-z]/g) ?? []).length;
      if (lower / cleaned.length < 0.5) continue;
    }
    if (cleaned.length > best.length) best = cleaned;
  }
  return best.length ? best : null;
}

/**
 * Decode an `attributedBody` BLOB to its plain-text message body.
 * Returns null when the blob is empty, missing, or yields no recoverable text
 * (e.g. attachment-only messages whose backing string is empty).
 */
export function decodeAttributedBody(
  input: Buffer | Uint8Array | null | undefined
): string | null {
  if (!input || input.length === 0) return null;
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);

  const loc = locateString(buf);
  if (loc) {
    const strict = parseStrict(buf, loc);
    if (strict !== null) return strict.length ? strict : null;
    const lenient = parseLenient(buf, loc);
    if (lenient) return lenient;
  }

  return parsePrintableRuns(buf);
}
