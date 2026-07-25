import { describe, expect, it } from "vitest";
import { inlineContentDisposition } from "./content-disposition";

describe("inlineContentDisposition", () => {
  it("uses only the basename and preserves Unicode through filename*", () => {
    const value = inlineContentDisposition(
      "/Library/Messages/Attachments/photo\u202fnight.jpg",
    );

    expect(value).toBe(
      `inline; filename="photo night.jpg"; filename*=UTF-8''photo%E2%80%AFnight.jpg`,
    );
    expect([...value].every((char) => char.charCodeAt(0) <= 255)).toBe(true);
    expect(value).not.toContain("/Library/Messages");
  });

  it("escapes characters that are unsafe in the quoted fallback", () => {
    expect(inlineContentDisposition('folder/a"b.txt')).toContain(
      'filename="a_b.txt"',
    );
  });
});
