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

export type TitleGeneratorInput = {
  keyword: string;
  articleType?: "goingdeep" | "hitterrecap" | "morningnews" | "plvweekly" | "seams" | "welovebaseball" | "fantasy" | "dynasty" | "baseball" | "other";
  players?: string[];
  week?: string;
  date?: string;
  listSize?: string;
  year?: number;
};

const SUFFIX = " | Pitcher List";
const NARROW = "iljtf.,:;'|!()[] ";
const WIDE = "mwMW@";
const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGIT = "0123456789";
const CTR = ["rankings", "ranks", "picks", "targets", "pickups", "adds", "drops", "add", "drop", "buy", "sell", "sleepers", "sleeper", "breakout", "breakouts", "legit", "must-add", "must add", "guide", "best", "top", "stash", "risers", "fallers", "starts", "sits", "streamers", "waiver", "closer", "closers", "saves", "holds"];

export function estimateTitlePixels(value: string): number {
  let width = 0;
  for (const character of value) {
    if (NARROW.includes(character)) width += 6;
    else if (WIDE.includes(character)) width += 17;
    else if (UPPER.includes(character)) width += 13;
    else if (DIGIT.includes(character)) width += 11;
    else if (character === "—" || character === "–") width += 12;
    else width += 10;
  }
  return width;
}

export function scoreTitle(title: string, focusKeyphrase: string, suffix = SUFFIX): TitleScore {
  const normalized = title.trim();
  const lower = normalized.toLowerCase();
  const keyword = focusKeyphrase.trim().toLowerCase();
  const keywordPosition = keyword ? lower.indexOf(keyword) : -1;
  const keywordRatio = keywordPosition >= 0
    ? keywordPosition / Math.max(lower.length - keyword.length, 1)
    : 1;
  const keywordScore = keywordPosition >= 0 ? (keywordRatio <= 0.5 ? 25 : 18) : 0;
  const fullPixelWidth = estimateTitlePixels(`${normalized}${suffix}`);
  const characters = normalized.length;
  const lengthScore = characters >= 40 && characters <= 57 && fullPixelWidth <= 600
    ? 20
    : characters >= 25 && characters < 40
      ? 14
      : characters < 25
        ? 8
        : fullPixelWidth <= 600
          ? 16
          : 6;
  const hasYear = /20\d\d/.test(normalized);
  const hasWeek = /week\s*\d+/i.test(normalized);
  const hasDate = /\d{1,2}[\/\-.]\d{1,2}/.test(normalized) || /\b(today|tonight|this week|next week)\b/i.test(normalized);
  const specificityScore = Math.min((hasYear ? 7 : 0) + (hasWeek || hasDate ? 8 : 0), 15);
  const listScore = /\b(top\s*\d+|\d+\s+(best|fantasy|waiver|pitchers|hitters|players|prospects|sleepers|targets|picks|adds))\b/i.test(normalized) ? 10 : 0;
  const words = lower.replace(/[^a-z0-9\s+-]/g, "").split(/\s+/);
  const ctrHits = [...new Set(CTR.filter((word) => words.includes(word) || lower.includes(`${word} `) || lower.endsWith(word)))];
  const ctrScore = Math.min(ctrHits.length * 6, 15);
  let formatScore = 15;
  const formatIssues: string[] = [];
  const capsWords = normalized.split(/\s+/).filter((word) => word.length > 3 && word === word.toUpperCase() && /[A-Z]/.test(word));
  if (capsWords.length) { formatScore -= 5; formatIssues.push(`ALL-CAPS word (${capsWords[0]})`); }
  if ((normalized.match(/[:|–—-]/g) ?? []).length > 2) { formatScore -= 4; formatIssues.push("too many separators"); }
  const counts = new Map<string, number>();
  words.filter((word) => word.length > 3).forEach((word) => counts.set(word, (counts.get(word) ?? 0) + 1));
  const stuffed = [...counts.entries()].find(([, count]) => count >= 3);
  if (stuffed) { formatScore -= 6; formatIssues.push(`“${stuffed[0]}” appears ${stuffed[1]} times`); }
  if (/[\u{1F300}-\u{1FAFF}☀-➿]/u.test(normalized)) { formatScore -= 4; formatIssues.push("emoji"); }
  if (normalized.split(/\s+/).filter((word) => word.length > 4 && word === word.toLowerCase() && /^[a-z]/.test(word)).length > 2) { formatScore -= 3; formatIssues.push("major words need Title Case"); }
  formatScore = Math.max(formatScore, 0);

  const categories = [
    { label: "Keyword placement", score: keywordScore, max: 25, explanation: keywordPosition < 0 ? "Target keyword is missing." : keywordScore === 25 ? "Keyword appears in the front half." : "Keyword is buried late." },
    { label: "Length & pixels", score: lengthScore, max: 20, explanation: `${characters} characters and ~${fullPixelWidth}px with the Pitcher List suffix.` },
    { label: "Specificity", score: specificityScore, max: 15, explanation: `${hasYear ? "Year present" : "No year"}; ${hasWeek || hasDate ? "week/date present" : "no week or date"}.` },
    { label: "List format", score: listScore, max: 10, explanation: listScore ? "Uses proven Top N / numbered-list framing." : "No numbered-list framing." },
    { label: "CTR triggers", score: ctrScore, max: 15, explanation: ctrHits.length ? `Intent words: ${ctrHits.slice(0, 4).join(", ")}.` : "No supported action or intent words." },
    { label: "Format", score: formatScore, max: 15, explanation: formatIssues.length ? formatIssues.join("; ") : "Clean Title Case, punctuation, and repetition." },
  ];
  return { title: normalized, total: categories.reduce((sum, category) => sum + category.score, 0), pixelWidth: estimateTitlePixels(normalized), fullPixelWidth, suffix, categories };
}

