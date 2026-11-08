"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { createDemoDB, demoUsers } from "@/lib/demo";
import { calculateMatchScore } from "@/lib/matching";
import type { Activity, Claim, ClaimStatus, DemoDB, Message, Notification, Report, ReportDraft, UserProfile } from "@/lib/types";
import { validEmail, validateReport } from "@/lib/validation";
import { Context, DEMO_MODE } from "@/context/app-store";

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
    if (!DEMO_MODE) { setReady(true); return; }
    try {
      const saved = localStorage.getItem(DB_KEY);
      const parsed: DemoDB = saved ? JSON.parse(saved) as DemoDB : createDemoDB();
      if (!parsed || !Array.isArray(parsed.users) || !Array.isArray(parsed.reports) || !Array.isArray(parsed.claims) || !Array.isArray(parsed.messages) || !Array.isArray(parsed.notifications) || !Array.isArray(parsed.activity)) throw new Error("Invalid demo data");
      setDB(parsed);
      setUserId(localStorage.getItem(USER_KEY) || demoUsers[0].id);
    } catch { setDB(createDemoDB()); setUserId(demoUsers[0].id); }
    setReady(true);
  }, []);
  useEffect(() => { if (ready) localStorage.setItem(DB_KEY, JSON.stringify(db)); }, [db, ready]);
  useEffect(() => { if (ready) { if (userId) localStorage.setItem(USER_KEY, userId); else localStorage.removeItem(USER_KEY); } }, [userId, ready]);

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
      const matches = d.reports.filter((r) => r.type !== report.type && r.status === "open" && r.ownerId !== current.id).map((r) => ({ r, match: calculateMatchScore(report, r) })).filter((x) => x.match.score >= 65).slice(0, 6);
      return { ...d, reports: [report, ...d.reports], activity: [action(current.id, "Report created", report.title), ...d.activity], notifications: [...d.notifications, ...matches.map(({ r }) => notice(r.ownerId, "New potential match", `A new report for ${report.title} might match your item.`, "/matches"))] };
    });
    return id;
  };

  const editReport = (id: string, draft: ReportDraft) => {
    const existing = db.reports.find((r) => r.id === id);
    if (!existing) throw new Error("Report not found.");
    const current = isOwnerOrAdmin(existing.ownerId);
    if (existing.status !== "open") throw new Error("Returned reports cannot be edited.");
    const errors = validateReport(draft);
    if (errors.length) throw new Error(errors[0]);
    setDB((d) => ({ ...d, reports: d.reports.map((r) => r.id === id ? { ...r, ...draft, updatedAt: now() } : r), activity: [action(current.id, "Report updated", existing.title), ...d.activity] }));
  };

  const removeReport = (id: string) => {
    const report = db.reports.find((r) => r.id === id);
    if (!report) throw new Error("Report not found.");
    const current = isOwnerOrAdmin(report.ownerId);
    const claimIds = new Set(db.claims.filter((c) => c.reportId === id).map((c) => c.id));
    setDB((d) => ({ ...d, reports: d.reports.filter((r) => r.id !== id).map((r) => r.linkedReportId === id ? { ...r, linkedReportId: undefined } : r), claims: d.claims.filter((c) => c.reportId !== id).map((c) => c.relatedReportId === id ? { ...c, relatedReportId: undefined } : c), messages: d.messages.filter((m) => !claimIds.has(m.claimId)), activity: [action(current.id, "Report deleted", report.title), ...d.activity] }));
  };

  const requestClaim = (reportId: string, message: string, relatedReportId?: string) => {
    const current = mustLogin(); const report = db.reports.find((r) => r.id === reportId);
    if (!report || report.status !== "open") throw new Error("This report is no longer available for claims.");
    if (report.ownerId === current.id) throw new Error("You cannot claim your own report.");
    if (message.trim().length < 12) throw new Error("Please provide at least 12 characters to explain your claim.");
    if (relatedReportId) {
      const related = db.reports.find((r) => r.id === relatedReportId);
      if (!related || related.ownerId !== current.id || related.type === report.type || related.status !== "open") throw new Error("Selected related report must be your own open report of the opposite type.");
    }
    if (db.claims.some((c) => c.reportId === reportId && c.claimantId === current.id && ["pending", "approved"].includes(c.status))) throw new Error("You already have an active claim for this report.");
    const id = newId(); const claim: Claim = { id, reportId, relatedReportId: relatedReportId || undefined, claimantId: current.id, message: message.trim(), status: "pending", createdAt: now(), updatedAt: now() };
    setDB((d) => ({ ...d, claims: [claim, ...d.claims], notifications: [...d.notifications, notice(report.ownerId, "New claim request", `${current.name} has requested to claim ${report.title}.`, `/claims/${id}`)], activity: [action(current.id, "Claim submitted", report.title), ...d.activity] }));
    return id;
  };

  const updateClaim = (claimId: string, status: ClaimStatus) => {
    const current = mustLogin(); const claim = db.claims.find((c) => c.id === claimId); const report = db.reports.find((r) => r.id === claim?.reportId);
    if (!claim || !report) throw new Error("Claim not found.");
    if (report.ownerId !== current.id && current.role !== "admin") throw new Error("Only the report owner or an admin can review this claim.");
    if (claim.status !== "pending" || !["approved", "rejected"].includes(status)) throw new Error("Only pending claims can be approved or rejected.");
    if (status === "approved" && report.status !== "open") throw new Error("Cannot approve a claim for a returned item.");
    if (status === "approved" && claim.relatedReportId && !db.reports.some((r) => r.id === claim.relatedReportId && r.status === "open" && r.ownerId === claim.claimantId)) throw new Error("The linked report is no longer available.");
    if (status === "approved" && db.claims.some((c) => c.reportId === claim.reportId && c.id !== claimId && c.status === "approved")) throw new Error("Another claim for this item is already approved.");
    setDB((d) => ({ ...d, claims: d.claims.map((c) => c.id === claimId ? { ...c, status, updatedAt: now() } : c), notifications: [...d.notifications, notice(claim.claimantId, `Claim ${status}`, `Your claim for ${report.title} was ${status}.`, `/claims/${claimId}`)], activity: [action(current.id, `Claim ${status}`, report.title), ...d.activity] }));
  };

  const sendMessage = (claimId: string, body: string) => {
    const current = mustLogin(); const claim = db.claims.find((c) => c.id === claimId); const report = db.reports.find((r) => r.id === claim?.reportId);
    if (!claim || !report) throw new Error("Conversation not found.");
    if (![claim.claimantId, report.ownerId].includes(current.id) && current.role !== "admin") throw new Error("You are not part of this conversation.");
    if (claim.status === "rejected" || claim.status === "completed") throw new Error("This conversation is closed.");
    if (!body.trim() || body.trim().length > 2000) throw new Error("Message must contain 1 to 2000 characters.");
    const otherId = current.id === report.ownerId ? claim.claimantId : report.ownerId;
    const message: Message = { id: newId(), claimId, senderId: current.id, body: body.trim(), createdAt: now() };
    setDB((d) => ({ ...d, messages: [...d.messages, message], notifications: [...d.notifications, notice(otherId, "New message", `${current.name} sent you a message about ${report.title}.`, `/claims/${claimId}`)] }));
  };

  const markReturned = (reportId: string) => {
    const report = db.reports.find((r) => r.id === reportId);
    if (!report) throw new Error("Report not found.");
    const current = isOwnerOrAdmin(report.ownerId);
    if (report.status === "returned") throw new Error("This report is already returned.");
    const approved = db.claims.find((c) => c.reportId === reportId && c.status === "approved");
    const related = approved?.relatedReportId ? db.reports.find((r) => r.id === approved.relatedReportId && r.status === "open") : undefined;
    const touched = new Set([reportId, ...(related ? [related.id] : [])]);
    setDB((d) => ({
      ...d,
      reports: d.reports.map((r) => touched.has(r.id) ? { ...r, status: "returned" as const, linkedReportId: related ? (r.id === reportId ? related.id : reportId) : r.linkedReportId, updatedAt: now() } : r),
      claims: d.claims.map((c) => c.reportId === reportId && c.status === "approved" ? { ...c, status: "completed", updatedAt: now() } : c),
      notifications: [...d.notifications, ...(approved ? [notice(approved.claimantId, "Item returned", `${report.title} has been marked returned.`, `/claims/${approved.id}`)] : [])],
      activity: [action(current.id, "Report returned", report.title), ...d.activity],
    }));
  };

  const markNotificationRead = (id: string) => { const current = mustLogin(); setDB((d) => ({ ...d, notifications: d.notifications.map((n) => n.id === id && n.userId === current.id ? { ...n, read: true } : n) })); };
  const markAllRead = () => { const current = mustLogin(); setDB((d) => ({ ...d, notifications: d.notifications.map((n) => n.userId === current.id ? { ...n, read: true } : n) })); };

  const suspendUser = (id: string, suspended: boolean) => {
    const current = mustLogin(); if (current.role !== "admin") throw new Error("Admin access required.");
    if (id === current.id) throw new Error("You cannot suspend yourself.");
    const subject = db.users.find((u) => u.id === id)?.name || id;
    setDB((d) => ({ ...d, users: d.users.map((u) => u.id === id ? { ...u, suspended } : u), activity: [action(current.id, suspended ? "User suspended" : "User restored", subject), ...d.activity] }));
  };

  const resetDemo = () => { setDB(createDemoDB()); setUserId(demoUsers[0].id); };
  return <Context.Provider value={{ ready, db, user, isAdmin, switchUser, registerDemo, addReport, editReport, removeReport, requestClaim, updateClaim, sendMessage, markReturned, markNotificationRead, markAllRead, suspendUser, resetDemo }}>{children}</Context.Provider>;
}

