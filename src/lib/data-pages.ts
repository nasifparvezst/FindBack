import type { DemoDB, Report } from "./types";

export type DataKind = "bootstrap" | "report" | "claim" | "browse" | "my_reports" | "incoming" | "outgoing" | "notifications" | "admin_reports" | "admin_claims" | "admin_users" | "admin_flags" | "admin_activity" | "related" | "match_sources" | "match_candidates" | "duplicates";
export type DataQuery = { kind: DataKind; page?: number; pageSize?: number; search?: string; category?: string; type?: string; status?: string; visibility?: string; sort?: string; from?: string; to?: string; id?: string; occurredOn?: string; snapshot?: string; cursorAt?: string; cursorId?: string; forExport?: boolean };
export type DataPage = { db: DemoDB; ids: string[]; total: number; page: number; pageSize: number; snapshot: string; stats: Record<string, number>; imagePaths?: Record<string, string | null> };
export type QueryPage = (query: DataQuery, signal?: AbortSignal) => Promise<DataPage>;

export function routeQuery(path: string): DataQuery {
  const report = /^\/item\/([^/]+)(?:\/edit)?$/.exec(path);
  const claim = /^\/claims\/([^/]+)$/.exec(path);
  return report ? { kind: "report", id: report[1] } : claim ? { kind: "claim", id: claim[1] } : { kind: "bootstrap" };
}

/** Only requested pages are retained. Bulk export is explicit, cancellable and uses a stable cursor. */
export async function exportReportPages(fetchPage: QueryPage, filters: DataQuery, signal?: AbortSignal): Promise<Report[]> {
  const reports = new Map<string, Report>();
  let snapshot: string | undefined;
  let cursorAt: string | undefined;
  let cursorId: string | undefined;
  while (true) {
    signal?.throwIfAborted();
    const page = await fetchPage({ ...filters, kind: "admin_reports", sort: "newest", page: 1, pageSize: 100, forExport: true, snapshot, cursorAt, cursorId }, signal);
    signal?.throwIfAborted();
    snapshot ??= page.snapshot;
    const ordered = page.ids.map((id) => page.db.reports.find((report) => report.id === id)).filter((report): report is Report => Boolean(report));
    ordered.forEach((report) => reports.set(report.id, report));
    if (ordered.length < 100) break;
    const last = ordered.at(-1)!;
    if (last.id === cursorId) throw new Error("Export cursor did not advance. Please retry.");
    cursorId = last.id; cursorAt = last.createdAt;
  }
  return [...reports.values()];
}
