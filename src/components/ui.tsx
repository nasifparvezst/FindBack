"use client";

import Link from "next/link";
import { ArrowUpRight, CalendarDays, Clock3, MapPin, Package, SearchX, ShieldCheck, ChevronLeft, ChevronRight, Smartphone, Wallet, CreditCard, Backpack, KeyRound, Laptop, BookOpen, type LucideIcon } from "lucide-react";
import { formatDate, relativeDate, shortId } from "@/lib/format";
import type { Category, Report } from "@/lib/types";

const categoryIcons: Record<Category, LucideIcon> = {
  Phone: Smartphone, Wallet, "ID Card": CreditCard, Bag: Backpack, Keys: KeyRound, Electronics: Laptop, Book: BookOpen, Other: Package,
};
export const categoryColors: Record<Category, string> = {
  Phone: "mint", Wallet: "peach", "ID Card": "lilac", Bag: "sky", Keys: "sand", Electronics: "blue", Book: "peach", Other: "mint",
};
export function CategoryArt({ category, image, large = false }: { category: Category; image?: string; large?: boolean }) {
  const Icon = categoryIcons[category];
  return <div className={`category-art ${categoryColors[category]} ${large ? "art-large" : ""}`}>
    {image ? /* eslint-disable-next-line @next/next/no-img-element */ <img className="item-photo" src={image} alt="Uploaded item" /> : <Icon className="category-icon" strokeWidth={1.55} aria-hidden/>}
    {!image && <span className="art-circle art-circle-one"/>}{!image && <span className="art-circle art-circle-two"/>}
  </div>;
}
export function TypeTag({ type }: { type: Report["type"] }) { return <span className={`type-tag ${type}`}>{type === "lost" ? "Lost item" : "Found item"}</span>; }
export function StatusTag({ status }: { status: string }) { return <span className={`status-tag status-${status}`}>{status.charAt(0).toUpperCase()+status.slice(1)}</span>; }
export function ItemCard({ report, compact = false }: { report: Report; compact?: boolean }) {
  return <article className={`item-card ${compact ? "compact" : ""}`}>
    <Link href={`/item/${report.id}`} className="item-card-art" aria-label={`View ${report.title}`}><CategoryArt category={report.category} image={report.image}/><div className="floating-type"><TypeTag type={report.type}/></div></Link>
    <div className="item-card-body">
      <div className="item-topline"><span>{report.category}</span><span>{relativeDate(report.createdAt)}</span></div>
      <Link href={`/item/${report.id}`} className="item-title">{report.title}</Link>
      <div className="card-location"><MapPin size={15}/>{report.location}</div>
      <div className="card-footer"><StatusTag status={report.status}/><Link href={`/item/${report.id}`} className="card-link">View details <ArrowUpRight size={16}/></Link></div>
    </div>
  </article>;
}
export function EmptyState({ title, description, actionHref, actionText }: { title: string; description: string; actionHref?: string; actionText?: string }) {
  return <div className="empty-state"><span className="empty-icon"><SearchX size={28}/></span><h3>{title}</h3><p>{description}</p>{actionHref && <Link href={actionHref} className="btn btn-primary">{actionText || "Get started"}<ChevronRight size={17}/></Link>}</div>;
}
export function PageHeading({ eyebrow, title, description, aside }: { eyebrow?: string; title: string; description?: string; aside?: React.ReactNode }) {
  return <div className="page-heading"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{aside && <div className="page-heading-aside">{aside}</div>}</div>;
}
export function InlineMeta({ report }: { report: Report }) { return <div className="inline-meta"><span><MapPin size={16}/>{report.location}</span><span><CalendarDays size={16}/>{formatDate(report.occurredOn)}</span><span><Clock3 size={16}/>{relativeDate(report.createdAt)}</span></div>; }
export function InfoNote({ children }: { children: React.ReactNode }) { return <div className="info-note"><ShieldCheck size={19}/><span>{children}</span></div>; }

export function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (page: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <nav className="pagination" aria-label="Pagination">
      <button type="button" className="page-button" disabled={page <= 1} onClick={() => onChange(page - 1)}><ChevronLeft size={15} /> Previous</button>
      <span>Page <strong>{page}</strong> of <strong>{totalPages}</strong></span>
      <button type="button" className="page-button" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>Next <ChevronRight size={15} /></button>
    </nav>
  );
}
