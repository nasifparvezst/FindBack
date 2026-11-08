import type { Report } from "./types";

export const DEFAULT_MATCH_WINDOW_DAYS = 30;
export const MATCH_MIN_SCORE = 48;
export const MATCH_STRONG_SCORE = 75;

export type MatchOptions = { maxDaysApart?: number | null };
export type MatchSignal = { kind: "positive" | "negative" | "neutral"; label: string; points: number };
export type MatchScore = {
  score: number;
  reasons: string[];
  signals: MatchSignal[];
  confidence: "Strong" | "Possible" | "Weak";
};
type MatchFields = Pick<Report, "type" | "category" | "title" | "brand" | "color" | "description" | "location" | "occurredOn">;

const STOP = new Set([
  "the", "a", "an", "with", "and", "for", "near", "from", "item", "lost", "found", "in", "on", "at",
  "একটি", "একটা", "আমার", "হারানো", "পাওয়া", "পাওয়া", "পেয়েছি", "পেয়েছি", "গেছে",
].map((word) => word.normalize("NFKC")));
const GENERIC = new Set([
  "phone", "mobile", "device", "wallet", "bag", "backpack", "keys", "key", "keyring", "book", "card", "id", "electronics", "other",
  "black", "white", "blue", "red", "green", "yellow", "gray", "grey", "silver", "gold", "brown", "pink", "purple", "orange",
  "case", "cover", "small", "large", "new", "old", "campus", "student", "university",
  "মোবাইল", "ফোন", "ব্যাগ", "বই", "চাবি", "কার্ড", "মানিব্যাগ", "জিনিস", "জিনিসটি",
  "কালো", "সাদা", "নীল", "লাল", "সবুজ", "হলুদ", "ছোট", "বড়", "নতুন", "পুরোনো",
].map((word) => word.normalize("NFKC")));
const UNKNOWN = new Set(["", "unknown", "not specified", "not sure", "n a", "na", "none", "অজানা", "জানা নেই"].map((word) => word.normalize("NFKC")));
const COMPANY_SUFFIXES = new Set(["inc", "incorporated", "ltd", "limited", "co", "company", "corp", "corporation"]);
const COLOR_FILLER = new Set(["color", "colour", "colored", "coloured", "case", "cover"]);
const COLOR_ALIASES = new Map([
  ["grey", "gray"], ["কালো", "black"], ["সাদা", "white"], ["নীল", "blue"], ["লাল", "red"], ["সবুজ", "green"], ["হলুদ", "yellow"],
]);

function words(value: string): string[] {
  // Keep combining marks inside Bangla words; remove optional zero-width joiners.
  return value.normalize("NFKC").toLowerCase().replace(/[\u200B-\u200D\uFEFF]/g, "")
    .match(/[\p{L}\p{N}][\p{L}\p{M}\p{N}]*/gu) ?? [];
}

function tokens(value: string): Set<string> {
  return new Set(words(value).filter((word) => word.length > 1 && !STOP.has(word)));
}

function similarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared++;
  return shared / (a.size + b.size - shared);
}

function fieldTokens(value: string, color = false): Set<string> {
  const normalized = words(value);
  if (UNKNOWN.has(normalized.join(" "))) return new Set();
  return new Set(normalized
    .filter((word) => !(color ? COLOR_FILLER : COMPANY_SUFFIXES).has(word))
    .map((word) => color ? COLOR_ALIASES.get(word) ?? word : word));
}

function dateValue(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value ? parsed : NaN;
}

function matchWindow(options: MatchOptions): number | null {
  const limit = options.maxDaysApart === undefined ? DEFAULT_MATCH_WINDOW_DAYS : options.maxDaysApart;
  if (limit !== null && (!Number.isFinite(limit) || limit < 0)) throw new RangeError("Match date window must be a non-negative number or null.");
  return limit;
}

function result(signals: MatchSignal[]): MatchScore {
  const score = Math.max(0, Math.min(100, signals.reduce((sum, signal) => sum + signal.points, 0)));
  return {
    score, signals, reasons: signals.map((signal) => signal.label),
    confidence: score >= MATCH_STRONG_SCORE ? "Strong" : score >= MATCH_MIN_SCORE ? "Possible" : "Weak",
  };
}