const SMALL = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "in", "of", "on", "or", "the", "to", "vs", "with"]);
function titleCase(value: string): string {
  return value.split(/\s+/).map((word, index) => index > 0 && SMALL.has(word.toLowerCase()) ? word.toLowerCase() : `${word.charAt(0).toUpperCase()}${word.slice(1)}`).join(" ");
}

export function generateTitleCandidates(inputOrTopic: TitleGeneratorInput | string, legacyKeyword?: string): TitleScore[] {
  const input: TitleGeneratorInput = typeof inputOrTopic === "string"
    ? { keyword: legacyKeyword?.trim() || inputOrTopic, articleType: "fantasy" }
    : inputOrTopic;
  const rawKeyword = input.keyword.trim();
  if (!rawKeyword) return [];
  const keyword = rawKeyword.toLowerCase();
  const displayKeyword = titleCase(rawKeyword);
  const type = input.articleType ?? "fantasy";
  const players = (input.players ?? []).map((player) => player.trim()).filter(Boolean);
  const player = players[0] ?? "";
  const year = input.year ?? new Date().getUTCFullYear();
  const week = input.week?.trim() ? `Week ${input.week.trim()}` : "";
  const date = input.date?.trim() ?? "";
  const count = input.listSize?.trim() || "10";
  const when = date || week || String(year);
  const titles: string[] = [];
  const add = (value: string) => {
    const clean = value.replace(/\s+/g, " ").replace(/\s([:,?])/g, "$1").trim();
    if (clean && !titles.includes(clean)) titles.push(clean);
  };
  switch (type) {
    case "goingdeep":
      if (player) add(`Going Deep: ${player} and the ${displayKeyword} Breakout (${year})`);
      if (player) add(`Going Deep: Is ${player} Legit? ${displayKeyword} Says Yes`);
      add(`Going Deep: ${displayKeyword} (${year})`);
      add(`${player ? `${player} Deep Dive` : "Going Deep"}: ${displayKeyword} for ${year} Fantasy Baseball`);
      break;
    case "hitterrecap":
      if (player) add(`${player} Headlines ${displayKeyword}: Fantasy Hitting Recap ${date || "Today"}`);
      add(`Fantasy Baseball Hitting Recap ${date || week}: ${displayKeyword}`);
      add(`Hitter Recap ${date || week || year}: ${displayKeyword} and More`);
      break;
    case "morningnews":
      add(`MLB Morning News: ${displayKeyword} ${date}`);
      add(`MLB News Today: ${displayKeyword}`);
      if (player) add(`MLB Morning News ${date}: ${player} and the ${displayKeyword}`);
      break;
    case "plvweekly":
      add(`PLV Weekly ${week}: ${displayKeyword}`);
      if (player) add(`PLV Weekly ${week || year}: ${player} Leads ${displayKeyword}`);
      add(`${displayKeyword}: What PLV Says (${week || year})`);
      break;
    case "seams": add(`Across the Seams: ${displayKeyword}`); add(`Across the Seams: ${displayKeyword} (${year})`); add(`${displayKeyword}: A Baseball Story Worth Knowing`); break;
    case "welovebaseball": add(`We Love Baseball: ${displayKeyword}`); add(`We Love Baseball ${date || week || year}: ${displayKeyword}`); if (player) add(`We Love Baseball: ${player} and the ${displayKeyword}`); break;
    case "dynasty": add(`${displayKeyword}: ${year} Dynasty Rankings`); add(`Top ${input.listSize?.trim() || "100"} ${displayKeyword} for Dynasty Leagues (${year})`); if (player) add(`Dynasty ${displayKeyword}: Why ${player} Belongs on Your Roster`); add(`${year} Dynasty ${displayKeyword}: Targets, Stashes, and Sleepers`); break;
    case "baseball": add(`${displayKeyword}: ${when} MLB Breakdown`); add(`MLB ${displayKeyword} ${week || year}: What to Know`); if (player) add(`${player} and the ${displayKeyword}: ${year} MLB Analysis`); add(`${displayKeyword} Explained: The ${year} Season`); break;
    case "other": add(`${displayKeyword}: ${year} Guide`); add(`Top ${count} ${displayKeyword} (${year})`); if (player) add(`${displayKeyword}: ${player} Leads the List (${year})`); add(`${displayKeyword}: Everything to Know for ${when}`); break;
    default:
      add(`${displayKeyword}: ${when} Fantasy Baseball Rankings`);
      add(`Top ${count} ${displayKeyword} for ${week || year} Fantasy Baseball`);
      add(`Fantasy Baseball ${displayKeyword}: Best Targets for ${when}`);
      if (player) add(`${displayKeyword} ${week || year}: Add ${player} Now`);
      if (date) add(`${displayKeyword} Today: Fantasy Baseball Picks ${date}`);
  }
  if (titles.length < 4) { add(`${displayKeyword}: ${week || year} ${player ? `${player} and More` : "Full Breakdown"}`); add(`Top ${count} ${displayKeyword} ${week ? `for ${week}` : `in ${year}`}`); }
  return titles.map((title) => scoreTitle(title, keyword)).sort((a, b) => b.total - a.total);
}

