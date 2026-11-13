"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ClipboardList, Clock3, PackageCheck, Plus, Search } from "lucide-react";
import { useApp } from "@/context/app-context";
import { EmptyState, ItemCard, PageHeading, Pagination, StatusTag, TableRegion } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { useDataPage } from "@/context/use-data-page";
import { DataPageStatus } from "@/components/data-page-status";

const PAGE_SIZE = 10;
type Tab = "reports" | "incoming" | "outgoing";

export default function MyReports() {
  const { db: baseDB, user, unreadClaims, dataStats } = useApp();
  const [tab, setTab] = useState<Tab>("reports");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const remote = useDataPage({ kind: tab === "reports" ? "my_reports" : tab, search, status, page, pageSize: PAGE_SIZE }, Boolean(user));
  const db = remote?.db || baseDB;

  const ownReports = useMemo(() => db.reports
    .filter((report) => report.ownerId === user?.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [db.reports, user?.id]);
  const incoming = useMemo(() => db.claims
    .filter((claim) => ownReports.some((report) => report.id === claim.reportId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [db.claims, ownReports]);
  const outgoing = useMemo(() => db.claims
    .filter((claim) => claim.claimantId === user?.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [db.claims, user?.id]);

  const filteredReports = useMemo(() => remote ? remote.ids.flatMap((id) => db.reports.filter((report) => report.id === id)) : ownReports.filter((report) => {
    const haystack = `${report.title} ${report.category} ${report.location}`.toLocaleLowerCase();
    return haystack.includes(search.trim().toLocaleLowerCase()) && (status === "all" || report.status === status);
  }), [ownReports, search, status, remote, db.reports]);

  const sourceClaims = tab === "incoming" ? incoming : outgoing;
  const filteredClaims = useMemo(() => remote ? remote.ids.flatMap((id) => db.claims.filter((claim) => claim.id === id)) : sourceClaims.filter((claim) => {
    const report = db.reports.find((item) => item.id === claim.reportId);
    const otherPersonId = tab === "incoming" ? claim.claimantId : report?.ownerId;
    const otherPerson = db.users.find((person) => person.id === otherPersonId);
    const haystack = `${report?.title || ""} ${otherPerson?.name || ""} ${claim.status}`.toLocaleLowerCase();
    return haystack.includes(search.trim().toLocaleLowerCase()) && (status === "all" || claim.status === status);
  }), [sourceClaims, db.reports, db.users, db.claims, tab, search, status, remote]);

  if (!user) return <div className="page-section container"><EmptyState title="Sign in to access your reports" description="Sign in to manage reports and claims." actionHref="/login" actionText="Sign in" /></div>;

  const currentCount = remote?.total ?? (tab === "reports" ? filteredReports.length : filteredClaims.length);
  const totalPages = Math.max(1, Math.ceil(currentCount / PAGE_SIZE));
  const currentPage = remote && !remote.loading ? remote.page : Math.min(page, totalPages);
  const pageReports = remote ? filteredReports : filteredReports.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const pageClaims = remote ? filteredClaims : filteredClaims.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const pendingIncoming = dataStats?.pendingIncoming ?? incoming.filter((claim) => claim.status === "pending").length;
  const pendingOutgoing = dataStats?.pendingOutgoing ?? outgoing.filter((claim) => claim.status === "pending").length;
  const ownCount = dataStats?.myReports ?? ownReports.length;
  const incomingCount = dataStats?.incoming ?? incoming.length;
  const outgoingCount = dataStats?.outgoing ?? outgoing.length;

  const changeTab = (next: Tab) => { setTab(next); setSearch(""); setStatus("all"); setPage(1); };

  return (
    <section className="page-section container">
      <PageHeading eyebrow="Your campus activity" title="My reports & claims" description="Track the items you have shared and requests made by other campus members." aside={<Link href="/report/lost" className="btn btn-primary"><Plus size={16} /> Create report</Link>} />
      <div className="my-report-stats">
        <div className="panel my-report-stat"><span><ClipboardList size={18} /></span><div><strong>{ownCount}</strong><small>My reports</small></div></div>
        <div className="panel my-report-stat"><span><PackageCheck size={18} /></span><div><strong>{dataStats?.myReturned ?? ownReports.filter((report) => report.status === "returned").length}</strong><small>Returned items</small></div></div>
        <div className="panel my-report-stat"><span><Clock3 size={18} /></span><div><strong>{pendingIncoming}</strong><small>Pending incoming claims</small></div></div>
        <div className="panel my-report-stat"><span><ArrowUpRight size={18} /></span><div><strong>{pendingOutgoing}</strong><small>Pending my claims</small></div></div>
      </div>
      <div className="tab-bar" role="group" aria-label="Report and claim views">
        <button aria-pressed={tab === "reports"} className={tab === "reports" ? "active" : ""} onClick={() => changeTab("reports")}>My reports ({ownCount})</button>
        <button aria-pressed={tab === "incoming"} className={tab === "incoming" ? "active" : ""} onClick={() => changeTab("incoming")}>Incoming claims ({incomingCount})</button>
        <button aria-pressed={tab === "outgoing"} className={tab === "outgoing" ? "active" : ""} onClick={() => changeTab("outgoing")}>My claims ({outgoingCount})</button>
      </div>
      <div className="my-report-filters panel">
        <div className="field"><label htmlFor="my-search">Search {tab === "reports" ? "reports" : "claims"}</label><div className="search-with-icon"><Search size={16} /><input id="my-search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={tab === "reports" ? "Item name, category or location" : "Item, person or claim status"} /></div></div>
        <div className="field"><label htmlFor="my-status">Status</label><select id="my-status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="all">All statuses</option>{(tab === "reports" ? ["open", "returned"] : ["pending", "approved", "disputed", "rejected", "cancelled", "completed"]).map((value) => <option key={value} value={value}>{value.charAt(0).toUpperCase() + value.slice(1)}</option>)}</select></div>
      </div>
      <div className="result-summary">{currentCount} {tab === "reports" ? "reports" : "claims"} found</div>
      <DataPageStatus page={remote} />
      {tab === "reports" ? (
        <div className="items-grid" aria-busy={remote?.loading || undefined}>{pageReports.map((report) => <ItemCard key={report.id} report={report} />)}{filteredReports.length === 0 && !remote?.loading && !remote?.error && <EmptyState title="No reports found" description="Change the filters or create your first lost or found report." actionHref="/report/lost" actionText="Create a report" />}</div>
      ) : (
        <TableRegion label={tab === "incoming" ? "Incoming claims" : "My submitted claims"} busy={remote?.loading}><table className="data-table"><caption className="sr-only">{tab === "incoming" ? "Incoming claims" : "My submitted claims"}</caption><thead><tr><th scope="col">Item</th><th scope="col">Person</th><th scope="col">Created</th><th scope="col">Status</th><th scope="col">Action</th></tr></thead><tbody>
          {pageClaims.map((claim) => {
            const report = db.reports.find((item) => item.id === claim.reportId);
            const personId = tab === "incoming" ? claim.claimantId : report?.ownerId;
            const person = db.users.find((item) => item.id === personId);
            const unread = unreadClaims?.[claim.id] || 0;
            return <tr key={claim.id}><td><strong>{report?.title || "Deleted report"}</strong><small>{report?.type} report</small></td><td>{person?.name || "Campus user"}</td><td>{formatDate(claim.createdAt)}</td><td><StatusTag status={claim.status} /></td><td><Link href={`/claims/${claim.id}`} className="text-link">Open <ArrowUpRight size={14} />{unread > 0 && <span className="claim-unread">{unread} unread</span>}</Link></td></tr>;
          })}
          {filteredClaims.length === 0 && !remote?.loading && !remote?.error && <tr><td colSpan={5}><EmptyState title={tab === "incoming" ? "No incoming claims" : "No claims submitted"} description="New requests will appear here when someone connects with one of your items." /></td></tr>}
        </tbody></table></TableRegion>
      )}
      <Pagination page={currentPage} totalPages={totalPages} onChange={setPage} busy={remote?.loading} label="My reports and claims pages" />
    </section>
  );
}
