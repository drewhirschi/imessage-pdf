export type ParsedVCard =
  | {
      kind: "contact";
      fn: string | null;
      org: string | null;
      tel: VCardPhone[];
      email: string[];
      photoDataUrl: string | null;
    }
  | {
      kind: "location";
      label: string;
      lat: number;
      lng: number;
      mapsUrl: string;
    };

export interface VCardPhone {
  number: string;
  type: string | null;
}

function unescape(v: string): string {
  return v.replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\n/gi, "\n");
}

function unfold(raw: string): string[] {
  // RFC2426 line folding: a CRLF followed by a single whitespace is a continuation.
  const normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  const out: string[] = [];
  for (const line of lines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length > 0) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out.filter((l) => l.length > 0);
}

interface ParsedLine {
  name: string;
  params: Record<string, string[]>;
  value: string;
}

function parseLine(line: string): ParsedLine | null {
  const colon = line.indexOf(":");
  if (colon === -1) return null;
  const left = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const parts = left.split(";");
  const head = parts[0];
  const dot = head.indexOf(".");
  const name = (dot === -1 ? head : head.slice(dot + 1)).toUpperCase();
  const params: Record<string, string[]> = {};
  for (let i = 1; i < parts.length; i++) {
    const p = parts[i];
    const eq = p.indexOf("=");
    if (eq === -1) {
      const k = "TYPE";
      (params[k] ??= []).push(p.toLowerCase());
    } else {
      const k = p.slice(0, eq).toUpperCase();
      const vals = p
        .slice(eq + 1)
        .split(",")
        .map((s) => s.toLowerCase());
      (params[k] ??= []).push(...vals);
    }
  }
  return { name, params, value };
}

export function parseVCard(raw: string): ParsedVCard | null {
  const lines = unfold(raw);
  const fields: ParsedLine[] = [];
  for (const line of lines) {
    const parsed = parseLine(line);
    if (parsed) fields.push(parsed);
  }
  if (fields.length === 0) return null;

  // Detect Apple Maps location.
  for (const f of fields) {
    if (f.name === "URL" && /maps\.apple\.com/i.test(f.value)) {
      const match = f.value.match(/ll=(-?\d+(?:\.\d+)?)\\?,(-?\d+(?:\.\d+)?)/);
      if (match) {
        const fn = fields.find((x) => x.name === "FN");
        const label = fn ? unescape(fn.value) : "Shared location";
        return {
          kind: "location",
          label: label === "Current Location" ? "Shared location" : label,
          lat: parseFloat(match[1]),
          lng: parseFloat(match[2]),
          mapsUrl: unescape(f.value),
        };
      }
    }
  }

  const fn = fields.find((f) => f.name === "FN");
  const org = fields.find((f) => f.name === "ORG");
  const tel: VCardPhone[] = fields
    .filter((f) => f.name === "TEL")
    .map((f) => {
      const types = f.params["TYPE"] ?? [];
      const pref = types.find((t) =>
        ["cell", "mobile", "iphone", "home", "work", "main"].includes(t)
      );
      return { number: unescape(f.value).trim(), type: pref ?? types[0] ?? null };
    });
  const email = fields
    .filter((f) => f.name === "EMAIL")
    .map((f) => unescape(f.value).trim());

  const photo = fields.find((f) => f.name === "PHOTO");
  let photoDataUrl: string | null = null;
  if (photo) {
    const encoding = photo.params["ENCODING"]?.[0];
    const typeParam =
      photo.params["TYPE"]?.[0] ?? photo.params["MEDIATYPE"]?.[0];
    if (encoding === "b" || encoding === "base64") {
      const mime = typeParam ? `image/${typeParam.replace(/^image\//, "")}` : "image/jpeg";
      photoDataUrl = `data:${mime};base64,${photo.value.replace(/\s+/g, "")}`;
    }
  }

  const orgValue = org
    ? unescape(org.value).split(";").filter(Boolean).join(" — ")
    : null;

  return {
    kind: "contact",
    fn: fn ? unescape(fn.value) : null,
    org: orgValue,
    tel,
    email,
    photoDataUrl,
  };
}
