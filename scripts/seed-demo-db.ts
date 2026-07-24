/**
 * Build a self-contained demo Messages backup covering the full media matrix
 * the renderer supports: text/emoji/long text, links (rich, bare, trailing,
 * inline), single portrait/landscape images, a multi-image grid, video, vCard,
 * shared location, a generic file, all six tapback types (incl. stacked
 * reactions), a 4-person group chat with unresolved handles, attributedBody-
 * only messages, and >15-minute gaps for timestamp separators.
 *
 * Usage:
 *   NODE_OPTIONS=--experimental-sqlite pnpm exec node --experimental-strip-types scripts/seed-demo-db.ts [outDir]
 *
 * Default outDir: .demo/ (gitignored). Produces outDir/chat.db and
 * outDir/Attachments/. Point the app at outDir (the backup-folder shape) or at
 * the two paths explicitly. Purely synthetic data — safe to share.
 */
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { unixToImessageTimestamp } from "../lib/utils/timestamp.ts";
import { hex, BLOB_SIMPLE, BLOB_EMOJI } from "../test/blobs.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(process.argv[2] ?? join(repoRoot, ".demo"));
const attDir = join(outDir, "Attachments");

rmSync(outDir, { recursive: true, force: true });
mkdirSync(join(attDir, "demo"), { recursive: true });

// ---------------------------------------------------------------- attachments

async function makeImage(
  name: string,
  w: number,
  h: number,
  color: { r: number; g: number; b: number },
  label: string
) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="100%" height="100%" fill="rgb(${color.r},${color.g},${color.b})"/>
    <circle cx="${w / 2}" cy="${h / 2.6}" r="${Math.min(w, h) / 5}" fill="rgba(255,255,255,0.35)"/>
    <text x="50%" y="88%" font-family="sans-serif" font-size="${Math.min(w, h) / 12}"
      fill="#fff" text-anchor="middle">${label}</text>
  </svg>`;
  await sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toFile(join(attDir, "demo", name));
}

function makeVideo(name: string) {
  try {
    execFileSync("ffmpeg", [
      "-y", "-loglevel", "error",
      "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=24:duration=2",
      "-pix_fmt", "yuv420p", "-movflags", "+faststart",
      join(attDir, "demo", name),
    ]);
    return true;
  } catch {
    console.warn("ffmpeg unavailable — skipping video attachment");
    return false;
  }
}

const VCARD = `BEGIN:VCARD
VERSION:3.0
N:Appleseed;Johnny;;;
FN:Johnny Appleseed
ORG:Orchard Supply Co.
TEL;type=CELL;type=VOICE;type=pref:+1 (555) 010-7777
EMAIL;type=INTERNET;type=pref:johnny@example.com
END:VCARD
`;

const LOC_VCARD = `BEGIN:VCARD
VERSION:3.0
N:;Current Location;;;
FN:Current Location
item1.URL;type=pref:http://maps.apple.com/?ll=40.252414\\,-111.661599&q=40.252414\\,-111.661599
END:VCARD
`;

// ------------------------------------------------------------------ database

const db = new DatabaseSync(join(outDir, "chat.db"));
db.exec(`
  CREATE TABLE chat (
    ROWID INTEGER PRIMARY KEY, chat_identifier TEXT, display_name TEXT,
    group_id TEXT, is_archived INTEGER DEFAULT 0
  );
  CREATE TABLE handle (ROWID INTEGER PRIMARY KEY, id TEXT, service TEXT);
  CREATE TABLE message (
    ROWID INTEGER PRIMARY KEY, guid TEXT, text TEXT, attributedBody BLOB,
    payload_data BLOB, handle_id INTEGER, is_from_me INTEGER DEFAULT 0,
    date INTEGER, associated_message_type INTEGER,
    associated_message_guid TEXT, service TEXT
  );
  CREATE TABLE attachment (
    ROWID INTEGER PRIMARY KEY, filename TEXT, mime_type TEXT,
    transfer_name TEXT, transfer_state INTEGER DEFAULT 5, ck_sync_state INTEGER DEFAULT 1
  );
  CREATE TABLE chat_message_join (chat_id INTEGER, message_id INTEGER);
  CREATE TABLE chat_handle_join (chat_id INTEGER, handle_id INTEGER);
  CREATE TABLE message_attachment_join (message_id INTEGER, attachment_id INTEGER);
