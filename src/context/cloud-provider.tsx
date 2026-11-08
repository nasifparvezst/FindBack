"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Context, type AppStore } from "@/context/app-store";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { validateReport } from "@/lib/validation";
import type { Activity, Category, Claim, ClaimStatus, DemoDB, Message, Notification, Report, ReportDraft, ReportStatus, ReportType, UserProfile } from "@/lib/types";

type ProfileRow = { id: string; display_name: string; created_at: string; suspended_at: string | null };
type EmailRow = { user_id: string; email: string };
type AdminRow = { user_id: string };
type ReportRow = {
  id: string; owner_id: string; type: string; title: string; category: string; brand: string;
  color: string; location: string; occurred_on: string; description: string;
  image_path: string | null; status: string; linked_report_id: string | null;
  created_at: string; updated_at: string;
};
type ContactRow = { report_id: string; phone: string };
type ClaimRow = { id: string; report_id: string; related_report_id: string | null; claimant_id: string; message: string; status: string; created_at: string; updated_at: string };
type MessageRow = { id: string; claim_id: string; sender_id: string; body: string; created_at: string };
type NoticeRow = { id: string; user_id: string; title: string; body: string; href: string; read_at: string | null; created_at: string };
type ActionRow = { id: string; admin_id: string; action: string; subject: string; created_at: string };

function rows<T>(data: unknown): T[] { return Array.isArray(data) ? data as T[] : []; }
function empty(): DemoDB { return { users: [], reports: [], claims: [], messages: [], notifications: [], activity: [] }; }
function check(result: { error: { message: string } | null }): void { if (result.error) throw new Error(result.error.message); }

// Public item photographs are intentionally shareable. Do not upload ID documents.
async function storePhoto(client: ReturnType<typeof createSupabaseBrowserClient>, ownerId: string, image: string) {
  if (!image.startsWith("data:image/")) throw new Error("Unexpected image format");
  const blob = await (await fetch(image)).blob();
  if (!(["image/jpeg", "image/png", "image/webp"].includes(blob.type))) throw new Error("Use a JPG, PNG or WebP photo");
  if (blob.size > 2_097_152) throw new Error("Photo must be under 2 MB after compression");
  const extension = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
  const path = `${ownerId}/${crypto.randomUUID()}.${extension}`;
  const result = await client.storage.from("report-images").upload(path, blob, { contentType: blob.type, upsert: false });
  check(result);
  return path;
}

