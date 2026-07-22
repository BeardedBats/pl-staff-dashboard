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
    const candidates = generateTitleCandidates(
      "Fantasy Baseball Rankings",
      "Fantasy Baseball Rankings",
    );
    expect(new Set(candidates.map((item) => item.title.toLowerCase())).size).toBe(candidates.length);
    expect(candidates.map((item) => item.total)).toEqual(
      [...candidates.map((item) => item.total)].sort((a, b) => b - a),
    );
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
      "structure",
      "sentence-length",
      "passive-voice",
      "transitions",
    ]);
    expect(findings.find((item) => item.key === "density")?.status).toBe("problem");
    expect(findings.find((item) => item.key === "title-keyphrase")?.status).toBe("problem");
  });
});
