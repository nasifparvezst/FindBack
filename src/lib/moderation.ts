import { CATEGORIES, type AdminAnalytics, type DemoDB, type Report } from "./types";
import { countRecoveredItems } from "./statistics";

export function moderationReason(reason: string): string {
  const clean = reason.trim();
  if (clean.length < 10 || clean.length > 1000) throw new Error("Provide a reason between 10 and 1000 characters.");
  return clean;
}

export function validateAdminDates(from = "", to = "") {
  for (const value of [from, to]) if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) throw new Error("Choose valid dates.");
  if (from && to && from > to) throw new Error("From date must be before or equal to To date.");
}
export const inAdminRange = (timestamp: string, from = "", to = "") => (!from || timestamp.slice(0, 10) >= from) && (!to || timestamp.slice(0, 10) <= to);

export function buildAdminAnalytics(db: DemoDB, from = "", to = "", now = new Date()): AdminAnalytics {
  validateAdminDates(from, to);
  const reports = db.reports.filter((report) => inAdminRange(report.createdAt, from, to));
  const claims = db.claims.filter((claim) => inAdminRange(claim.createdAt, from, to));
  const anchor = new Date(`${(to || now.toISOString().slice(0, 10)).slice(0, 7)}-01T00:00:00Z`);
  return {
    totalReports: reports.length, hiddenReports: reports.filter((report) => report.hidden).length,
    returnedReports: reports.filter((report) => report.status === "returned").length, recoveredItems: countRecoveredItems(reports, db.claims),
    totalUsers: db.users.length, suspendedUsers: db.users.filter((user) => user.suspended).length,
    pendingClaims: claims.filter((claim) => claim.status === "pending").length, disputedClaims: claims.filter((claim) => claim.status === "disputed").length,
    openFlags: (db.reportFlags || []).filter((flag) => flag.status === "open").length,
    categories: CATEGORIES.map((category) => ({ category, count: reports.filter((report) => report.category === category).length })),
    monthly: Array.from({ length: 6 }, (_, index) => {
      const date = new Date(anchor); date.setUTCMonth(date.getUTCMonth() - (5 - index)); const month = date.toISOString().slice(0, 7);
      return { month, count: reports.filter((report) => report.createdAt.slice(0, 7) === month).length };
    }),
  };
}

export type ModerationAction = { type: "visibility"; id: string; hidden: boolean; reason: string } | { type: "suspend"; id: string; suspended: boolean; reason: string } | { type: "dismiss"; id: string; reason: string };
export function applyModeration(db: DemoDB, actorId: string, action: ModerationAction, timestamp: string): DemoDB {
  if (!db.users.some((user) => user.id === actorId && user.role === "admin" && !user.suspended)) throw new Error("Admin access required.");
  const reason = moderationReason(action.reason);
  let next = db;
  let label = "";
  let subject = "";
  if (action.type === "visibility") {
    const report = db.reports.find((entry) => entry.id === action.id);
    if (!report) throw new Error("Report not found.");
    if (Boolean(report.hidden) === action.hidden) return db;
    label = action.hidden ? "Report hidden" : "Report restored"; subject = `${report.title} (${report.id})`;
    next = { ...db, reports: db.reports.map((entry) => entry.id === report.id ? { ...entry, hidden: action.hidden, moderatedAt: timestamp, updatedAt: timestamp } : entry),
      reportFlags: (db.reportFlags || []).map((flag) => action.hidden && flag.reportId === report.id && flag.status === "open" ? { ...flag, status: "actioned", resolvedAt: timestamp, resolvedBy: actorId, resolutionReason: reason } : flag),
      notifications: [...db.notifications, ...(action.hidden ? (db.reportFlags || []).filter((flag) => flag.reportId === report.id && flag.status === "open").map((flag) => ({ id: `flag-${flag.id}-${timestamp}`, userId: flag.reporterId, title: "Report flag reviewed", body: "Admin reviewed your flag and hid the report.", href: "/notifications", read: false, createdAt: timestamp })) : []), { id: `moderation-${report.id}-${timestamp}`, userId: report.ownerId, title: label, body: reason, href: `/item/${report.id}`, read: false, createdAt: timestamp }] };
  } else if (action.type === "suspend") {
    if (action.id === actorId) throw new Error("You cannot suspend yourself.");
    const user = db.users.find((entry) => entry.id === action.id);
    if (!user) throw new Error("User not found.");
    if (Boolean(user.suspended) === action.suspended) return db;
    label = action.suspended ? "User suspended" : "User restored"; subject = `${user.name} (${user.id})`;
    next = { ...db, users: db.users.map((entry) => entry.id === user.id ? { ...entry, suspended: action.suspended } : entry) };
  } else {
    const flag = (db.reportFlags || []).find((entry) => entry.id === action.id);
    if (!flag || flag.status !== "open") throw new Error("This flag is no longer open.");
    label = "Report flag dismissed"; subject = `${flag.reportId} (flag ${flag.id})`;
    next = { ...db, reportFlags: (db.reportFlags || []).map((entry) => entry.id === flag.id ? { ...entry, status: "dismissed", resolvedAt: timestamp, resolvedBy: actorId, resolutionReason: reason } : entry), notifications: [...db.notifications, { id: `flag-${flag.id}-${timestamp}`, userId: flag.reporterId, title: "Report flag reviewed", body: "Admin reviewed your flag and kept the report visible.", href: "/notifications", read: false, createdAt: timestamp }] };
  }
  return { ...next, activity: [{ id: `moderation-${action.type}-${action.id}-${timestamp}`, actorId, action: label, subject, reason, createdAt: timestamp }, ...next.activity] };
}

