import type { ReportType } from "./types";

export function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-BD", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(date));
}

export function relativeDate(value: string) {
  const difference = Math.max(0, Date.now() - new Date(value).getTime());
  const days = Math.floor(difference / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return formatDate(value);
}

export function shortId(id: string) { return `#FB-${id.replace(/\D/g, "").slice(-4) || id.slice(0, 4).toUpperCase()}`; }
export function statusText(status: string) { return status.charAt(0).toUpperCase() + status.slice(1); }
export function reportLabel(type: ReportType) { return type === "lost" ? "Lost" : "Found"; }
