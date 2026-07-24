import { describe, expect, it } from "vitest";
import { classifyMessage, displayDomain, extractUrls, trimUrl } from "./classify";

describe("trimUrl", () => {
  it("strips trailing sentence punctuation", () => {
    expect(trimUrl("https://x.com/a.")).toBe("https://x.com/a");
    expect(trimUrl("https://x.com/a,")).toBe("https://x.com/a");
    expect(trimUrl("https://x.com/a?!")).toBe("https://x.com/a");
    expect(trimUrl("https://x.com/a...")).toBe("https://x.com/a");
  });

  it("drops a dangling close-paren with no matching open", () => {
    expect(trimUrl("https://x.com/a)")).toBe("https://x.com/a");
  });

  it("keeps a close-paren that balances one inside the URL", () => {
    expect(trimUrl("https://en.wikipedia.org/wiki/Foo_(bar)")).toBe(
      "https://en.wikipedia.org/wiki/Foo_(bar)",
    );
  });

  it("keeps query strings and fragments intact", () => {
    expect(trimUrl("https://x.com/a?b=1&c=2#frag")).toBe("https://x.com/a?b=1&c=2#frag");
  });
});

describe("extractUrls", () => {
  it("returns every http(s) url in order", () => {
    expect(extractUrls("see https://a.com and http://b.com too")).toEqual([
      "https://a.com",
      "http://b.com",
    ]);
  });

  it("ignores non-http schemes", () => {
    expect(extractUrls("mailto:me@x.com or tel:+1555 or ftp://y.com")).toEqual([]);
  });

  it("returns empty for plain text", () => {
    expect(extractUrls("just some words")).toEqual([]);
  });
});

describe("classifyMessage", () => {
  it("no-url for empty / null / whitespace", () => {
    expect(classifyMessage(null).shape).toBe("no-url");
    expect(classifyMessage(undefined).shape).toBe("no-url");
    expect(classifyMessage("   ").shape).toBe("no-url");
    expect(classifyMessage("hello there").shape).toBe("no-url");
  });

  it("bare-url when the whole message is one URL", () => {
    const r = classifyMessage("https://example.com/path");
    expect(r.shape).toBe("bare-url");
    expect(r.urls).toEqual(["https://example.com/path"]);
  });

  it("bare-url with surrounding whitespace", () => {
    expect(classifyMessage("  https://example.com  ").shape).toBe("bare-url");
  });

  it("bare-url when only trailing punctuation follows", () => {
    const r = classifyMessage("https://example.com/path.");
    expect(r.shape).toBe("bare-url");
    expect(r.urls).toEqual(["https://example.com/path"]);
  });

  it("trailing-url when text precedes a single trailing URL", () => {
    const r = classifyMessage("check this out https://example.com/path");
    expect(r.shape).toBe("trailing-url");
    expect(r.urls).toEqual(["https://example.com/path"]);
  });

  it("trailing-url tolerates a trailing period after the url", () => {
    expect(classifyMessage("look here https://example.com.").shape).toBe("trailing-url");
  });

  it("inline when a URL sits mid-sentence", () => {
    expect(classifyMessage("go to https://example.com now please").shape).toBe("inline");
  });

  it("inline when there are multiple URLs", () => {
    const r = classifyMessage("https://a.com and https://b.com");
    expect(r.shape).toBe("inline");
    expect(r.urls).toEqual(["https://a.com", "https://b.com"]);
  });

  it("no-url for non-http schemes only", () => {
    expect(classifyMessage("email me at mailto:me@x.com").shape).toBe("no-url");
  });
});

describe("displayDomain", () => {
  it("strips www and lowercases", () => {
    expect(displayDomain("https://WWW.Example.com/x")).toBe("example.com");
  });
  it("handles subdomains", () => {
    expect(displayDomain("https://maps.app.goo.gl/abc")).toBe("maps.app.goo.gl");
  });
  it("falls back gracefully on junk", () => {
    expect(displayDomain("not a url")).toBe("not a url");
  });
});