export function canReadReport(db: DemoDB, actorId: string | undefined, report: Report): boolean {
  if (!report.hidden) return true;
  const actor = db.users.find((user) => user.id === actorId && !user.suspended);
  return Boolean(actor && (actor.role === "admin" || actor.id === report.ownerId || db.claims.some((claim) =>
    [claim.reportId, claim.relatedReportId].includes(report.id) && (claim.claimantId === actor.id || db.reports.some((entry) => entry.id === claim.reportId && entry.ownerId === actor.id)))));
}

export function addReportFlag(db: DemoDB, actorId: string, reportId: string, reason: string, id: string, timestamp: string): DemoDB {
  const actor = db.users.find((user) => user.id === actorId && !user.suspended);
  if (!actor) throw new Error("Sign in to flag a report.");
  const report = db.reports.find((entry) => entry.id === reportId && !entry.hidden);
  if (!report) throw new Error("Report unavailable.");
  if (report.ownerId === actor.id) throw new Error("You cannot flag your own report.");
  const clean = moderationReason(reason);
  if ((db.reportFlags || []).some((flag) => flag.reportId === reportId && flag.reporterId === actorId && flag.status === "open")) throw new Error("You already have an open flag for this report.");
  return { ...db, reportFlags: [{ id, reportId, reporterId: actorId, reason: clean, status: "open", createdAt: timestamp }, ...(db.reportFlags || [])],
    notifications: [...db.notifications, ...db.users.filter((user) => user.role === "admin").map((user) => ({ id: `${id}-${user.id}`, userId: user.id, title: "Report flagged", body: "A report needs moderation review.", href: "/admin", read: false, createdAt: timestamp }))] };
}

export function reportsCsv(reports: Report[]): string {
  // Spreadsheet programs may execute formulas even inside a quoted CSV cell.
  const cell = (value: string) => `"${(/^[\s\uFEFF]*[=+@-]/u.test(value) || /^[\t\r\n]/u.test(value) ? "'" : "") + value.replaceAll('"', '""')}"`;
  const rows = [["ID", "Type", "Name", "Category", "Location", "Item Date", "Status", "Visibility", "Created At"], ...reports.map((report) => [report.id, report.type, report.title, report.category, report.location, report.occurredOn, report.status, report.hidden ? "hidden" : "visible", report.createdAt])];
  return "\uFEFF" + rows.map((row) => row.map(cell).join(",")).join("\r\n");
}
