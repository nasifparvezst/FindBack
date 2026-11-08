"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { useApp } from "@/context/app-context";
import { EmptyState, ItemCard, PageHeading, Pagination } from "@/components/ui";
import { CATEGORIES } from "@/lib/types";

const PAGE_SIZE = 12;

export default function Browse() {
  const { db } = useApp();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("newest");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const reports = useMemo(() => [...db.reports].filter((report) => {
    const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    const haystack = `${report.title} ${report.brand} ${report.color} ${report.description} ${report.location} ${report.category}`.toLocaleLowerCase();
    return terms.every((term) => haystack.includes(term)) &&
      (category === "all" || report.category === category) &&
      (type === "all" || report.type === type) &&
      (status === "all" || report.status === status) &&
      (!from || report.occurredOn >= from) &&
      (!to || report.occurredOn <= to);
  }).sort((a, b) =>
    sort === "oldest" ? a.createdAt.localeCompare(b.createdAt) :
    sort === "alphabetical" ? a.title.localeCompare(b.title) :
    sort === "date" ? b.occurredOn.localeCompare(a.occurredOn) :
    b.createdAt.localeCompare(a.createdAt),
  ), [db.reports, query, category, type, status, sort, from, to]);

  const totalPages = Math.max(1, Math.ceil(reports.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visibleReports = reports.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const clear = () => {
    setQuery(""); setCategory("all"); setType("all"); setStatus("all");
    setSort("newest"); setFrom(""); setTo(""); setPage(1);
  };

  return (
    <section className="page-section container">
      <PageHeading eyebrow="Explore the community" title="Browse lost & found items" description="Search, filter and discover items reported around your campus." aside={<Link href="/report/lost" className="btn btn-primary"><Plus size={17} /> New Report</Link>} />
      <div className="filter-panel panel">
        <div className="filter-grid large">
          <div className="field"><label htmlFor="search">Search items</label><div className="search-with-icon"><Search size={17} /><input id="search" className="search-input" placeholder="Search by name, color, location..." value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} /></div></div>
          <div className="field"><label htmlFor="category">Category</label><select id="category" value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }}><option value="all">All categories</option>{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></div>
          <div className="field"><label htmlFor="type">Report type</label><select id="type" value={type} onChange={(event) => { setType(event.target.value); setPage(1); }}><option value="all">All types</option><option value="lost">Lost</option><option value="found">Found</option></select></div>
          <div className="field"><label htmlFor="status">Status</label><select id="status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="all">Any status</option><option value="open">Open</option><option value="returned">Returned</option></select></div>
          <div className="field"><label htmlFor="sort">Sort by</label><select id="sort" value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="date">Item date</option><option value="alphabetical">Name A-Z</option></select></div>
        </div>
        <div className="filter-bottom"><span>Optional date range: <input aria-label="From date" className="date-filter" type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} /> - <input aria-label="To date" className="date-filter" type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} /></span><button onClick={clear}>Clear all filters</button></div>
      </div>
      <div className="result-summary">Showing {reports.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}-{Math.min(currentPage * PAGE_SIZE, reports.length)} of {reports.length} matching reports</div>
      <div className="items-grid">{visibleReports.map((report) => <ItemCard key={report.id} report={report} />)}{reports.length === 0 && <EmptyState title="No matching items found" description="Try different keywords, dates, or categories to broaden your search." actionHref="/report/lost" actionText="Submit a report" />}</div>
      <Pagination page={currentPage} totalPages={totalPages} onChange={setPage} />
    </section>
  );
}
