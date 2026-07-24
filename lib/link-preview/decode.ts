// Decode `message.payload_data` for rich URL previews.
//
// iMessage stores the "rich link" (LPLinkMetadata) for a URL message as an
// NSKeyedArchiver binary-plist blob in `message.payload_data`. For those
// messages `message.text` is usually NULL — the URL, title and site name only
// exist inside this blob. We parse just enough of the bplist + NSKeyedArchiver
// graph to pull out the original URL and its title. No network access.
//
// Everything here is pure and deterministic so it can be unit tested against
// real fixtures extracted from a chat.db (see decode.test.ts).

export interface RichLink {
  /** The canonical URL the preview points at. */
  url: string;
  /** Human title of the linked page, if the archive carried one. */
  title?: string;
  /** Site name / summary, if present. */
  siteName?: string;
  summary?: string;
}

/** Marker for an NSKeyedArchiver `UID` object (an index into `$objects`). */
interface Uid {
  __uid: number;
}

function isUid(v: unknown): v is Uid {
  return typeof v === "object" && v !== null && "__uid" in v;
}

type PlistValue =
  | null
  | boolean
  | number
  | string
  | Buffer
  | Uid
  | PlistValue[]
  | { [key: string]: PlistValue };

function readUInt(buf: Buffer, off: number, size: number): number {
  let v = 0;
  for (let i = 0; i < size; i++) v = v * 256 + buf.readUInt8(off + i);
  return v;
}

/**
 * Parse an Apple binary property list (`bplist00`) into a JS value. NSKeyedArchiver
 * `UID` markers are preserved as `{ __uid }` so the caller can walk the object graph.
 */
export function parseBinaryPlist(buf: Buffer): PlistValue {
  if (buf.length < 40 || buf.toString("latin1", 0, 8) !== "bplist00") {
    throw new Error("not a binary plist");
  }

  const trailer = buf.subarray(buf.length - 32);
  const offsetSize = trailer.readUInt8(6);
  const objectRefSize = trailer.readUInt8(7);
  const numObjects = Number(trailer.readBigUInt64BE(8));
  const topObject = Number(trailer.readBigUInt64BE(16));
  const offsetTableOffset = Number(trailer.readBigUInt64BE(24));

  const offsets: number[] = [];
  for (let i = 0; i < numObjects; i++) {
    offsets.push(readUInt(buf, offsetTableOffset + i * offsetSize, offsetSize));
  }

  const cache = new Map<number, PlistValue>();

  // For markers with objInfo === 0xf the real count is stored inline as an int.
  function readLength(off: number, objInfo: number): [count: number, dataOff: number] {
    if (objInfo !== 0x0f) return [objInfo, off + 1];
    const intMarker = buf.readUInt8(off + 1);
    const intLen = 1 << (intMarker & 0x0f);
    const count = readUInt(buf, off + 2, intLen);
    return [count, off + 2 + intLen];
  }

  function parse(index: number): PlistValue {
    if (cache.has(index)) return cache.get(index)!;
    const off = offsets[index];
    const marker = buf.readUInt8(off);
    const objType = marker >> 4;
    const objInfo = marker & 0x0f;
    let result: PlistValue;

    switch (objType) {
      case 0x0: // singletons
        result = marker === 0x08 ? false : marker === 0x09 ? true : null;
        break;
      case 0x1: {
        // int: 2^objInfo bytes, big-endian. 8-byte ints are signed.
        const len = 1 << objInfo;
        if (len === 8) result = Number(buf.readBigInt64BE(off + 1));
        else result = readUInt(buf, off + 1, len);
        break;
      }
      case 0x2: // real
        result = 1 << objInfo === 4 ? buf.readFloatBE(off + 1) : buf.readDoubleBE(off + 1);
        break;
      case 0x3: // date (double seconds since 2001)
        result = buf.readDoubleBE(off + 1);
        break;
      case 0x4: {
        // data
        const [len, dataOff] = readLength(off, objInfo);
        result = buf.subarray(dataOff, dataOff + len);
        break;
      }
      case 0x5: {
        // ASCII string
        const [len, dataOff] = readLength(off, objInfo);
        result = buf.toString("latin1", dataOff, dataOff + len);
        break;
      }
      case 0x6: {
        // UTF-16BE string (length is in code units)
        const [len, dataOff] = readLength(off, objInfo);
        const slice = Buffer.from(buf.subarray(dataOff, dataOff + len * 2));
        slice.swap16(); // BE -> LE for Node's utf16le decoder
        result = slice.toString("utf16le");
        break;
      }
      case 0x8: {
        // UID (NSKeyedArchiver reference)
        const len = objInfo + 1;
        result = { __uid: readUInt(buf, off + 1, len) };
        break;
      }
      case 0xa:
      case 0xc: {
        // array / set
        const [count, dataOff] = readLength(off, objInfo);
        const arr: PlistValue[] = [];
        cache.set(index, arr);
        for (let i = 0; i < count; i++) {
          arr.push(parse(readUInt(buf, dataOff + i * objectRefSize, objectRefSize)));
        }
        return arr;
      }
      case 0xd: {
        // dict
        const [count, dataOff] = readLength(off, objInfo);
        const dict: { [key: string]: PlistValue } = {};
        cache.set(index, dict);
        for (let i = 0; i < count; i++) {
          const key = parse(readUInt(buf, dataOff + i * objectRefSize, objectRefSize));
          const val = parse(
            readUInt(buf, dataOff + (count + i) * objectRefSize, objectRefSize),
          );
          if (typeof key === "string") dict[key] = val;
        }
        return dict;
      }
      default:
        result = null;
    }

    cache.set(index, result);
    return result;
  }

  return parse(topObject);
}

