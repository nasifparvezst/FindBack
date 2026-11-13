"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, Download, Flag, Shield, Users } from "lucide-react";
import { DEMO_MODE, useApp } from "@/context/app-context";
import { EmptyState, PageHeading, Pagination, StatusTag, TypeTag } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { inAdminRange, reportsCsv, validateAdminDates } from "@/lib/moderation";
import { CATEGORIES, type AdminAnalytics } from "@/lib/types";

type Tab = "overview" | "reports" | "claims" | "flags" | "users" | "activity";
type Decision = { type: "visibility" | "suspend" | "dismiss"; id: string; value: boolean; name: string };
const PAGE_SIZE = 15;

export default function Admin() {
  const { db, user, isAdmin, moderateReport, dismissReportFlag, suspendUser, getAdminAnalytics } = useApp();
  const [tab, setTab] = useState<Tab>("overview");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [visibility, setVisibility] = useState("all");
  const [category, setCategory] = useState("all");
  const [type, setType] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [analyticsError, setAnalyticsError] = useState("");
  const [analyticsLoading, setAnalyticsLoading] = useState(true);

  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    const timer = setTimeout(async () => {
      setAnalyticsLoading(true);
      try { const result = await getAdminAnalytics(from, to); if (active) { setAnalytics(result); setAnalyticsError(""); } }
      catch (err) { if (active) setAnalyticsError(err instanceof Error ? err.message : "Could not load analytics."); }
      finally { if (active) setAnalyticsLoading(false); }
    }, 150);
    return () => { active = false; clearTimeout(timer); };
  }, [isAdmin, getAdminAnalytics, from, to, db.reports, db.claims, db.users, db.reportFlags]);

  if (!user || !isAdmin) return <section className="page-section container"><EmptyState title="Administrator access required" description="This area is restricted to admin accounts." actionHref="/login" actionText="Sign in" /></section>;
  let dateError = "";
  try { validateAdminDates(from, to); } catch (err) { dateError = (err as Error).message; }
  const people = new Map(db.users.map((person) => [person.id, person]));
  const reports = new Map(db.reports.map((report) => [report.id, report]));
  const term = search.trim().toLocaleLowerCase();
  const matches = (...values: (string | undefined)[]) => values.join(" ").toLocaleLowerCase().includes(term);
  const inRange = (timestamp: string) => !dateError && inAdminRange(timestamp, from, to);
  const filteredReports = db.reports.filter((report) => inRange(report.createdAt) && matches(report.id, report.title, report.location, people.get(report.ownerId)?.name) &&
    (status === "all" || report.status === status) && (category === "all" || report.category === category) && (type === "all" || report.type === type) &&
    (visibility === "all" || Boolean(report.hidden) === (visibility === "hidden"))).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const filteredClaims = db.claims.filter((claim) => inRange(claim.createdAt) && matches(claim.id, reports.get(claim.reportId)?.title, people.get(claim.claimantId)?.name, claim.issueReason) && (status === "all" || claim.status === status)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const filteredUsers = db.users.filter((person) => inRange(person.joinedAt) && matches(person.id, person.name, person.email) && (status === "all" || Boolean(person.suspended) === (status === "suspended"))).sort((a, b) => b.joinedAt.localeCompare(a.joinedAt));
  const filteredFlags = (db.reportFlags || []).filter((flag) => inRange(flag.createdAt) && matches(flag.id, reports.get(flag.reportId)?.title, people.get(flag.reporterId)?.name, flag.reason) && (status === "all" || flag.status === status)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const filteredActivity = db.activity.filter((entry) => inRange(entry.createdAt) && matches(entry.action, entry.subject, entry.reason, people.get(entry.actorId)?.name)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const total = tab === "reports" ? filteredReports.length : tab === "claims" ? filteredClaims.length : tab === "users" ? filteredUsers.length : tab === "flags" ? filteredFlags.length : filteredActivity.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE)); const currentPage = Math.min(page, totalPages);
  const slice = <T,>(entries: T[]) => entries.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const switchTab = (next: Tab) => { setTab(next); setSearch(""); setStatus(next === "flags" ? "open" : "all"); setVisibility("all"); setCategory("all"); setType("all"); setPage(1); };
  const choose = (next: Decision) => { setDecision(next); setReason(""); setError(""); setSuccess(""); };
  const submitDecision = async (event: React.FormEvent) => {
    event.preventDefault(); if (!decision || busy) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      if (decision.type === "visibility") await moderateReport(decision.id, decision.value, reason);
      else if (decision.type === "suspend") await suspendUser(decision.id, decision.value, reason);
      else await dismissReportFlag(decision.id, reason);
      setDecision(null); setReason(""); setSuccess("Moderation saved with your reason in the audit log.");
    } catch (err) { setError(err instanceof Error ? err.message : "Action failed."); }
    finally { setBusy(false); }
  };
  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([reportsCsv(filteredReports)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "findback-filtered-reports.csv"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const table = (headings: string[], rows: ReactNode[]) => <div className="panel data-table-wrap"><table className="data-table"><thead><tr>{headings.map((heading) => <th key={heading}>{heading}</th>)}</tr></thead><tbody>{rows.length ? rows : <tr><td colSpan={headings.length}>No matching records.</td></tr>}</tbody></table></div>;
  const maxMonth = Math.max(1, ...(analytics?.monthly.map((month) => month.count) || []));
  const maxCategory = Math.max(1, ...(analytics?.categories.map((entry) => entry.count) || []));
  const options = tab === "reports" ? ["open", "returned"] : tab === "claims" ? ["pending", "approved", "disputed", "completed", "rejected", "cancelled"] : tab === "flags" ? ["open", "dismissed", "actioned"] : ["active", "suspended"];
  return <section className="page-section container admin-dashboard">
    <PageHeading eyebrow="Campus management" title="Admin dashboard" description="Review flags, control report visibility and follow recovery performance." aside={tab === "reports" && <button disabled={Boolean(dateError)} onClick={exportCsv} className="btn btn-outline"><Download size={16} /> Export filtered reports ({filteredReports.length})</button>} />
    <div className="admin-date-filters panel"><div className="field"><label htmlFor="admin-from">Created from (UTC)</label><input id="admin-from" type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} /></div><div className="field"><label htmlFor="admin-to">Created through (UTC)</label><input id="admin-to" type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} /></div><button className="btn btn-light btn-sm" onClick={() => { setFrom(""); setTo(""); setPage(1); }}>Clear dates</button></div>
    {(dateError || analyticsError) && <div className="form-error" role="alert">{dateError || analyticsError}</div>}
    <p className="admin-scope" role="status">{analyticsLoading ? "Updating analytics..." : "Report and claim metrics use the selected creation dates. User and open-flag counts cover all dates."}{!DEMO_MODE && " Analytics cover the full database; lists and CSV use up to 500 loaded records per table."}</p>
    {!dateError && !analyticsError && analytics && <div className="stats-grid admin-metrics">{[
      ["Reports", analytics.totalReports], ["Hidden reports", analytics.hiddenReports], ["Recovered items", analytics.recoveredItems], ["Reports returned", `${analytics.totalReports ? Math.round(analytics.returnedReports / analytics.totalReports * 100) : 0}%`],
      ["Pending claims", analytics.pendingClaims], ["Disputed claims", analytics.disputedClaims], ["Open flags (all dates)", analytics.openFlags], ["Suspended users / all users", `${analytics.suspendedUsers} / ${analytics.totalUsers}`],
    ].map(([label, value]) => <div className="stat-card" key={label}><span className="stat-icon"><Shield size={20} /></span><div><div className="stat-label">{label}</div><div className="stat-value">{value}</div></div></div>)}</div>}
    <div className="tab-bar" aria-label="Admin sections">{(["overview", "reports", "claims", "flags", "users", "activity"] as Tab[]).map((name) => <button key={name} disabled={busy} onClick={() => switchTab(name)} className={tab === name ? "active" : ""}>{name === "activity" ? "Audit log" : name[0].toUpperCase() + name.slice(1)}</button>)}</div>
    {error && <div className="form-error" role="alert">{error}</div>}{success && <div className="info-note" role="status">{success}</div>}
    {decision && <form className="panel admin-decision" onSubmit={(event) => { void submitDecision(event); }}><h3>{decision.type === "visibility" ? decision.value ? "Hide report" : "Restore report" : decision.type === "suspend" ? decision.value ? "Suspend user" : "Restore user" : "Dismiss flag"}: {decision.name}</h3><p>{decision.type === "visibility" ? "Hiding removes the report from public discovery and pauses new claims and handover. Existing claim participants retain their private conversation. Hiding also resolves its open flags." : "This action requires a reason and creates an audit entry."}</p><label htmlFor="admin-reason">Reason (10–1000 characters)</label><textarea id="admin-reason" required minLength={10} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} /><div className="table-actions"><button disabled={busy} type="submit" className="btn btn-primary btn-sm">{busy ? "Saving..." : "Confirm moderation"}</button><button disabled={busy} type="button" className="btn btn-light btn-sm" onClick={() => setDecision(null)}>Cancel</button></div></form>}
    {tab === "overview" && analytics && !dateError && !analyticsError && <><div className="admin-grid"><div className="panel chart-card"><h3>Monthly report activity (UTC)</h3><div className="bar-chart">{analytics.monthly.map((month) => <div className="chart-column" key={month.month}><strong>{month.count}</strong><div className="chart-bar" style={{ height: `${Math.max(3, month.count / maxMonth * 150)}px` }} /><span>{month.month}</span></div>)}</div></div><div className="panel chart-card"><h3>Reports by category</h3>{analytics.categories.map((entry) => <div className="category-progress" key={entry.category}><span>{entry.category}</span><div className="category-track"><div style={{ width: `${entry.count / maxCategory * 100}%` }} /></div><strong>{entry.count}</strong></div>)}</div></div><div className="admin-grid"><div className="panel chart-card"><h3><Flag size={18} /> Moderation queue</h3><p>{analytics.openFlags} open flags · {analytics.disputedClaims} disputed claims</p><button className="btn btn-outline btn-sm" onClick={() => switchTab("flags")}>Review flags <ArrowUpRight size={14} /></button><button className="btn btn-light btn-sm" onClick={() => { switchTab("claims"); setStatus("disputed"); }}>Review disputes</button></div><div className="panel chart-card"><h3><Users size={18} /> Recent moderation</h3>{db.activity.filter((entry) => inRange(entry.createdAt)).slice(0, 5).map((entry) => <div className="activity-item" key={entry.id}><div><strong>{entry.action}</strong><small>{entry.subject}</small>{entry.reason && <small>Reason: {entry.reason}</small>}</div></div>)}</div></div></>}
    {tab !== "overview" && <><div className="panel admin-list-filters"><div className="field"><label htmlFor="admin-search">Search {tab}</label><input id="admin-search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Name, item, ID or reason..." /></div>{tab !== "activity" && <div className="field"><label htmlFor="admin-status">Status</label><select id="admin-status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="all">All statuses</option>{options.map((value) => <option key={value} value={value}>{value}</option>)}</select></div>}{tab === "reports" && <><div className="field"><label htmlFor="admin-visibility">Visibility</label><select id="admin-visibility" value={visibility} onChange={(event) => { setVisibility(event.target.value); setPage(1); }}><option value="all">All visibility</option><option value="visible">Visible</option><option value="hidden">Hidden</option></select></div><div className="field"><label htmlFor="admin-category">Category</label><select id="admin-category" value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }}><option value="all">All categories</option>{CATEGORIES.map((value) => <option key={value}>{value}</option>)}</select></div><div className="field"><label htmlFor="admin-type">Type</label><select id="admin-type" value={type} onChange={(event) => { setType(event.target.value); setPage(1); }}><option value="all">All types</option><option value="lost">Lost</option><option value="found">Found</option></select></div></>}</div><p className="result-summary">{total} matching records in the loaded list.</p></>}
    {tab === "reports" && table(["Report", "Owner", "Category / type", "Status", "Visibility", "Actions"], slice(filteredReports).map((report) => <tr key={report.id}><td><strong>{report.title}</strong><small>{formatDate(report.createdAt)}</small></td><td>{people.get(report.ownerId)?.name || "Unknown"}</td><td>{report.category}<br /><TypeTag type={report.type} /></td><td><StatusTag status={report.status} /></td><td>{report.hidden ? "Hidden" : "Visible"}</td><td><div className="table-actions"><Link href={`/item/${report.id}`}>View</Link><button disabled={busy} onClick={() => choose({ type: "visibility", id: report.id, value: !report.hidden, name: report.title })}>{report.hidden ? "Restore" : "Hide"}</button></div></td></tr>))}
    {tab === "claims" && table(["Item", "Claimant", "Status", "Created", "Actions"], slice(filteredClaims).map((claim) => <tr key={claim.id}><td><strong>{reports.get(claim.reportId)?.title || "Removed report"}</strong>{claim.issueReason && <small>{claim.issueReason}</small>}</td><td>{people.get(claim.claimantId)?.name}</td><td><StatusTag status={claim.status} /></td><td>{formatDate(claim.createdAt)}</td><td><Link href={`/claims/${claim.id}`} className="text-link">Review privately <ArrowUpRight size={14} /></Link></td></tr>))}
    {tab === "flags" && table(["Report", "Reported by", "Reason", "Status", "Actions"], slice(filteredFlags).map((flag) => <tr key={flag.id}><td><strong>{reports.get(flag.reportId)?.title || flag.reportId}</strong><small>{formatDate(flag.createdAt)}</small></td><td>{people.get(flag.reporterId)?.name || "Campus member"}</td><td><span className="admin-reason-text">{flag.reason}</span>{flag.resolutionReason && <small>Resolution: {flag.resolutionReason}</small>}</td><td>{flag.status}</td><td><div className="table-actions"><Link href={`/item/${flag.reportId}`}>View</Link>{flag.status === "open" && <><button disabled={busy} onClick={() => choose({ type: "visibility", id: flag.reportId, value: true, name: reports.get(flag.reportId)?.title || flag.reportId })}>Hide report</button><button disabled={busy} onClick={() => choose({ type: "dismiss", id: flag.id, value: false, name: reports.get(flag.reportId)?.title || flag.reportId })}>Dismiss</button></>}</div></td></tr>))}
    {tab === "users" && table(["User", "Role", "Joined", "Account status", "Actions"], slice(filteredUsers).map((person) => <tr key={person.id}><td><strong>{person.name}</strong><small>{person.email}</small></td><td>{person.role}</td><td>{formatDate(person.joinedAt)}</td><td>{person.suspended ? "Suspended" : "Active"}</td><td><button disabled={busy || person.id === user.id} onClick={() => choose({ type: "suspend", id: person.id, value: !person.suspended, name: person.name })}>{person.suspended ? "Restore user" : "Suspend"}</button></td></tr>))}
    {tab === "activity" && <div className="panel chart-card">{slice(filteredActivity).map((entry) => <div className="activity-item" key={entry.id}><div><strong>{entry.action}</strong><small>{entry.subject} · by {people.get(entry.actorId)?.name || "Deleted user"} · {formatDate(entry.createdAt)}</small>{entry.reason && <small>Reason: {entry.reason}</small>}</div></div>)}{!filteredActivity.length && <p>No matching audit entries.</p>}</div>}
    {tab !== "overview" && <Pagination page={currentPage} totalPages={totalPages} onChange={setPage} />}
  </section>;
}
