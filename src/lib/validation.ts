import type { ReportDraft } from "./types";

export const SEU_EMAIL = /^[a-z0-9._%+-]+@seu\.edu\.bd$/i;
export const BD_PHONE = /^(?:\+?8801|01)[3-9]\d{8}$/;
export function validEmail(email: string) { return SEU_EMAIL.test(email.trim()); }
export function validPhone(phone: string) { return BD_PHONE.test(phone.replace(/[\s-]+/g, "")); }
export function todayLocalISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
export function validateReport(draft: ReportDraft): string[] {
  const issues: string[] = [];
  if (draft.title.trim().length < 2) issues.push("Item name must be at least 2 characters.");
  if (draft.location.trim().length < 2) issues.push("Location must be at least 2 characters.");
  if (draft.description.trim().length < 10) issues.push("Description must be at least 10 characters.");
  if (!draft.occurredOn || Number.isNaN(Date.parse(draft.occurredOn))) issues.push("Please choose a valid date.");
  else if (draft.occurredOn > todayLocalISO()) issues.push("The date cannot be in the future.");
  if (!validPhone(draft.contactPhone)) issues.push("Enter a valid Bangladesh phone number (e.g. 01712345678).");
  if (draft.category === "ID Card" && draft.image) issues.push("Photos are disabled for ID Card reports to protect personal information.");
  if (draft.image?.length && draft.image.length > 1_500_000) issues.push("Compressed image is too large. Choose a smaller photo.");
  return issues;
}
