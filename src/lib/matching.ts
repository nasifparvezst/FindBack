import type { Report } from "./types";

const STOP = new Set(["the", "a", "an", "with", "and", "for", "near", "from", "item", "lost", "found", "in", "on", "at"]);
const tokens = (input: string) => new Set(
  input.toLocaleLowerCase().normalize("NFKC").match(/[\p{L}\p{N}]+/gu)?.filter((t) => t.length > 1 && !STOP.has(t)) ?? [],
);

function similarity(a: string, b: string): number {
  const x = tokens(a), y = tokens(b);
  if (!x.size || !y.size) return 0;
  let shared = 0;
  for (const word of x) if (y.has(word)) shared++;
  return shared / (x.size + y.size - shared);
}

function daysApart(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
}

export type MatchScore = { score: number; reasons: string[]; confidence: "Strong" | "Possible" | "Weak" };
export function calculateMatchScore(a: Pick<Report, "type" | "category" | "title" | "brand" | "color" | "description" | "location" | "occurredOn">, b: typeof a): MatchScore {
  if (a.type === b.type || a.category !== b.category) return { score: 0, reasons: [], confidence: "Weak" };
  const reasons: string[] = ["Same category"];
  let score = 20;
  const title = similarity(a.title, b.title);
  if (title > 0) { score += Math.round(32 * title); reasons.push("Similar item name"); }
  const brandA = a.brand.trim().toLowerCase(), brandB = b.brand.trim().toLowerCase();
  if (brandA && brandB) {
    if (brandA === brandB) { score += 18; reasons.push("Same brand"); }
    else { score -= 30; reasons.push("Different brands"); }
  }
  const colorA = a.color.trim().toLowerCase(), colorB = b.color.trim().toLowerCase();
  if (colorA && colorB) {
    if (colorA === colorB) { score += 10; reasons.push("Same color"); }
    else { score -= 10; reasons.push("Different colors"); }
  }
  const loc = similarity(a.location, b.location);
  if (loc > 0) { score += Math.round(12 * loc); reasons.push("Similar location"); }
  const description = similarity(a.description, b.description);
  if (description > 0) { score += Math.round(8 * description); reasons.push("Shared description details"); }
  const delta = daysApart(a.occurredOn, b.occurredOn);
  if (Number.isFinite(delta) && delta <= 1) { score += 8; reasons.push("Date within 1 day"); }
  else if (Number.isFinite(delta) && delta <= 7) { score += 4; reasons.push("Date within 7 days"); }
  // Same category and nearby dates alone should not create a high-confidence match.
  if (title === 0 && description === 0 && (!brandA || !brandB || brandA !== brandB)) score = Math.min(score, 39);
  const bounded = Math.max(0, Math.min(100, Math.round(score)));
  return { score: bounded, reasons, confidence: bounded >= 75 ? "Strong" : bounded >= 48 ? "Possible" : "Weak" };
}

export function findMatches(reports: Report[], currentUserId?: string) {
  const available = reports.filter((r) => r.status === "open");
  const lost = available.filter((r) => r.type === "lost");
  const found = available.filter((r) => r.type === "found");
  return lost.flatMap((l) => found.map((f) => ({ lost: l, found: f, ...calculateMatchScore(l, f) })))
    .filter((m) => m.score >= 48 && (!currentUserId || m.lost.ownerId === currentUserId || m.found.ownerId === currentUserId))
    .sort((x, y) => y.score - x.score);
}