export function calculateMatchScore(a: MatchFields, b: MatchFields, options: MatchOptions = {}): MatchScore {
  const limit = matchWindow(options);
  const excluded = (label: string) => result([{ kind: "negative", label, points: 0 }]);
  if (a.type === b.type) return excluded("Reports must have opposite Lost/Found types");
  if (a.category !== b.category) return excluded("Different categories");
  const delta = Math.abs(dateValue(a.occurredOn) - dateValue(b.occurredOn)) / 86_400_000;
  if (Number.isFinite(delta) && limit !== null && delta > limit) return excluded(`Item dates are outside the ${limit}-day window`);

  const signals: MatchSignal[] = [{ kind: "positive", label: "Same category", points: 12 }];
  const add = (label: string, points: number) => {
    signals.push({ kind: points > 0 ? "positive" : points < 0 ? "negative" : "neutral", label, points });
  };
  const titleA = tokens(a.title), titleB = tokens(b.title);
  const descriptionA = tokens(a.description), descriptionB = tokens(b.description);
  const titlePoints = Math.round(32 * similarity(titleA, titleB));
  if (titlePoints) add("Similar item name", titlePoints);

  const brandA = fieldTokens(a.brand), brandB = fieldTokens(b.brand);
  const brandOverlap = similarity(brandA, brandB);
  const sameBrand = brandA.size > 0 && brandOverlap === 1;
  if (brandA.size && brandB.size) {
    if (sameBrand) add("Same brand", 18);
    else if (brandOverlap > 0) add("Brand wording overlaps; no brand bonus", 0);
    else add("Different brands", -30);
  }

  const colorA = fieldTokens(a.color, true), colorB = fieldTokens(b.color, true);
  if (colorA.size && colorB.size) {
    const colorOverlap = similarity(colorA, colorB);
    if (colorOverlap === 1) add("Same color", 10);
    else if (colorOverlap > 0) add("Overlapping color descriptions", 6);
    else add("Different colors", -18);
  }

  const locationA = tokens(a.location), locationB = tokens(b.location);
  const locationPoints = Math.round(12 * similarity(locationA, locationB));
  if (locationPoints) add("Similar location", locationPoints);
  const descriptionPoints = Math.round(8 * similarity(descriptionA, descriptionB));
  if (descriptionPoints) add("Shared description details", descriptionPoints);
  if (!Number.isFinite(delta)) add("Date unavailable or invalid; no date bonus", 0);
  else if (delta <= 1) add("Item dates within 1 day", 8);
  else if (delta <= 7) add("Item dates within 7 days", 4);
  else add(`Item dates ${delta} days apart; no date bonus`, 0);

  // Brand, color and location repeated in free text are not extra identifying evidence.
  const generic = new Set([...GENERIC, ...brandA, ...brandB, ...colorA, ...colorB, ...locationA, ...locationB]);
  const distinctive = (x: Set<string>, y: Set<string>) => [...x].some((word) => y.has(word) && !generic.has(word));
  if (!distinctive(titleA, titleB) && !distinctive(descriptionA, descriptionB)) {
    const raw = signals.reduce((sum, signal) => sum + signal.points, 0);
    const cap = sameBrand ? MATCH_STRONG_SCORE - 1 : MATCH_MIN_SCORE - 1;
    if (raw > cap) add("Limited identifying details reduce confidence", cap - raw);
  }
  return result(signals);
}

export function findMatches(reports: Report[], currentUserId?: string, options: MatchOptions = {}) {
  matchWindow(options);
  const unique = new Map<string, Report>();
  for (const report of reports) if (!unique.has(report.id)) unique.set(report.id, report);
  const available = [...unique.values()].filter((report) => report.status === "open");
  const foundByCategory = new Map<Report["category"], Report[]>();
  for (const report of available.filter((report) => report.type === "found")) {
    const group = foundByCategory.get(report.category) ?? [];
    group.push(report);
    foundByCategory.set(report.category, group);
  }
  return available.filter((report) => report.type === "lost").flatMap((lost) =>
    (foundByCategory.get(lost.category) ?? [])
      .filter((found) => lost.ownerId !== found.ownerId &&
        (!currentUserId || lost.ownerId === currentUserId || found.ownerId === currentUserId))
      .map((found) => ({ lost, found, ...calculateMatchScore(lost, found, options) })),
  ).filter((match) => match.score >= MATCH_MIN_SCORE)
    .sort((a, b) => b.score - a.score || compareId(a.lost.id, b.lost.id) || compareId(a.found.id, b.found.id));
}

function compareId(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }
