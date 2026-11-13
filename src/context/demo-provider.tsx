"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { createDemoDB, demoUsers } from "@/lib/demo";
import { calculateMatchScore } from "@/lib/matching";
import { activeClaim, applyClaimAction, canMessageClaim, reservedClaim } from "@/lib/claim-workflow";
import type { Activity, Claim, ClaimStatus, DemoDB, Message, Notification, Report, ReportDraft, UserProfile } from "@/lib/types";
import { validEmail, validateReport } from "@/lib/validation";
import { compareMessages, notificationSummary, type MessageCursor } from "@/lib/chat";
import { addReportFlag, applyModeration, buildAdminAnalytics, moderationReason } from "@/lib/moderation";
import { Context, DEMO_MODE } from "@/context/app-store";
import { DEMO_GUEST, restoreDemoUser } from "@/lib/demo-session";

const DB_KEY = "findback_v2_demo_data";
const USER_KEY = "findback_v2_demo_user";
const newId = () => typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const now = () => new Date().toISOString();

const notice = (userId: string, title: string, body: string, href: string): Notification => ({ id: newId(), userId, title, body, href, read: false, createdAt: now() });
const action = (actorId: string, title: string, subject: string): Activity => ({ id: newId(), actorId, action: title, subject, createdAt: now() });

