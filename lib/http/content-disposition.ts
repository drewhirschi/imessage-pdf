import path from "node:path";

function encodeRFC5987(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export function inlineContentDisposition(storedPath: string): string {
  const filename = path.basename(storedPath) || "attachment";
  const fallback =
    filename
      .normalize("NFKD")
      .replace(/[^\x20-\x7E]/g, "_")
      .replace(/["\\]/g, "_")
      .trim() || "attachment";

  return `inline; filename="${fallback}"; filename*=UTF-8''${encodeRFC5987(filename)}`;
}
