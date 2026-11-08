import type { Claim, Report } from "./types";

/** A completed claim that linked two reports counts as one successful recovery. */
export function countRecoveredItems(reports: Report[], claims: Claim[]): number {
  const returned = reports.filter((r) => r.status === "returned");
  const returnedIds = new Set(returned.map((r) => r.id));
  const completedPairs = new Set(
    claims.filter((c) => c.status === "completed" && c.relatedReportId && returnedIds.has(c.reportId) && returnedIds.has(c.relatedReportId))
      .map((c) => [c.reportId, c.relatedReportId!].sort().join(":")),
  );
  return Math.max(0, returned.length - completedPairs.size);
}
