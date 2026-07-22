import { describe, expect, it } from "vitest";
import {
  buildAnalyticsPathIndex,
  normalizeAnalyticsPath,
} from "./url-normalization";

describe("normalizeAnalyticsPath", () => {
  it.each([
    ["https://www.pitcherlist.com/Foo/Bar/?utm_source=test#section", "foo/bar"],
    ["//pitcherlist.com/Foo/", "foo"],
    ["www.pitcherlist.com/Foo/", "foo"],
    ["pitcherlist.com", ""],
    ["/Foo/Bar/?preview=true", "foo/bar"],
    ["Foo/Bar#section", "foo/bar"],
    ["  /Foo%20Bar/  ", "foo bar"],
    ["https://pitcherlist.com/", ""],
    ["?utm_source=test", ""],
    ["", ""],
  ])("normalizes %s", (raw, expected) => {
    expect(normalizeAnalyticsPath(raw)).toBe(expected);
  });

  it("preserves encoded path separators", () => {
    expect(normalizeAnalyticsPath("/one%2Ftwo/")).toBe("one%2ftwo");
  });

  it("keeps malformed percent escapes deterministic", () => {
    expect(normalizeAnalyticsPath("/bad%2/path/?x=1")).toBe("bad%2/path");
  });
});

describe("buildAnalyticsPathIndex", () => {
  it("indexes equivalent entry URLs with one canonical key", () => {
    expect(
      buildAnalyticsPathIndex([
        { id: "entry-1", url: "https://pitcherlist.com/Article/" },
        { id: "entry-1", url: "/article?preview=true" },
        { id: "root", url: "https://pitcherlist.com/" },
        { id: "missing", url: null },
      ]),
    ).toEqual(new Map([["article", "entry-1"]]));
  });

  it("refuses a path shared by different entries", () => {
    expect(() =>
      buildAnalyticsPathIndex([
        { id: "entry-1", url: "https://pitcherlist.com/shared/" },
        { id: "entry-2", url: "https://qb-list.com/shared/" },
      ]),
    ).toThrow("Multiple entries share the same analytics path");
  });
});