export function analyzeSeoDocument(input: { title: string; contentText: string; headings: string[]; focusKeyphrase: string; metaDescription: string; slug?: string; imageAlts?: string[]; paragraphWordCounts?: number[] }): SeoFinding[] {
  const keyword = input.focusKeyphrase.trim().toLowerCase();
  const body = input.contentText.trim();
  const lowerBody = body.toLowerCase();
  const words = lowerBody.split(/\s+/).filter(Boolean);
  const sentences = body.split(/[.!?]+/).map((item) => item.trim()).filter(Boolean);
  const occurrences = keyword ? lowerBody.split(keyword).length - 1 : 0;
  const density = words.length > 0 ? (occurrences * Math.max(1, keyword.split(/\s+/).length) / words.length) * 100 : 0;
  const passiveMatches = body.match(/\b(is|are|was|were|be|been|being)\s+\w+(ed|en)\b/gi)?.length ?? 0;
  const transitionMatches = body.match(/\b(however|therefore|because|meanwhile|first|next|finally|also|instead|for example)\b/gi)?.length ?? 0;
  const averageSentence = sentences.length > 0 ? words.length / sentences.length : words.length;
  const longParagraphs = (input.paragraphWordCounts ?? []).filter((count) => count > 150).length;
  const missingAlts = (input.imageAlts ?? []).filter((alt) => !alt.trim()).length;
  return [
    finding("title-keyphrase", "Focus keyphrase in title", Boolean(keyword && input.title.toLowerCase().includes(keyword)), keyword ? "Place the exact focus keyphrase naturally in the title." : "Choose one focus keyphrase.", 1),
    finding("opening-keyphrase", "Focus keyphrase in opening", Boolean(keyword && lowerBody.slice(0, 240).includes(keyword)), "Use the keyphrase naturally in the opening paragraph.", 2),
    rangeFinding("meta-length", "Meta description length", input.metaDescription.length, 120, 160, `${input.metaDescription.length} characters; aim for 120–160.`, 3),
    finding("heading-keyphrase", "Focus keyphrase in a heading", Boolean(keyword && input.headings.some((heading) => heading.toLowerCase().includes(keyword))), "Use the keyphrase or a close variation in one descriptive heading.", 4),
    rangeFinding("density", "Keyphrase distribution", density, 0.3, 2.5, `${density.toFixed(1)}% estimated density; avoid missing or stuffing the phrase.`, 5),
    finding("slug", "Descriptive slug", Boolean(input.slug && input.slug.length <= 75 && (!keyword || keyword.split(/\s+/).some((word) => input.slug?.includes(word)))), input.slug ? `Current slug: ${input.slug}` : "Add a short, descriptive WordPress slug.", 6),
    finding("structure", "Article structure", input.headings.length >= 2, `${input.headings.length} headings found; use descriptive sections for scanability.`, 7),
    finding("image-alt", "Image alt text", missingAlts === 0, missingAlts ? `${missingAlts} image${missingAlts === 1 ? " is" : "s are"} missing alt text.` : "All detected images have alt text.", 8),
    finding("paragraph-length", "Paragraph length", longParagraphs === 0, longParagraphs ? `${longParagraphs} paragraph${longParagraphs === 1 ? " is" : "s are"} over 150 words.` : "Paragraphs are scannable.", 9),
    rangeFinding("sentence-length", "Sentence readability", averageSentence, 8, 24, `${averageSentence.toFixed(1)} words per sentence on average.`, 10),
    finding("passive-voice", "Active voice", words.length === 0 || passiveMatches / Math.max(1, sentences.length) <= 0.25, `${passiveMatches} likely passive construction${passiveMatches === 1 ? "" : "s"}.`, 11),
    finding("transitions", "Transitions", words.length < 250 || transitionMatches >= Math.max(1, Math.floor(sentences.length / 8)), `${transitionMatches} transition signal${transitionMatches === 1 ? "" : "s"} found.`, 12),
  ].sort((a, b) => a.priority - b.priority);
}

function finding(key: string, label: string, good: boolean, detail: string, priority: number): SeoFinding { return { key, label, status: good ? "good" : "problem", detail, priority }; }
function rangeFinding(key: string, label: string, value: number, min: number, max: number, detail: string, priority: number): SeoFinding { const status = value >= min && value <= max ? "good" : value >= min * 0.7 && value <= max * 1.25 ? "improve" : "problem"; return { key, label, status, detail, priority }; }
