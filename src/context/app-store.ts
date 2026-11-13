"use client";

import { createContext, useContext } from "react";
import type { AdminAnalytics, ClaimStatus, DemoDB, ReportDraft, UserProfile } from "@/lib/types";
import type { MessageCursor } from "@/lib/chat";
import type { QueryPage } from "@/lib/data-pages";

export { DEMO_MODE } from "@/lib/config";
type Result<T> = T | Promise<T>;
export type AppStore = {
  ready: boolean;
  db: DemoDB;
  user: UserProfile | null;
  isAdmin: boolean;
  syncError?: string;
  queryPage?: QueryPage;
  dataRevision?: number;
  dataStats?: Record<string, number>;
  unreadNotifications?: number;
  unreadClaims?: Record<string, number>;
  switchUser: (id: string | null) => void;
  registerDemo: (name: string, email: string) => void;
  addReport: (draft: ReportDraft) => Result<string>;
  editReport: (id: string, draft: ReportDraft, reason?: string) => Result<void>;
  removeReport: (id: string) => Result<void>;
  requestClaim: (reportId: string, message: string, relatedReportId?: string) => Result<string>;
  updateClaim: (claimId: string, status: ClaimStatus) => Result<void>;
  sendMessage: (claimId: string, body: string, messageId?: string) => Result<void>;
  confirmHandover: (claimId: string) => Result<void>;
  manageClaim: (claimId: string, action: "cancel" | "dispute" | "resume" | "resolve_cancel", reason: string) => Result<void>;
  markNotificationRead: (id: string) => Result<void>;
  markAllRead: () => Result<void>;
  markClaimMessagesRead: (claimId: string, through: MessageCursor) => Result<void>;
  suspendUser: (id: string, suspended: boolean, reason: string) => Result<void>;
  flagReport: (id: string, reason: string) => Result<void>;
  moderateReport: (id: string, hidden: boolean, reason: string) => Result<void>;
  dismissReportFlag: (id: string, reason: string) => Result<void>;
  getAdminAnalytics: (from?: string, to?: string) => Result<AdminAnalytics>;
  resetDemo: () => void;
};

export const Context = createContext<AppStore | null>(null);
export function useApp(): AppStore {
  const context = useContext(Context);
  if (!context) throw new Error("useApp must be used within AppProvider");
  return context;
}