export function CloudProvider({ children }: { children: ReactNode }) {
  const client = useMemo(() => createSupabaseBrowserClient(), []);
  const [db, setDB] = useState<DemoDB>(empty);
  const [userId, setUserId] = useState<string | null>(null);
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [syncError, setSyncError] = useState("");
  const imagePaths = useRef(new Map<string, string | null>());

  const refresh = useCallback(async () => {
    try {
      // getUser contacts the Auth server; cookie presence alone is not trusted.
      const { data: auth, error: authError } = await client.auth.getUser();
      if (authError && authError.name !== "AuthSessionMissingError") throw authError;
      const signedIn = auth?.user || null;
      setUserId(signedIn?.id ?? null);
      setAuthEmail(signedIn?.email ?? null);
      const [profiles, reports, emails, admins, contacts, claims, messages, notifications, activities] = await Promise.all([
        client.from("profiles").select(signedIn ? "id,display_name,created_at,suspended_at" : "id,display_name,created_at").limit(500),
        client.from("reports").select("*").order("created_at", { ascending: false }).limit(500),
        signedIn ? client.from("profile_emails").select("user_id,email").limit(500) : Promise.resolve({ data: [], error: null }),
        signedIn ? client.from("admin_members").select("user_id").limit(500) : Promise.resolve({ data: [], error: null }),
        signedIn ? client.from("report_contacts").select("report_id,phone").limit(500) : Promise.resolve({ data: [], error: null }),
        signedIn ? client.from("claims").select("*").order("created_at", { ascending: false }).limit(500) : Promise.resolve({ data: [], error: null }),
        signedIn ? client.from("messages").select("*").order("created_at", { ascending: true }).limit(500) : Promise.resolve({ data: [], error: null }),
        signedIn ? client.from("notifications").select("*").order("created_at", { ascending: false }).limit(500) : Promise.resolve({ data: [], error: null }),
        signedIn ? client.from("moderation_actions").select("*").order("created_at", { ascending: false }).limit(500) : Promise.resolve({ data: [], error: null }),
      ]);
      [profiles, reports, emails, admins, contacts, claims, messages, notifications, activities].forEach(check);
      const emailById = new Map(rows<EmailRow>(emails.data).map(x => [x.user_id, x.email]));
      const adminIds = new Set(rows<AdminRow>(admins.data).map(x => x.user_id));
      const contactById = new Map(rows<ContactRow>(contacts.data).map(x => [x.report_id, x.phone]));
      const paths = new Map<string, string | null>();
      const allReports: Report[] = rows<ReportRow>(reports.data).map(r => {
        paths.set(r.id, r.image_path);
        const photo = r.image_path ? client.storage.from("report-images").getPublicUrl(r.image_path).data.publicUrl : undefined;
        return {
          id: r.id, ownerId: r.owner_id, type: r.type as ReportType, title: r.title,
          category: r.category as Category, brand: r.brand, color: r.color, location: r.location,
          occurredOn: r.occurred_on, description: r.description, contactPhone: contactById.get(r.id) || "",
          image: photo, status: r.status as ReportStatus, linkedReportId: r.linked_report_id || undefined,
          createdAt: r.created_at, updatedAt: r.updated_at,
        };
      });
      imagePaths.current = paths;
      const users: UserProfile[] = rows<ProfileRow>(profiles.data).map(p => ({
        id: p.id, name: p.display_name,
        email: emailById.get(p.id) || (p.id === signedIn?.id ? signedIn?.email || "" : ""),
        role: adminIds.has(p.id) ? "admin" : "student", joinedAt: p.created_at,
        suspended: Boolean(p.suspended_at),
      }));
      const allClaims: Claim[] = rows<ClaimRow>(claims.data).map(c => ({
        id: c.id, reportId: c.report_id, relatedReportId: c.related_report_id || undefined,
        claimantId: c.claimant_id, message: c.message, status: c.status as ClaimStatus,
        createdAt: c.created_at, updatedAt: c.updated_at,
      }));
      const allMessages: Message[] = rows<MessageRow>(messages.data).map(m => ({
        id: m.id, claimId: m.claim_id, senderId: m.sender_id, body: m.body, createdAt: m.created_at,
      }));
      const allNotifications: Notification[] = rows<NoticeRow>(notifications.data).map(n => ({
        id: n.id, userId: n.user_id, title: n.title, body: n.body, href: n.href,
        read: Boolean(n.read_at), createdAt: n.created_at,
      }));
      const activity: Activity[] = rows<ActionRow>(activities.data).map(a => ({
        id: a.id, actorId: a.admin_id, action: a.action, subject: a.subject, createdAt: a.created_at,
      }));
      setDB({ users, reports: allReports, claims: allClaims, messages: allMessages, notifications: allNotifications, activity });
      setSyncError("");
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Unable to reach Supabase");
    } finally {
      setReady(true);
    }
  }, [client]);

  useEffect(() => {
    void refresh();
    const { data: { subscription } } = client.auth.onAuthStateChange(() => {
      // Avoid awaiting a Supabase query *inside* the Auth change callback.
      setTimeout(() => { void refresh(); }, 0);
    });
    const interval = setInterval(() => { void refresh(); }, 30_000);
    const onFocus = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onFocus);
    return () => { subscription.unsubscribe(); clearInterval(interval); document.removeEventListener("visibilitychange", onFocus); };
  }, [client, refresh]);

  const user = useMemo(() => db.users.find(u => u.id === userId && !u.suspended) || null, [db.users, userId]);
  const isAdmin = user?.role === "admin";
  const requireUser = () => { if (!user) throw new Error("Sign in with a verified, active university email address to continue"); return user; };

  const makeParams = (draft: ReportDraft, path: string | null) => ({
    p_type: draft.type, p_title: draft.title.trim(), p_category: draft.category, p_brand: draft.brand,
    p_color: draft.color, p_location: draft.location.trim(), p_occurred_on: draft.occurredOn,
    p_description: draft.description.trim(), p_contact_phone: draft.contactPhone, p_image_path: path,
  });
  const addReport = async (draft: ReportDraft): Promise<string> => {
    const actor = requireUser(); const errors = validateReport(draft);
    if (errors.length) throw new Error(errors[0]);
    const uploadedPath = draft.image?.startsWith("data:image/") ? await storePhoto(client, actor.id, draft.image) : null;
    const result = await client.rpc("create_report", makeParams(draft, uploadedPath));
    if (result.error && uploadedPath) await client.storage.from("report-images").remove([uploadedPath]);
    check(result); await refresh();
    return result.data as string;
  };
  const editReport = async (id: string, draft: ReportDraft): Promise<void> => {
    const actor = requireUser(); const errors = validateReport(draft);
    if (errors.length) throw new Error(errors[0]);
    const current = db.reports.find(r => r.id === id);
    if (!current) throw new Error("Report not found");
    if (current.ownerId !== actor.id && !isAdmin) throw new Error("Not authorized");
    const oldPath = imagePaths.current.get(id) || null;
    const uploaded = draft.image?.startsWith("data:image/") ? await storePhoto(client, actor.id, draft.image) : null;
    const path = uploaded || (draft.image === current.image ? oldPath : null);
    const result = await client.rpc("edit_report", { p_id: id, ...makeParams(draft, path) });
    if (result.error && uploaded) await client.storage.from("report-images").remove([uploaded]);
    check(result);
    // Remove replaced or cleared photos only after the database update succeeds.
    if (oldPath && oldPath !== path) {
      const cleanup = await client.storage.from("report-images").remove([oldPath]);
      if (cleanup.error) console.warn("The old report photo could not be removed from storage.", cleanup.error.message);
    }
    await refresh();
  };
  const removeReport = async (id: string): Promise<void> => {
    requireUser();
    const path = imagePaths.current.get(id);
    const result = await client.rpc("delete_report", { p_id: id }); check(result);
    if (path) await client.storage.from("report-images").remove([path]);
    await refresh();
  };
  const requestClaim = async (reportId: string, message: string, relatedReportId?: string): Promise<string> => {
    requireUser();
    const result = await client.rpc("submit_claim", {
      p_report_id: reportId, p_message: message.trim(), p_related_report_id: relatedReportId || null,
    });
    check(result); await refresh(); return result.data as string;
  };
  const updateClaim = async (claimId: string, status: ClaimStatus): Promise<void> => {
    requireUser();
    if (status !== "approved" && status !== "rejected") throw new Error("Invalid claim review decision");
    const result = await client.rpc("review_claim", { p_claim_id: claimId, p_decision: status });
    check(result); await refresh();
  };
  const sendMessage = async (claimId: string, body: string): Promise<void> => {
    const actor = requireUser(); const clean = body.trim();
    if (!clean || clean.length > 2000) throw new Error("Message must contain 1 to 2000 characters");
    const result = await client.from("messages").insert({ claim_id: claimId, sender_id: actor.id, body: clean });
    check(result); await refresh();
  };
  const markReturned = async (reportId: string): Promise<void> => {
    requireUser(); const result = await client.rpc("complete_handover", { p_report_id: reportId });
    check(result); await refresh();
  };
  const markNotificationRead = async (id: string): Promise<void> => {
    requireUser(); check(await client.rpc("mark_notification_read", { p_id: id })); await refresh();
  };
  const markAllRead = async (): Promise<void> => {
    requireUser(); check(await client.rpc("mark_all_notifications_read")); await refresh();
  };
  const suspendUser = async (id: string, suspended: boolean): Promise<void> => {
    if (!isAdmin) throw new Error("Admin permissions required");
    check(await client.rpc("set_member_suspended", { p_user_id: id, p_suspended: suspended })); await refresh();
  };
  const notInCloud = () => { throw new Error("Switching and creating demo users is disabled in cloud mode"); };
  const value: AppStore = {
    ready, db, user: user ? { ...user, email: authEmail || user.email } : null,
    isAdmin, syncError,
    switchUser: notInCloud, registerDemo: notInCloud,
    addReport, editReport, removeReport, requestClaim, updateClaim, sendMessage, markReturned,
    markNotificationRead, markAllRead, suspendUser, resetDemo: notInCloud,
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
