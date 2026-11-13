import type { Report, ReportDraft } from "./types";

type DuplicateFields = Pick<ReportDraft, "type" | "title" | "category" | "brand" | "color" | "location" | "occurredOn">;

export type DuplicateSuggestion = {
  report: Report;
  score: number;
  reasons: string[];
};

const STOP_WORDS = new Set(["the", "a", "an", "and", "for", "with", "item", "lost", "found", "at", "in", "on"]);

function words(value: string): Set<string> {
  return new Set(
    value.toLocaleLowerCase().normalize("NFKC").match(/[\p{L}\p{N}]+/gu)?.filter((word) => word.length > 1 && !STOP_WORDS.has(word)) ?? [],
  );
}

function overlap(a: string, b: string): number {
  const left = words(a);
  const right = words(b);
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared++;
  return shared / (left.size + right.size - shared);
}

function dateDistance(a: string, b: string): number {
  const first = Date.parse(`${a}T00:00:00Z`);
  const second = Date.parse(`${b}T00:00:00Z`);
  if (!Number.isFinite(first) || !Number.isFinite(second)) return Number.POSITIVE_INFINITY;
  return Math.abs(first - second) / 86_400_000;
}

/** Soft warning only: similar open reports are shown, but never block submission. */
export function findPossibleDuplicates(
  draft: DuplicateFields,
  reports: Report[],
  excludeReportId?: string,
): DuplicateSuggestion[] {
  return reports
    .filter((report) =>
      report.id !== excludeReportId &&
      !report.hidden &&
      report.status === "open" &&
      report.type === draft.type &&
      report.category === draft.category,
    )
    .map((report): DuplicateSuggestion | null => {
      const titleScore = overlap(draft.title, report.title);
      const locationScore = overlap(draft.location, report.location);
      const brandA = draft.brand.trim().toLocaleLowerCase();
      const brandB = report.brand.trim().toLocaleLowerCase();
      const colorA = draft.color.trim().toLocaleLowerCase();
      const colorB = report.color.trim().toLocaleLowerCase();
      const sameBrand = Boolean(brandA && brandB && brandA === brandB);
      const sameColor = Boolean(colorA && colorB && colorA === colorB);
      const days = dateDistance(draft.occurredOn, report.occurredOn);

      if (days > 14) return null;
      if (titleScore < 0.25 && !(sameBrand && (sameColor || locationScore >= 0.3))) return null;

      const reasons = ["Same report type", "Same category"];
      let score = 20;
      if (titleScore > 0) {
        score += Math.round(titleScore * 35);
        reasons.push("Similar item name");
      }
      if (locationScore > 0) {
        score += Math.round(locationScore * 18);
        reasons.push("Similar location");
      }
      if (sameBrand) {
        score += 12;
        reasons.push("Same brand");
      }
      if (sameColor) {
        score += 8;
        reasons.push("Same color");
      }
      if (days <= 1) {
        score += 12;
        reasons.push("Date within 1 day");
      } else if (days <= 7) {
        score += 8;
        reasons.push("Date within 7 days");
      } else {
        score += 4;
        reasons.push("Date within 14 days");
      }
      const bounded = Math.min(100, score);
      return bounded >= 55 ? { report, score: bounded, reasons } : null;
    })
    .filter((item): item is DuplicateSuggestion => item !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
}