`);

const HANDLES = [
  [1, "+15550101111"], // "Maya" if the user names her
  [2, "+15550102222"],
  [3, "+15550103333"],
  [4, "maya@example.com"],
] as const;
for (const [rowid, id] of HANDLES) {
  db.prepare("INSERT INTO handle (ROWID, id, service) VALUES (?, ?, 'iMessage')").run(rowid, id);
}

db.exec(`
  INSERT INTO chat (ROWID, chat_identifier, display_name, group_id) VALUES
    (1, '+15550101111', '', NULL),
    (2, '+15550102222', '', NULL),
    (3, '+15550103333', '', NULL),
    (4, 'demo-group', 'Trip Planning', 'demo-grp');
  INSERT INTO chat_handle_join (chat_id, handle_id) VALUES
    (1, 1), (2, 2), (3, 3), (4, 1), (4, 2), (4, 4);
`);

let msgId = 0;
let attId = 0;
// Base: a fixed reference day so output is deterministic-ish per run.
let clock = Date.UTC(2024, 4, 11, 16, 3, 0); // 2024-05-11

const insMsg = db.prepare(`INSERT INTO message
  (ROWID, guid, text, attributedBody, payload_data, handle_id, is_from_me, date,
   associated_message_type, associated_message_guid, service)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'iMessage')`);
const insCMJ = db.prepare("INSERT INTO chat_message_join VALUES (?, ?)");
const insAtt = db.prepare(
  "INSERT INTO attachment (ROWID, filename, mime_type, transfer_name) VALUES (?, ?, ?, ?)"
);
const insMAJ = db.prepare("INSERT INTO message_attachment_join VALUES (?, ?)");

interface MsgOpts {
  chat: number;
  from?: number; // handle ROWID; omit for is_from_me
  text?: string | null;
  attributedBody?: Buffer;
  payload?: Buffer;
  gapMin?: number; // minutes since previous message
  attachments?: { file: string; mime: string }[];
  reactions?: { type: number; from?: number }[]; // 2000-2005
}

// Real-shaped UUID GUIDs — the reaction-grouping code extracts targets by
// matching the standard 36-char UUID inside associated_message_guid.
function guidFor(rowid: number): string {
  return `${rowid.toString(16).padStart(8, "0").toUpperCase()}-DE00-4000-8000-C0FFEE000000`;
}

function msg(o: MsgOpts): string {
  clock += (o.gapMin ?? 1.5) * 60_000;
  const rowid = ++msgId;
  const guid = guidFor(rowid);
  insMsg.run(
    rowid, guid, o.text ?? null, o.attributedBody ?? null, o.payload ?? null,
    o.from ?? 0, o.from ? 0 : 1, unixToImessageTimestamp(clock / 1000), 0, null
  );
  insCMJ.run(o.chat, rowid);
  for (const a of o.attachments ?? []) {
    const aid = ++attId;
    insAtt.run(aid, `~/Library/Messages/Attachments/demo/${a.file}`, a.mime, a.file);
    insMAJ.run(rowid, aid);
  }
  for (const r of o.reactions ?? []) {
    const rid = ++msgId;
    insMsg.run(
      rid, guidFor(rid), null, null, null, r.from ?? 0, r.from ? 0 : 1,
      unixToImessageTimestamp((clock + 30_000) / 1000), r.type, `p:0/${guid}`
    );
    insCMJ.run(o.chat, rid);
  }
  return guid;
}

async function main() {
  // Attachment source files.
  await makeImage("portrait.jpeg", 720, 1280, { r: 88, g: 120, b: 200 }, "portrait screenshot");
  await makeImage("landscape.jpeg", 1280, 720, { r: 214, g: 130, b: 60 }, "landscape photo");
  await makeImage("grid-1.jpeg", 900, 900, { r: 90, g: 170, b: 110 }, "grid 1");
  await makeImage("grid-2.jpeg", 900, 900, { r: 170, g: 90, b: 150 }, "grid 2");
  await makeImage("grid-3.jpeg", 900, 900, { r: 220, g: 190, b: 70 }, "grid 3");
  const hasVideo = makeVideo("clip.mp4");
  writeFileSync(join(attDir, "demo", "Johnny Appleseed.vcf"), VCARD);
  writeFileSync(join(attDir, "demo", "CL.loc.vcf"), LOC_VCARD);
  writeFileSync(join(attDir, "demo", "itinerary.pdf"), "%PDF-1.4\n%demo placeholder\n%%EOF\n");

  const richLinks = JSON.parse(
    readFileSync(join(repoRoot, "lib/link-preview/__fixtures__/rich-links.json"), "utf8")
  ) as Record<string, string>;
  const richBlob = Buffer.from(Object.values(richLinks)[0], "base64");

  // ---- Chat 1: text & links -------------------------------------------------
  msg({ chat: 1, from: 1, text: "Hey! Are we still on for Saturday?" });
  msg({ chat: 1, text: "Yes! Can't wait 🎉", reactions: [{ type: 2000, from: 1 }] });
  msg({ chat: 1, from: 1, text: "Perfect. I was thinking we could try that new trail — the one that loops around the reservoir and comes back past the orchard. It's supposed to be about six miles round trip, mostly shade, and there's a swimming spot about halfway if it's warm enough.", gapMin: 3 });
  msg({ chat: 1, text: "😍😍😍" });
  // Rich link (payload_data, NULL text) — renders as a LinkCard with real title.
  msg({ chat: 1, from: 1, payload: richBlob, gapMin: 22 });
  // Bare URL, no payload — domain card.
  msg({ chat: 1, text: "https://www.alltrails.com/trail/us/utah/reservoir-loop" });
  // Text + trailing URL — linkified text, no card.
  msg({ chat: 1, from: 1, text: "Forecast looks great btw https://weather.example.com/saturday" });
  // Inline URL mid-sentence.
  msg({ chat: 1, text: "Book at https://example.com/reserve?slot=9am before they fill up, then send me the confirmation." });
  // attributedBody-only messages (the Ventura NULL-text case).
  msg({ chat: 1, from: 1, attributedBody: hex(BLOB_SIMPLE), gapMin: 47 });
  msg({ chat: 1, attributedBody: hex(BLOB_EMOJI) });

  // ---- Chat 2: media --------------------------------------------------------
  msg({ chat: 2, from: 2, text: "Look at this sunset from the ridge", attachments: [{ file: "landscape.jpeg", mime: "image/jpeg" }] });
  msg({ chat: 2, text: "Stunning!!", reactions: [{ type: 2005, from: 2 }] });
  // Portrait screenshot — height-cap case.
  msg({ chat: 2, from: 2, attachments: [{ file: "portrait.jpeg", mime: "image/jpeg" }], gapMin: 19, reactions: [{ type: 2001 }] });
  // Multi-image grid.
  msg({ chat: 2, text: "Photo dump from today", attachments: [
    { file: "grid-1.jpeg", mime: "image/jpeg" },
    { file: "grid-2.jpeg", mime: "image/jpeg" },
    { file: "grid-3.jpeg", mime: "image/jpeg" },
  ] });
  if (hasVideo) {
    msg({ chat: 2, from: 2, text: "And a little clip", attachments: [{ file: "clip.mp4", mime: "video/mp4" }], gapMin: 4 });
  }
  // Generic file fallback.
  msg({ chat: 2, text: "Here's the itinerary", attachments: [{ file: "itinerary.pdf", mime: "application/pdf" }], gapMin: 26 });

  // ---- Chat 3: cards --------------------------------------------------------
  msg({ chat: 3, from: 3, text: "You should call Johnny about the fence" });
  msg({ chat: 3, from: 3, attachments: [{ file: "Johnny Appleseed.vcf", mime: "text/vcard" }] });
  msg({ chat: 3, text: "On it — I'm here if you need me", gapMin: 12 });
  msg({ chat: 3, attachments: [{ file: "CL.loc.vcf", mime: "text/x-vlocation" }] });

  // ---- Chat 4: group chat, all six tapbacks, stacked reactions --------------
  msg({ chat: 4, from: 1, text: "Ok flights are booked!! 🛫" });
  const stacked = msg({ chat: 4, from: 2, text: "I made a shared doc for packing — add whatever you think of" });
  // Stacked reactions on one message from three different people.
  db.prepare("SELECT 1").get(); // no-op keeps ordering obvious
  msg({ chat: 4, text: "Who's picking up the rental car?", gapMin: 17, reactions: [{ type: 2005, from: 4 }] });
  msg({ chat: 4, from: 4, text: "I can! My flight lands first" });
  msg({ chat: 4, from: 1, text: "Wait actually maybe we should just take the train instead?" , reactions: [{ type: 2003, from: 2 }, { type: 2002 }] });
  msg({ chat: 4, from: 2, text: "Noooo the train takes four hours" });
  msg({ chat: 4, text: "Car it is. Everyone good?", gapMin: 8 });
  // Attach the stacked tapbacks (heart, thumbs up, laugh) to the doc message.
  for (const [type, from] of [[2000, 1], [2001, 4], [2003, undefined]] as const) {
    const rid = ++msgId;
    insMsg.run(rid, guidFor(rid), null, null, null, from ?? 0, from ? 0 : 1,
      unixToImessageTimestamp((clock + 60_000) / 1000), type, `p:0/${stacked}`);
    insCMJ.run(4, rid);
  }

  db.close();
  console.log(`Demo backup written to ${outDir}`);
  console.log(`  dbPath:          ${join(outDir, "chat.db")}`);
  console.log(`  attachmentsPath: ${attDir}`);
}

main();