function asRecord(v: PlistValue): { [key: string]: PlistValue } | null {
  return typeof v === "object" && v !== null && !Array.isArray(v) && !Buffer.isBuffer(v)
    ? (v as { [key: string]: PlistValue })
    : null;
}

/**
 * Decode a `payload_data` blob into a {@link RichLink}, or `null` when the blob is
 * absent/unparseable or carries no usable URL.
 */
export function decodeRichLink(payload: Buffer | null | undefined): RichLink | null {
  if (!payload || payload.length === 0) return null;
  let root: { [key: string]: PlistValue } | null;
  try {
    const top = asRecord(parseBinaryPlist(payload));
    const objects = top?.["$objects"];
    if (!top || !Array.isArray(objects)) return null;

    const deref = (v: PlistValue): PlistValue => (isUid(v) ? objects[v.__uid] : v);

    const topDict = asRecord(deref(top["$top"]));
    const rootRef = topDict?.["root"];
    root = asRecord(rootRef ? deref(rootRef) : null);
    if (!root) return null;

    // The archived root is a RichLink wrapper; the LPLinkMetadata (with the URL
    // and title) hangs off `richLinkMetadata`. Descend when present.
    if (root["richLinkMetadata"]) {
      const meta = asRecord(deref(root["richLinkMetadata"]));
      if (meta) root = meta;
    }

    // NSURL is archived as a dict with NS.relative (+ optional NS.base).
    const readUrl = (ref: PlistValue): string | undefined => {
      const urlObj = asRecord(deref(ref));
      if (!urlObj) return undefined;
      const rel = deref(urlObj["NS.relative"]);
      const base = deref(urlObj["NS.base"]);
      const relStr = typeof rel === "string" ? rel : undefined;
      const baseStr = typeof base === "string" ? base : undefined;
      if (relStr && /^[a-z][a-z0-9+.-]*:\/\//i.test(relStr)) return relStr;
      if (baseStr && relStr) return baseStr.replace(/\/+$/, "") + "/" + relStr.replace(/^\/+/, "");
      return relStr ?? baseStr;
    };

    const readStr = (ref: PlistValue): string | undefined => {
      const v = deref(ref);
      return typeof v === "string" && v.length > 0 ? v : undefined;
    };

    const url = readUrl(root["originalURL"]) ?? readUrl(root["URL"]);
    if (!url) return null;

    const link: RichLink = { url };
    const title = readStr(root["title"]);
    if (title) link.title = title;
    const siteName = readStr(root["siteName"]);
    if (siteName) link.siteName = siteName;
    const summary = readStr(root["summary"]);
    if (summary) link.summary = summary;
    return link;
  } catch {
    return null;
  }
}
