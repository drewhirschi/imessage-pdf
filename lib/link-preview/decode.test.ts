import { describe, expect, it } from "vitest";
import { decodeRichLink, parseBinaryPlist } from "./decode";
import fixtures from "./__fixtures__/rich-links.json";

// Fixtures are real `payload_data` blobs (base64) extracted read-only from a
// personal chat.db. Innocuous content: a recipe link and an app sign-up link.
const blob = (name: keyof typeof fixtures) => Buffer.from(fixtures[name], "base64");

describe("decodeRichLink", () => {
  it("returns null for empty / missing input", () => {
    expect(decodeRichLink(null)).toBeNull();
    expect(decodeRichLink(undefined)).toBeNull();
    expect(decodeRichLink(Buffer.alloc(0))).toBeNull();
  });

  it("returns null for a non-plist buffer", () => {
    expect(decodeRichLink(Buffer.from("not a plist at all, just bytes......."))).toBeNull();
  });

  it("extracts url + title + siteName + summary from a rich link", () => {
    const link = decodeRichLink(blob("muffins"));
    expect(link).not.toBeNull();
    expect(link!.url).toBe(
      "https://www.erinliveswhole.com/healthy-cottage-cheese-blender-muffins/#tasty-recipes-52086",
    );
    expect(link!.title).toBe("Healthy Cottage Cheese Blender Muffins");
    expect(link!.siteName).toBe("Erin Lives Whole");
    expect(link!.summary).toMatch(/nutritious and delicious/i);
  });

  it("extracts a title-only rich link (no siteName/summary)", () => {
    const link = decodeRichLink(blob("brightwheel"));
    expect(link!.url).toBe(
      "https://schools.mybrightwheel.com/sign-up/quick/5a9671db1afe5245ffa3c6e6fe9c3edb",
    );
    expect(link!.title).toBe("brightwheel");
    expect(link!.siteName).toBeUndefined();
  });
});

describe("parseBinaryPlist", () => {
  it("parses the archive header of a real blob", () => {
    const top = parseBinaryPlist(blob("brightwheel")) as Record<string, unknown>;
    expect(top["$archiver"]).toBe("NSKeyedArchiver");
    expect(Array.isArray(top["$objects"])).toBe(true);
  });
});
