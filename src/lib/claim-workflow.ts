import type { Claim, DemoDB } from "./types";

export type ClaimAction =
  | { type: "approved" | "rejected" | "confirm" }
  | { type: "cancel" | "dispute" | "resume" | "resolve_cancel"; reason: string };
export const activeClaim = (claim: Claim) => ["pending", "approved", "disputed"].includes(claim.status);
export const reservedClaim = (claim: Claim) => ["approved", "disputed"].includes(claim.status);
export const canMessageClaim = (claim: Claim) => ["pending", "approved", "disputed"].includes(claim.status);
const reportIds = (claim: Claim) => [claim.reportId, claim.relatedReportId].filter((id): id is string => Boolean(id));

/** Pure Demo transition; Cloud authorization and transitions are enforced separately in PostgreSQL. */
export function applyClaimAction(db: DemoDB, actorId: string, claimId: string, action: ClaimAction, timestamp: string): DemoDB {
  const actor = db.users.find((user) => user.id === actorId && !user.suspended);
  if (!actor) throw new Error("An active account is required.");
  const claim = db.claims.find((entry) => entry.id === claimId);
  const report = db.reports.find((entry) => entry.id === claim?.reportId);
  if (!claim || !report) throw new Error("Claim not found.");
  const owner = actorId === report.ownerId;
  const claimant = actorId === claim.claimantId;
  const participant = owner || claimant;
  const admin = actor.role === "admin";
  if (!participant && !admin) throw new Error("You are not part of this claim.");
  const reason = "reason" in action ? (action.reason ?? "").trim() : "";
  if (["cancel", "dispute", "resume", "resolve_cancel"].includes(action.type) && (reason.length < 10 || reason.length > 1000)) {
    throw new Error("Provide a reason between 10 and 1000 characters.");
  }
  const ids = new Set(reportIds(claim));
  const checkAvailable = () => {
    if (report.hidden) throw new Error("A report is hidden. Admin must restore it before handover continues.");
    if (report.status !== "open") throw new Error("The report is no longer open.");
    if (claim.relatedReportId) {
      const related = db.reports.find((entry) => entry.id === claim.relatedReportId);
      if (!related || related.hidden || related.status !== "open" || related.ownerId !== claim.claimantId || related.type === report.type || related.category !== report.category) {
        throw new Error("The linked report is no longer compatible or available.");
      }
    }
    if (db.claims.some((other) => other.id !== claim.id && reservedClaim(other) && reportIds(other).some((id) => ids.has(id)))) {
      throw new Error("One of these reports is reserved by another claim.");
    }
  };
  let next: Claim = { ...claim, updatedAt: timestamp };
  let title = "";
  if (action.type === "approved" || action.type === "rejected") {
    if (!owner && !admin) throw new Error("Only the report owner or an admin may review this claim.");
    if (claim.status !== "pending") throw new Error("Only pending claims can be reviewed.");
    if (action.type === "approved") checkAvailable();
    next = { ...next, status: action.type, reviewedAt: timestamp };
    title = `Claim ${action.type}`;
  } else if (action.type === "confirm") {
    if (!participant) throw new Error("Only the two claim participants can confirm handover.");
    if (claim.status === "completed") return db;
    if (claim.status !== "approved") throw new Error("An approved, undisputed claim is required.");
    checkAvailable();
    if (owner ? claim.ownerConfirmedAt : claim.claimantConfirmedAt) return db;
    next = { ...next, ...(owner ? { ownerConfirmedAt: timestamp } : { claimantConfirmedAt: timestamp }) };
    const complete = Boolean(next.ownerConfirmedAt && next.claimantConfirmedAt);
    if (complete) next = { ...next, status: "completed", completedAt: timestamp };
    title = complete ? "Handover completed" : "Handover confirmation recorded";
  } else if (action.type === "cancel") {
    if (!participant || !(claim.status === "approved" || (claim.status === "pending" && claimant))) throw new Error("This claim cannot be cancelled by you.");
    if (claim.ownerConfirmedAt || claim.claimantConfirmedAt) throw new Error("A handover confirmation exists. Raise a dispute instead.");
    next = { ...next, status: "cancelled", cancelledAt: timestamp, issueReason: reason };
    title = "Claim cancelled";
  } else if (action.type === "dispute") {
    if (!participant || claim.status !== "approved") throw new Error("Only participants of an approved claim can raise a dispute.");
    next = { ...next, status: "disputed", disputedAt: timestamp, issueReason: reason };
    title = "Claim disputed";
  } else {
    if (!admin || claim.status !== "disputed") throw new Error("An admin must resolve a disputed claim.");
    if (action.type === "resume") checkAvailable();
    next = { ...next, status: action.type === "resume" ? "approved" : "cancelled", resolvedAt: timestamp, resolutionReason: reason,
      ...(action.type === "resume" ? { ownerConfirmedAt: undefined, claimantConfirmedAt: undefined } : { cancelledAt: timestamp }) };
    title = action.type === "resume" ? "Claim resumed; new confirmations required" : "Disputed claim cancelled";
  }
  const completed = next.status === "completed";
  const closed = completed ? db.claims.filter((other) => other.id !== claim.id && other.status === "pending" && reportIds(other).some((id) => ids.has(id))) : [];
  const closedIds = new Set(closed.map((other) => other.id));
  const notices = [next, ...closed].flatMap((entry) => {
    const entryReport = db.reports.find((item) => item.id === entry.reportId)!;
    return [...new Set([entryReport.ownerId, entry.claimantId])].map((userId) => ({
      id: `claim-${entry.id}-${action.type}-${timestamp}-${userId}`, userId,
      title: entry.id === claim.id ? title : "Claim cancelled",
      body: entry.id === claim.id ? `The claim for ${report.title} was updated.` : "Another claim completed the return of a linked item.",
      href: `/claims/${entry.id}`, read: false, createdAt: timestamp,
    }));
  });
  return {
    ...db,
    claims: db.claims.map((entry) => entry.id === claim.id ? next : closedIds.has(entry.id) ? { ...entry, status: "cancelled", cancelledAt: timestamp, updatedAt: timestamp, issueReason: "Another claim completed the return of a linked item." } : entry),
    reports: completed ? db.reports.map((entry) => ids.has(entry.id) ? { ...entry, status: "returned", updatedAt: timestamp, linkedReportId: entry.id === report.id ? claim.relatedReportId : report.id } : entry) : db.reports,
    notifications: [...db.notifications, ...notices],
    activity: [{ id: `claim-${claim.id}-${action.type}-${timestamp}`, actorId, action: title, subject: `Claim ${claim.id}: ${report.title}`, reason: reason || undefined, createdAt: timestamp }, ...db.activity],
  };
}
