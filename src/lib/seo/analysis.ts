export type SeoFinding = {
  key: string;
  label: string;
  status: "good" | "improve" | "problem";
  detail: string;
  priority: number;
};

export type TitleScore = {
  title: string;
  total: number;
  pixelWidth: number;
  fullPixelWidth: number;
  suffix: string;
  categories: Array<{ label: string; score: number; max: number; explanation: string }>;
};

const CTR_TERMS = ["best", "rankings", "sleepers", "targets", "guide", "breakouts", "waiver"];

export function estimateTitlePixels(value: string): number {
  let width = 0;
  for (const char of value) {
    if (/[WM@%]/.test(char)) width += 11;
    else if (/[A-Z0-9]/.test(char)) width += 8;
    else if (/[ilI1|'.,:;]/.test(char)) width += 3.5;
    else if (char === " ") width += 4;
    else width += 7;
  }
  return Math.round(width);
}

export function scoreTitle(
  title: string,
  focusKeyphrase: string,
  suffix = " | Pitcher List",
): TitleScore {
  const normalized = title.trim();
  const lower = normalized.toLowerCase();
  const keyword = focusKeyphrase.trim().toLowerCase();
  const keywordIndex = keyword ? lower.indexOf(keyword) : -1;
  const keywordScore = keywordIndex === 0 ? 25 : keywordIndex > 0 ? 18 : 0;
  const fullPixelWidth = estimateTitlePixels(`${normalized}${suffix}`);
  const pixelScore = fullPixelWidth <= 580 && fullPixelWidth >= 300
    ? 20
    : fullPixelWidth <= 620 && fullPixelWidth >= 240
      ? 10
      : 0;
  const specificitySignals = [
    /\b\d+\b/.test(normalized),
    /\b(20\d{2}|today|week|season|fantasy|pitcher|hitter)\b/i.test(normalized),
    normalized.split(/\s+/).length >= 5,
  ].filter(Boolean).length;
  const specificityScore = specificitySignals * 5;
  const listScore = /\b\d+\b/.test(normalized) && /\b(best|top|rankings|targets|sleepers)\b/i.test(normalized) ? 10 : 0;
  const ctrHits = CTR_TERMS.filter((term) => lower.includes(term)).length;
  const ctrScore = Math.min(15, ctrHits * 5);
  const words = normalized.split(/\s+/).filter(Boolean);
  const duplicateWords = words.filter(
    (word, index) => words.findIndex((candidate) => candidate.toLowerCase() === word.toLowerCase()) !== index,
  );
  const formatScore =
    words.length >= 4 && words.length <= 14 && duplicateWords.length === 0 && !/[!?]{2,}/.test(normalized)
      ? 15
      : words.length >= 3 && words.length <= 16
        ? 8
        : 0;

  const categories = [
    { label: "Focus keyphrase", score: keywordScore, max: 25, explanation: keywordIndex === 0 ? "Keyphrase leads the title." : keywordIndex > 0 ? "Keyphrase appears, but later." : "Keyphrase is missing." },
    { label: "SERP width", score: pixelScore, max: 20, explanation: `${fullPixelWidth}px including the ${estimateTitlePixels(suffix)}px suffix.` },
    { label: "Specificity", score: specificityScore, max: 15, explanation: `${specificitySignals}/3 concrete specificity signals.` },
    { label: "List framing", score: listScore, max: 10, explanation: listScore ? "Uses a numbered list/ranking frame." : "No numbered list/ranking frame." },
    { label: "Click value", score: ctrScore, max: 15, explanation: ctrHits ? `${ctrHits} useful intent phrase${ctrHits === 1 ? "" : "s"}.` : "No supported intent phrase." },
    { label: "Readability", score: formatScore, max: 15, explanation: formatScore === 15 ? "Readable length without repeated words." : "Simplify length, punctuation, or repeated words." },
  ];
  return {
    title: normalized,
    total: categories.reduce((sum, category) => sum + category.score, 0),
    pixelWidth: estimateTitlePixels(normalized),
    fullPixelWidth,
    suffix,
    categories,
  };
}

export function generateTitleCandidates(topic: string, focusKeyphrase: string): TitleScore[] {
  const cleanTopic = topic.trim().replace(/\s+/g, " ");
  const keyword = focusKeyphrase.trim().replace(/\s+/g, " ") || cleanTopic;
  const year = new Date().getUTCFullYear();
  const candidates = [
    cleanTopic,
    `${keyword}: Rankings, Targets, and Sleepers for ${year}`,
    `10 Best ${keyword} Targets for ${year}`,
    `${keyword} Guide: What Fantasy Managers Need to Know`,
    `Top ${keyword} Breakouts and Values for ${year}`,
  ];
  const unique = Array.from(new Map(candidates.filter(Boolean).map((value) => [value.toLowerCase(), value])).values());
  return unique.map((value) => scoreTitle(value, keyword)).sort((a, b) => b.total - a.total || a.fullPixelWidth - b.fullPixelWidth);
}

export function analyzeSeoDocument(input: {
  title: string;
  contentText: string;
  headings: string[];
  focusKeyphrase: string;
  metaDescription: string;
}): SeoFinding[] {
  const keyword = input.focusKeyphrase.trim().toLowerCase();
  const body = input.contentText.trim();
  const lowerBody = body.toLowerCase();
  const words = lowerBody.split(/\s+/).filter(Boolean);
  const sentences = body.split(/[.!?]+/).map((item) => item.trim()).filter(Boolean);
  const occurrences = keyword ? lowerBody.split(keyword).length - 1 : 0;
  const density = words.length > 0 ? (occurrences * Math.max(1, keyword.split(/\s+/).length) / words.length) * 100 : 0;
  const opening = lowerBody.slice(0, 240);
  const passiveMatches = body.match(/\b(is|are|was|were|be|been|being)\s+\w+(ed|en)\b/gi)?.length ?? 0;
  const transitionMatches = body.match(/\b(however|therefore|because|meanwhile|first|next|finally|also|instead|for example)\b/gi)?.length ?? 0;
  const averageSentence = sentences.length > 0 ? words.length / sentences.length : words.length;

  return [
    finding("title-keyphrase", "Focus keyphrase in title", keyword && input.title.toLowerCase().includes(keyword), keyword ? "Place the exact focus keyphrase naturally in the title." : "Choose one focus keyphrase.", 1),
    finding("opening-keyphrase", "Focus keyphrase in opening", keyword && opening.includes(keyword), "Use the keyphrase naturally in the opening paragraph.", 2),
    finding("heading-keyphrase", "Focus keyphrase in a heading", keyword && input.headings.some((heading) => heading.toLowerCase().includes(keyword)), "Use the keyphrase or a close variation in one descriptive heading.", 4),
    rangeFinding("meta-length", "Meta description length", input.metaDescription.length, 120, 160, `${input.metaDescription.length} characters; aim for 120–160.`, 3),
    rangeFinding("density", "Keyphrase distribution", density, 0.3, 2.5, `${density.toFixed(1)}% estimated density; avoid missing or stuffing the phrase.`, 5),
    finding("structure", "Article structure", input.headings.length >= 2, `${input.headings.length} headings found; use descriptive sections for scanability.`, 6),
    rangeFinding("sentence-length", "Sentence readability", averageSentence, 8, 24, `${averageSentence.toFixed(1)} words per sentence on average.`, 7),
    finding("passive-voice", "Active voice", words.length === 0 || passiveMatches / Math.max(1, sentences.length) <= 0.25, `${passiveMatches} likely passive construction${passiveMatches === 1 ? "" : "s"}; revise only where clarity improves.`, 8),
    finding("transitions", "Transitions", words.length < 250 || transitionMatches >= Math.max(1, Math.floor(sentences.length / 8)), `${transitionMatches} transition signal${transitionMatches === 1 ? "" : "s"} found.`, 9),
  ].sort((a, b) => a.priority - b.priority);
}

function finding(key: string, label: string, good: boolean | "", detail: string, priority: number): SeoFinding {
  return { key, label, status: good ? "good" : "problem", detail, priority };
}

function rangeFinding(key: string, label: string, value: number, min: number, max: number, detail: string, priority: number): SeoFinding {
  const status = value >= min && value <= max ? "good" : value >= min * 0.7 && value <= max * 1.25 ? "improve" : "problem";
  return { key, label, status, detail, priority };
}
