import { describe, expect, it } from "vitest";
import { isExternal, siteOf } from "../src/site.js";

describe("siteOf", () => {
  it.each([
    ["https://www.example.com/a", "example.com"],
    ["https://a.b.example.com", "example.com"],
    ["https://news.bbc.co.uk/x", "bbc.co.uk"],
    ["https://me.github.io/repo", "me.github.io"],
    ["http://127.0.0.1:4173/", "127.0.0.1"],
    ["http://localhost:3000", "localhost"],
    ["https://EXAMPLE.com./", "example.com"],
  ])("%s → %s", (url, site) => expect(siteOf(url)).toBe(site));

  it.each(["about:blank", "javascript:void(0)", "data:text/html,hi", "blob:https://x.com/1", "not a url"])(
    "%s is not a site",
    (url) => expect(siteOf(url)).toBeNull(),
  );

  it("resolves relative URLs against a base", () => {
    expect(siteOf("/path", "https://shop.example.com/cart")).toBe("example.com");
  });
});

describe("isExternal", () => {
  const page = "https://www.example.com/watch";

  it("same site, including subdomains and relative paths, is not external", () => {
    expect(isExternal("https://cdn.example.com/x", page)).toBe(false);
    expect(isExternal("/next", page)).toBe(false);
  });

  it("another site is external", () => {
    expect(isExternal("https://ads.example.net/", page)).toBe(true);
  });

  it("a blank window counts as external (it can be pointed anywhere later)", () => {
    expect(isExternal(undefined, page)).toBe(true);
    expect(isExternal("", page)).toBe(true);
    expect(isExternal("about:blank", page)).toBe(true);
  });

  it("different github.io users are different sites", () => {
    expect(isExternal("https://evil.github.io/", "https://me.github.io/")).toBe(true);
  });
});
