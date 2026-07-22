import { describe, expect, it } from "vitest";
import {
  analyzeSeoDocument,
  estimateTitlePixels,
  generateTitleCandidates,
  scoreTitle,
} from "./analysis";

describe("Pitcher List SEO analysis", () => {
  it("uses deterministic glyph weighting and includes the suffix", () => {
    expect(estimateTitlePixels("WWW")).toBeGreaterThan(estimateTitlePixels("iii"));
    const score = scoreTitle(
      "Fantasy Baseball Rankings: 10 Best Pitchers for 2026",
      "fantasy baseball rankings",
    );
    expect(
      Math.abs(
        score.fullPixelWidth -
          (score.pixelWidth + estimateTitlePixels(score.suffix)),
      ),
    ).toBeLessThanOrEqual(1);
    expect(score.categories.map((item) => item.max)).toEqual([25, 20, 15, 10, 15, 15]);
    expect(score.categories.reduce((sum, item) => sum + item.max, 0)).toBe(100);
  });

  it("ranks generated candidates by score without duplicates", () => {
    const candidates = generateTitleCandidates({
      keyword: "streaming pitchers",
      articleType: "fantasy",
      players: ["Payton Tolle"],
      week: "15",
      date: "7/5/26",
      listSize: "10",
      year: 2026,
    });
    expect(new Set(candidates.map((item) => item.title.toLowerCase())).size).toBe(candidates.length);
    expect(candidates.map((item) => item.total)).toEqual(
      [...candidates.map((item) => item.total)].sort((a, b) => b - a),
    );
    expect(candidates.some((item) => item.title.includes("Payton Tolle"))).toBe(true);
    expect(candidates.some((item) => item.title.includes("7/5/26"))).toBe(true);
  });

  it("matches the standalone generator's calibrated pixel and scoring rules", () => {
    expect(estimateTitlePixels("W1 i")).toBe(17 + 11 + 6 + 6);
    const score = scoreTitle(
      "Top 10 Streaming Pitchers for Week 15 (2026)",
      "streaming pitchers",
    );
    expect(score.categories.map((category) => category.score)).toEqual([25, 20, 15, 10, 6, 15]);
    expect(score.total).toBe(91);
  });

  it("prioritizes specific keyphrase, structure, stuffing, voice, and readability advice", () => {
    const findings = analyzeSeoDocument({
      title: "Generic Notes",
      contentText: "This was written. Fantasy baseball rankings fantasy baseball rankings fantasy baseball rankings.",
      headings: [],
      focusKeyphrase: "fantasy baseball rankings",
      metaDescription: "Short",
    });
    expect(findings.map((item) => item.key)).toEqual([
      "title-keyphrase",
      "opening-keyphrase",
      "meta-length",
      "heading-keyphrase",
      "density",
      "slug",
      "structure",
      "image-alt",
      "paragraph-length",
      "sentence-length",
      "passive-voice",
      "transitions",
    ]);
    expect(findings.find((item) => item.key === "density")?.status).toBe("problem");
    expect(findings.find((item) => item.key === "title-keyphrase")?.status).toBe("problem");
  });
});
