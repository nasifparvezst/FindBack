import type { Activity, Category, Claim, ClaimStatus, Notification, Report, ReportFlag, ReportStatus, ReportType, UserProfile } from "./types";
import type { DataPage } from "./data-pages";

type Row = Record<string, unknown>;
const list = (data: Row, key: string): Row[] => Array.isArray(data[key]) ? data[key] as Row[] : [];
const str = (row: Row, key: string) => typeof row[key] === "string" ? row[key] as string : "";
const optional = (row: Row, key: string) => str(row, key) || undefined;

export function decodeDataPage(data: unknown, publicImage: (path: string) => string): DataPage {
  if (!data || typeof data !== "object" || !Array.isArray((data as Row).ids)) throw new Error("Invalid database page response.");
  const envelope = data as Row;
  if (![envelope.total,envelope.page,envelope.pageSize].every((value) => typeof value === "number" && Number.isSafeInteger(value)) || Number(envelope.total)<0 || Number(envelope.page)<1 || Number(envelope.pageSize)<1 || Number(envelope.pageSize)>100) throw new Error("Invalid database page counters.");
  const bundle = (envelope.bundle || {}) as Row;
  const emails = new Map(list(bundle, "emails").map((row) => [str(row, "user_id"), str(row, "email")]));
  const admins = new Set(list(bundle, "admins").map((row) => str(row, "user_id")));
  const contacts = new Map(list(bundle, "contacts").map((row) => [str(row, "report_id"), str(row, "phone")]));
  const users: UserProfile[] = list(bundle, "profiles").map((row) => ({ id: str(row, "id"), name: str(row, "display_name"), joinedAt: str(row, "created_at"), email: emails.get(str(row, "id")) || "", role: admins.has(str(row, "id")) ? "admin" : "student", suspended: Boolean(row.suspended_at) }));
  const reports: Report[] = list(bundle, "reports").map((row) => ({ id: str(row, "id"), ownerId: str(row, "owner_id"), type: str(row, "type") as ReportType, title: str(row, "title"), category: str(row, "category") as Category, brand: str(row, "brand"), color: str(row, "color"), location: str(row, "location"), occurredOn: str(row, "occurred_on"), description: str(row, "description"), contactPhone: contacts.get(str(row, "id")) || "", image: row.image_path ? publicImage(str(row, "image_path")) : undefined, status: str(row, "status") as ReportStatus, linkedReportId: optional(row, "linked_report_id"), hidden: Boolean(row.hidden), moderatedAt: optional(row, "moderated_at"), createdAt: str(row, "created_at"), updatedAt: str(row, "updated_at") }));
  const claims: Claim[] = list(bundle, "claims").map((row) => ({ id: str(row, "id"), reportId: str(row, "report_id"), relatedReportId: optional(row, "related_report_id"), claimantId: str(row, "claimant_id"), message: str(row, "message"), status: str(row, "status") as ClaimStatus, createdAt: str(row, "created_at"), updatedAt: str(row, "updated_at"), reviewedAt: optional(row, "reviewed_at"), ownerConfirmedAt: optional(row, "owner_confirmed_at"), claimantConfirmedAt: optional(row, "claimant_confirmed_at"), completedAt: optional(row, "completed_at"), cancelledAt: optional(row, "cancelled_at"), disputedAt: optional(row, "disputed_at"), issueReason: optional(row, "issue_reason"), resolvedAt: optional(row, "resolved_at"), resolutionReason: optional(row, "resolution_reason") }));
  const notifications: Notification[] = list(bundle, "notifications").map((row) => ({ id: str(row, "id"), userId: str(row, "user_id"), title: str(row, "title"), body: str(row, "body"), href: str(row, "href"), read: Boolean(row.read_at), messageId: optional(row, "message_id"), createdAt: str(row, "created_at") }));
  const activity: Activity[] = list(bundle, "activity").map((row) => ({ id: str(row, "id"), actorId: str(row, "admin_id"), action: str(row, "action"), subject: str(row, "subject"), createdAt: str(row, "created_at"), reason: optional(row, "reason") }));
  const reportFlags: ReportFlag[] = list(bundle, "flags").map((row) => ({ id: str(row, "id"), reportId: str(row, "report_id"), reporterId: str(row, "reporter_id"), reason: str(row, "reason"), status: str(row, "status") as ReportFlag["status"], createdAt: str(row, "created_at"), resolvedAt: optional(row, "resolved_at"), resolvedBy: optional(row, "resolved_by"), resolutionReason: optional(row, "resolution_reason") }));
  return { db: { users, reports, claims, messages: [], notifications, activity, reportFlags }, ids: envelope.ids as string[], total: Number(envelope.total), page: Number(envelope.page), pageSize: Number(envelope.pageSize), snapshot: str(envelope, "snapshot"), stats: (envelope.stats || {}) as Record<string, number>, imagePaths: Object.fromEntries(list(bundle, "reports").map((row) => [str(row, "id"), str(row, "image_path") || null])) };
}
