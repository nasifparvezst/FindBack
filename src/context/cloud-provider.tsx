"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Context, type AppStore } from "@/context/app-store";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { validateReport } from "@/lib/validation";
import { createRefreshQueue, type MessageCursor } from "@/lib/chat";
import { watchPrivateUpdates } from "@/lib/realtime";
import { moderationReason, validateAdminDates } from "@/lib/moderation";
import { routeQuery, type DataQuery } from "@/lib/data-pages";
import { decodeDataPage } from "@/lib/cloud-data";
import type { AdminAnalytics, ClaimStatus, DemoDB, ReportDraft } from "@/lib/types";

function empty(): DemoDB { return { users: [], reports: [], claims: [], messages: [], notifications: [], activity: [] }; }
function check(result: { error: { message: string } | null }): void { if (result.error) throw new Error(result.error.message); }
function checkClaimRpc(result: { error: { message: string; code?: string } | null }): void {
  if (result.error?.code === "PGRST202") throw new Error("Cloud claim workflow needs the Phase 2 migration: 202611120001_two_party_handover.sql. Apply it after the existing migrations, then refresh.");
  check(result);
}

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
  const path = usePathname();
  const client = useMemo(() => createSupabaseBrowserClient(), []);
  const [db, setDB] = useState<DemoDB>(empty);
  const [userId, setUserId] = useState<string | null>(null);
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [syncError, setSyncError] = useState("");
  const imagePaths = useRef(new Map<string, string | null>());
  const sessionVersion = useRef(0);
  const sessionId = useRef<string | null | undefined>(undefined);
  const [summary, setSummary] = useState({ unreadNotifications: 0, unreadClaims: {} as Record<string, number> });

  const [contextPath, setContextPath] = useState('');
  const [dataRevision, setDataRevision] = useState(0);
  const [dataStats, setDataStats] = useState<Record<string, number>>({});
  const queryPage = useCallback(async (query: DataQuery, signal?: AbortSignal) => {
    const version = sessionVersion.current;
    signal?.throwIfAborted();
    const request = client.rpc('get_data_page', { p_query: query });
    const result = await (signal ? request.abortSignal(signal) : request);
    if (version !== sessionVersion.current) throw new DOMException('Account changed', 'AbortError');
    signal?.throwIfAborted();
    if (result.error?.code === 'PGRST202') throw new Error('Apply the Phase 5 migration: 202611130003_paged_data.sql, then refresh.');
    check(result);
    return decodeDataPage(result.data, (path) => client.storage.from('report-images').getPublicUrl(path).data.publicUrl);
  }, [client]);
  const load = useCallback(async () => {
    const version = sessionVersion.current;
    try {
      const { data: auth, error: authError } = await client.auth.getUser();
      if (authError && authError.name !== 'AuthSessionMissingError') throw authError;
      const signedIn = auth?.user || null;
      const [page, counts] = await Promise.all([
        queryPage(routeQuery(path)),
        signedIn ? client.rpc('get_notification_summary') : Promise.resolve({ data: { unreadNotifications: 0, unreadClaims: {} }, error: null }),
      ]);
      if (version !== sessionVersion.current) return;
      check(counts);
      imagePaths.current = new Map(Object.entries(page.imagePaths || {}));
      setUserId(signedIn?.id ?? null); setAuthEmail(signedIn?.email ?? null);
      setSummary(counts.data as { unreadNotifications: number; unreadClaims: Record<string, number> });
      setDB(page.db); setDataStats(page.stats); setContextPath(path);
      setDataRevision((revision) => revision + 1); setSyncError('');
    } catch (error) {
      if (version === sessionVersion.current) { setSyncError(error instanceof Error ? error.message : 'Unable to reach Supabase'); setContextPath(path); }
    } finally { if (version === sessionVersion.current) setReady(true); }
  }, [client, queryPage, path]);
  const refreshQueue = useRef<() => Promise<void>>(async () => {});
  const refresh = useCallback(() => refreshQueue.current(), []);
  const invalidateSession = useCallback(() => { sessionVersion.current++; }, []);

  useEffect(() => {
    refreshQueue.current = createRefreshQueue(load);
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleRefresh = () => {
      clearTimeout(refreshTimer);
      // Run outside the Auth callback and coalesce initial/session refreshes.
      refreshTimer = setTimeout(() => { void refresh(); }, 0);
    };
    scheduleRefresh();
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      const nextId = session?.user.id ?? null;
      if (sessionId.current !== nextId) {
        sessionId.current = nextId;
        invalidateSession();
        // Hide the prior account's private snapshot before fetching the next one.
        setDB(empty()); setUserId(null); setAuthEmail(null);
        setSummary({ unreadNotifications: 0, unreadClaims: {} });
        setDataStats({});
      }
      scheduleRefresh();
    });
    const interval = setInterval(() => { void refresh(); }, 30_000);
    const onFocus = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("online", scheduleRefresh);
    return () => { invalidateSession(); subscription.unsubscribe(); clearTimeout(refreshTimer); clearInterval(interval); document.removeEventListener("visibilitychange", onFocus); window.removeEventListener("online", scheduleRefresh); };
  }, [client, refresh, load, invalidateSession]);

  const user = useMemo(() => db.users.find(u => u.id === userId && !u.suspended) || null, [db.users, userId]);
  const isAdmin = user?.role === "admin";
  const activeUserId = user?.id;
  useEffect(() => {
    if (!activeUserId) return;
    return watchPrivateUpdates(client, { userId: activeUserId, onChange: () => { void refresh(); } });
  }, [client, activeUserId, refresh]);
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
  const editReport = async (id: string, draft: ReportDraft, reason = ""): Promise<void> => {
    const actor = requireUser(); const errors = validateReport(draft);
    if (errors.length) throw new Error(errors[0]);
    const current = db.reports.find(r => r.id === id);
    if (!current) throw new Error("Report not found");
    if (current.ownerId !== actor.id && !isAdmin) throw new Error("Not authorized");
    const auditReason = current.ownerId !== actor.id ? moderationReason(reason) : null;
    const oldPath = imagePaths.current.get(id) || null;
    const uploaded = draft.image?.startsWith("data:image/") ? await storePhoto(client, actor.id, draft.image) : null;
    const path = uploaded || (draft.image === current.image ? oldPath : null);
    const result = await client.rpc("edit_report", { p_id: id, ...makeParams(draft, path), p_reason: auditReason });
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
  const sendMessage = async (claimId: string, body: string, messageId = crypto.randomUUID()): Promise<void> => {
    requireUser(); const clean = body.trim();
    if (!clean || clean.length > 2000) throw new Error("Message must contain 1 to 2000 characters");
    const result = await client.rpc("send_claim_message", { p_claim_id: claimId, p_message_id: messageId, p_body: clean });
    check(result); await refresh();
  };
  const confirmHandover = async (claimId: string): Promise<void> => {
    requireUser(); const result = await client.rpc("confirm_handover", { p_claim_id: claimId });
    checkClaimRpc(result); await refresh();
  };
  const manageClaim = async (claimId: string, action: "cancel" | "dispute" | "resume" | "resolve_cancel", reason: string): Promise<void> => {
    requireUser(); const result = await client.rpc("manage_claim", { p_claim_id: claimId, p_action: action, p_reason: reason.trim() });
    checkClaimRpc(result); await refresh();
  };
  const markNotificationRead = async (id: string): Promise<void> => {
    requireUser(); check(await client.rpc("mark_notification_read", { p_id: id })); await refresh();
  };
  const markAllRead = async (): Promise<void> => {
    requireUser(); check(await client.rpc("mark_all_notifications_read")); await refresh();
  };
  const markClaimMessagesRead = useCallback(async (claimId: string, through: MessageCursor): Promise<void> => {
    check(await client.rpc("mark_claim_messages_read", { p_claim_id: claimId, p_through_created_at: through.createdAt, p_through_id: through.id }));
    await refresh();
  }, [client, refresh]);
  const suspendUser = async (id: string, suspended: boolean, reason: string): Promise<void> => {
    if (!isAdmin) throw new Error("Admin permissions required");
    check(await client.rpc("set_member_suspended", { p_user_id: id, p_suspended: suspended, p_reason: moderationReason(reason) })); await refresh();
  };
  const flagReport = async (id: string, reason: string) => { requireUser(); check(await client.rpc("flag_report", { p_report_id: id, p_reason: moderationReason(reason) })); await refresh(); };
  const moderateReport = async (id: string, hidden: boolean, reason: string) => { requireUser(); check(await client.rpc("moderate_report", { p_report_id: id, p_hidden: hidden, p_reason: moderationReason(reason) })); await refresh(); };
  const dismissReportFlag = async (id: string, reason: string) => { requireUser(); check(await client.rpc("dismiss_report_flag", { p_flag_id: id, p_reason: moderationReason(reason) })); await refresh(); };
  const getAdminAnalytics = useCallback(async (from?: string, to?: string): Promise<AdminAnalytics> => {
    validateAdminDates(from, to);
    const result = await client.rpc("get_admin_analytics", { p_from: from || null, p_to: to || null });
    check(result); return result.data as AdminAnalytics;
  }, [client]);
  const notInCloud = () => { throw new Error("Switching and creating demo users is disabled in cloud mode"); };
  const value: AppStore = {
    ready: ready && contextPath === path, db, user: user ? { ...user, email: authEmail || user.email } : null,
    queryPage, dataRevision, dataStats,
    isAdmin, syncError, ...summary,
    switchUser: notInCloud, registerDemo: notInCloud,
    addReport, editReport, removeReport, requestClaim, updateClaim, sendMessage, confirmHandover, manageClaim,
    markNotificationRead, markAllRead, markClaimMessagesRead, suspendUser, flagReport, moderateReport, dismissReportFlag, getAdminAnalytics, resetDemo: notInCloud,
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