export function DemoProvider({ children }: { children: ReactNode }) {
  const [db, setDB] = useState<DemoDB>(() => ({ users: [], reports: [], claims: [], messages: [], notifications: [], activity: [] }));
  const [userId, setUserId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Hydrate browser storage after mount and cancel the read on an early unmount.
    const timer = setTimeout(() => {
      if (!DEMO_MODE) { setReady(true); return; }
      try {
        const saved = localStorage.getItem(DB_KEY);
        const parsed: DemoDB = saved ? JSON.parse(saved) as DemoDB : createDemoDB();
        if (!parsed || !Array.isArray(parsed.users) || !Array.isArray(parsed.reports) || !Array.isArray(parsed.claims) || !Array.isArray(parsed.messages) || !Array.isArray(parsed.notifications) || !Array.isArray(parsed.activity)) throw new Error("Invalid demo data");
        setDB(parsed);
        setUserId(restoreDemoUser(localStorage.getItem(USER_KEY), demoUsers[0].id, parsed.users));
      } catch { setDB(createDemoDB()); setUserId(demoUsers[0].id); }
      setReady(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => { if (ready) localStorage.setItem(DB_KEY, JSON.stringify(db)); }, [db, ready]);
  useEffect(() => { if (ready) localStorage.setItem(USER_KEY, userId ?? DEMO_GUEST); }, [userId, ready]);

  const user = useMemo(() => db.users.find((u) => u.id === userId && !u.suspended) ?? null, [db.users, userId]);
  const isAdmin = user?.role === "admin";
  const mustLogin = () => { if (!user) throw new Error("Sign in to continue."); return user; };
  const isOwnerOrAdmin = (ownerId: string) => { const current = mustLogin(); if (current.id !== ownerId && current.role !== "admin") throw new Error("You do not have permission to do that."); return current; };

  const switchUser = useCallback((id: string | null) => {
    if (id && !db.users.some((u) => u.id === id && !u.suspended)) throw new Error("This user is not available.");
    setUserId(id);
  }, [db.users]);

  const registerDemo = (name: string, email: string) => {
    if (name.trim().length < 2 || !validEmail(email)) throw new Error("Enter your name and an @seu.edu.bd email address.");
    if (db.users.some((u) => u.email.toLowerCase() === email.trim().toLowerCase())) throw new Error("This email already exists in the demo.");
    const newUser: UserProfile = { id: newId(), name: name.trim(), email: email.trim().toLowerCase(), role: "student", joinedAt: now() };
    setDB((d) => ({ ...d, users: [...d.users, newUser] })); setUserId(newUser.id);
  };

  const addReport = (draft: ReportDraft) => {
    const current = mustLogin();
    const errors = validateReport(draft);
    if (errors.length) throw new Error(errors[0]);
    const id = newId();
    const report: Report = { ...draft, id, ownerId: current.id, status: "open", createdAt: now(), updatedAt: now() };
    setDB((d) => {
      const matches = d.reports.filter((r) => !r.hidden && r.type !== report.type && r.status === "open" && r.ownerId !== current.id).map((r) => ({ r, match: calculateMatchScore(report, r) })).filter((x) => x.match.score >= 65).slice(0, 6);
      return { ...d, reports: [report, ...d.reports], activity: [action(current.id, "Report created", report.title), ...d.activity], notifications: [...d.notifications, ...matches.map(({ r }) => notice(r.ownerId, "New potential match", `A new report for ${report.title} might match your item.`, "/matches"))] };
    });
    return id;
  };

  const editReport = (id: string, draft: ReportDraft, reason = "") => {
    const existing = db.reports.find((r) => r.id === id);
    if (!existing) throw new Error("Report not found.");
    const current = isOwnerOrAdmin(existing.ownerId);
    const auditReason = current.role === "admin" && current.id !== existing.ownerId ? moderationReason(reason) : undefined;
    if (existing.status !== "open") throw new Error("Returned reports cannot be edited.");
    if ((draft.type !== existing.type || draft.category !== existing.category) && db.claims.some((claim) => activeClaim(claim) && [claim.reportId, claim.relatedReportId].includes(id))) throw new Error("Resolve active claims before changing report type or category.");
    const errors = validateReport(draft);
    if (errors.length) throw new Error(errors[0]);
    setDB((d) => ({ ...d, reports: d.reports.map((r) => r.id === id ? { ...r, ...draft, updatedAt: now() } : r), activity: [{ ...action(current.id, "Report updated", `${existing.title} (${id})`), reason: auditReason }, ...d.activity] }));
  };

  const removeReport = (id: string) => {
    const report = db.reports.find((r) => r.id === id);
    if (!report) throw new Error("Report not found.");
    const current = isOwnerOrAdmin(report.ownerId);
    if (current.role === "admin" && current.id !== report.ownerId) throw new Error("Use hide/restore to moderate another member's report.");
    if (report.hidden || (db.reportFlags || []).some((flag) => flag.reportId === id && flag.status === "open")) throw new Error("A moderated or flagged report cannot be deleted. Contact Admin.");
    if (db.claims.some((claim) => reservedClaim(claim) && [claim.reportId, claim.relatedReportId].includes(id))) throw new Error("Resolve the approved or disputed claim before deleting this report.");
    const claimIds = new Set(db.claims.filter((c) => c.reportId === id).map((c) => c.id));
    setDB((d) => ({ ...d, reports: d.reports.filter((r) => r.id !== id).map((r) => r.linkedReportId === id ? { ...r, linkedReportId: undefined } : r), claims: d.claims.filter((c) => c.reportId !== id).map((c) => c.relatedReportId === id ? { ...c, relatedReportId: undefined } : c), messages: d.messages.filter((m) => !claimIds.has(m.claimId)), activity: [action(current.id, "Report deleted", report.title), ...d.activity] }));
  };

  const requestClaim = (reportId: string, message: string, relatedReportId?: string) => {
    const current = mustLogin(); const report = db.reports.find((r) => r.id === reportId);
    if (!report || report.hidden || report.status !== "open") throw new Error("This report is no longer available for claims.");
    if (report.ownerId === current.id) throw new Error("You cannot claim your own report.");
    if (message.trim().length < 12 || message.trim().length > 2000) throw new Error("Provide 12 to 2000 characters of non-sensitive identifying details.");
    if (relatedReportId) {
      const related = db.reports.find((r) => r.id === relatedReportId);
      if (!related || related.hidden || related.ownerId !== current.id || related.type === report.type || related.category !== report.category || related.status !== "open") throw new Error("Select your own visible, open, opposite-type report in the same category.");
    }
    if (db.claims.some((c) => c.reportId === reportId && c.claimantId === current.id && activeClaim(c))) throw new Error("You already have an active claim for this report.");
    if (db.claims.some((c) => reservedClaim(c) && [c.reportId, c.relatedReportId].some((id) => id === reportId || Boolean(relatedReportId && id === relatedReportId)))) throw new Error("A selected report is reserved by another claim.");
    const id = newId(); const claim: Claim = { id, reportId, relatedReportId: relatedReportId || undefined, claimantId: current.id, message: message.trim(), status: "pending", createdAt: now(), updatedAt: now() };
    setDB((d) => ({ ...d, claims: [claim, ...d.claims], notifications: [...d.notifications, ...[report.ownerId, current.id].map((userId) => notice(userId, "New claim request", `A claim for ${report.title} was submitted.`, `/claims/${id}`))], activity: [action(current.id, "Claim submitted", report.title), ...d.activity] }));
    return id;
  };

  const updateClaim = (claimId: string, status: ClaimStatus) => {
    const current = mustLogin();
    if (status !== "approved" && status !== "rejected") throw new Error("Invalid claim review decision.");
    setDB(applyClaimAction(db, current.id, claimId, { type: status }, now()));
  };

  const sendMessage = (claimId: string, body: string, messageId = newId()) => {
    const current = mustLogin(); const claim = db.claims.find((c) => c.id === claimId); const report = db.reports.find((r) => r.id === claim?.reportId);
    if (!claim || !report) throw new Error("Conversation not found.");
    if (![claim.claimantId, report.ownerId].includes(current.id) && current.role !== "admin") throw new Error("You are not part of this conversation.");
    const previous = db.messages.find((entry) => entry.id === messageId);
    if (previous) {
      if (previous.senderId === current.id && previous.claimId === claimId && previous.body === body.trim()) return;
      throw new Error("This message delivery ID is already in use.");
    }
    if (!canMessageClaim(claim)) throw new Error("This conversation is closed.");
    if (!body.trim() || body.trim().length > 2000) throw new Error("Message must contain 1 to 2000 characters.");
    const message: Message = { id: messageId, claimId, senderId: current.id, body: body.trim(), createdAt: now() };
    const recipients = [...new Set([claim.claimantId, report.ownerId])].filter((id) => id !== current.id);
    setDB((d) => ({ ...d, messages: [...d.messages, message], notifications: [...d.notifications, ...recipients.map((id) => ({ ...notice(id, "New message", `${current.name} sent you a message about ${report.title}.`, `/claims/${claimId}`), messageId: message.id, createdAt: message.createdAt }))] }));
  };

  const confirmHandover = (claimId: string) => { const current = mustLogin(); setDB(applyClaimAction(db, current.id, claimId, { type: "confirm" }, now())); };
  const manageClaim = (claimId: string, type: "cancel" | "dispute" | "resume" | "resolve_cancel", reason: string) => { const current = mustLogin(); setDB(applyClaimAction(db, current.id, claimId, { type, reason }, now())); };

  const markNotificationRead = (id: string) => { const current = mustLogin(); setDB((d) => ({ ...d, notifications: d.notifications.map((n) => n.id === id && n.userId === current.id ? { ...n, read: true } : n) })); };
  const markAllRead = () => { const current = mustLogin(); setDB((d) => ({ ...d, notifications: d.notifications.map((n) => n.userId === current.id ? { ...n, read: true } : n) })); };
  const markClaimMessagesRead = useCallback((claimId: string, through: MessageCursor) => {
    if (!user) throw new Error("Sign in to continue.");
    setDB((d) => ({ ...d, notifications: d.notifications.map((n) => {
      if (n.read || n.userId !== user.id || n.title !== "New message" || n.href !== `/claims/${claimId}`) return n;
      const message = d.messages.find((entry) => entry.id === n.messageId);
      const visible = message ? compareMessages(message, through) <= 0 : n.createdAt <= through.createdAt;
      return visible ? { ...n, read: true } : n;
    }) }));
  }, [user]);

  const suspendUser = (id: string, suspended: boolean, reason: string) => { const current = mustLogin(); setDB(applyModeration(db, current.id, { type: "suspend", id, suspended, reason }, now())); };
  const moderateReport = (id: string, hidden: boolean, reason: string) => { const current = mustLogin(); setDB(applyModeration(db, current.id, { type: "visibility", id, hidden, reason }, now())); };
  const dismissReportFlag = (id: string, reason: string) => { const current = mustLogin(); setDB(applyModeration(db, current.id, { type: "dismiss", id, reason }, now())); };
  const flagReport = (id: string, reason: string) => { const current = mustLogin(); setDB(addReportFlag(db, current.id, id, reason, newId(), now())); };
  const getAdminAnalytics = useCallback((from?: string, to?: string) => {
    if (!user || user.role !== "admin") throw new Error("Admin access required.");
    return buildAdminAnalytics(db, from, to);
  }, [db, user]);

  const resetDemo = () => { setDB(createDemoDB()); setUserId(demoUsers[0].id); };
  return <Context.Provider value={{ ready, db, user, isAdmin, ...notificationSummary(db.notifications, user?.id), switchUser, registerDemo, addReport, editReport, removeReport, requestClaim, updateClaim, sendMessage, confirmHandover, manageClaim, markNotificationRead, markAllRead, markClaimMessagesRead, suspendUser, flagReport, moderateReport, dismissReportFlag, getAdminAnalytics, resetDemo }}>{children}</Context.Provider>;
}

