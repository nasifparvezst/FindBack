export const CATEGORIES = ["Phone", "Wallet", "ID Card", "Bag", "Keys", "Electronics", "Book", "Other"] as const;
export type Category = (typeof CATEGORIES)[number];
export type ReportType = "lost" | "found";
export type ReportStatus = "open" | "returned";
export type ClaimStatus = "pending" | "approved" | "rejected" | "completed";
export type Role = "student" | "admin";

export type UserProfile = {
  id: string;
  name: string;
  email: string;
  role: Role;
  joinedAt: string;
  suspended?: boolean;
};

export type Report = {
  id: string;
  type: ReportType;
  title: string;
  category: Category;
  brand: string;
  color: string;
  location: string;
  occurredOn: string;
  description: string;
  contactPhone: string;
  image?: string;
  status: ReportStatus;
  ownerId: string;
  linkedReportId?: string;
  createdAt: string;
  updatedAt: string;
};

export type ReportDraft = Pick<Report, "type" | "title" | "category" | "brand" | "color" | "location" | "occurredOn" | "description" | "contactPhone"> & { image?: string };
export type Claim = { id: string; reportId: string; relatedReportId?: string; claimantId: string; message: string; status: ClaimStatus; createdAt: string; updatedAt: string };
export type Message = { id: string; claimId: string; senderId: string; body: string; createdAt: string };
export type Notification = { id: string; userId: string; title: string; body: string; href: string; read: boolean; createdAt: string };
export type Activity = { id: string; action: string; actorId: string; subject: string; createdAt: string };
export type DemoDB = { users: UserProfile[]; reports: Report[]; claims: Claim[]; messages: Message[]; notifications: Notification[]; activity: Activity[] };
