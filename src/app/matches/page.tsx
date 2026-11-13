"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, ArrowUpRight, GitCompareArrows, Sparkles } from "lucide-react";
import { useApp } from "@/context/app-context";
import { CategoryArt, EmptyState, PageHeading, Pagination, TypeTag } from "@/components/ui";
import { DEFAULT_MATCH_WINDOW_DAYS, findMatches } from "@/lib/matching";
import { useDataPage } from "@/context/use-data-page";
import { DataPageStatus } from "@/components/data-page-status";

export default function Matches() {
  const { db, user, isAdmin } = useApp();
  const [sourcePage,setSourcePage]=useState(1);
  const [candidatePage,setCandidatePage]=useState(1);
  const [sourceId,setSourceId]=useState("");
  const [search,setSearch]=useState("");
  const sources=useDataPage({kind:"match_sources",search,page:sourcePage,pageSize:20});
  const sourceReports=sources?.ids.flatMap((id)=>sources.db.reports.filter((report)=>report.id===id))||[];
  const source=sourceReports.find((report)=>report.id===sourceId)||sourceReports[0];
  const candidates=useDataPage({kind:"match_candidates",id:source?.id,page:candidatePage,pageSize:25},Boolean(sources&&source));
  const candidateReports=source?[source,...(candidates?.db.reports||[])]:[];
  const allMatches = findMatches(sources?candidateReports:db.reports, isAdmin ? undefined : user?.id);
  const matches = allMatches.slice(0, 25);
  return (
    <section className="page-section container">
      <PageHeading eyebrow="Discover more" title="Smart match suggestions"
        description={`Compare open Lost and Found reports from different people. Known item dates use a ${DEFAULT_MATCH_WINDOW_DAYS}-day window.`}
        aside={<Link href="/browse" className="btn btn-outline">Browse items <ArrowUpRight size={16} /></Link>} />
      <div className="info-note" style={{ marginBottom: 23 }}><Sparkles size={19} /><span><strong>A match suggestion is not proof of ownership.</strong> The score ranks similarity on a 0–100 scale. Verify ownership through a claim before handing over an item.</span></div>
      {sources&&<div className="filter-panel panel"><div className="field"><label htmlFor="match-source-search">Find an open report</label><input id="match-source-search" value={search} onChange={(event)=>{setSearch(event.target.value);setSourcePage(1);setSourceId("");setCandidatePage(1);}}/></div><div className="field"><label htmlFor="match-source">Report to match</label><select id="match-source" value={source?.id||""} onChange={(event)=>{setSourceId(event.target.value);setCandidatePage(1);}}><option value="" disabled>Select a report</option>{sourceReports.map((report)=><option key={report.id} value={report.id}>{report.title} ({report.type})</option>)}</select></div><DataPageStatus page={sources}/><Pagination page={sources.page} busy={sources.loading} label="Source report pages" totalPages={Math.max(1,Math.ceil(sources.total/20))} onChange={(page)=>{setSourcePage(page);setSourceId("");setCandidatePage(1);}}/><p className="result-summary">{candidates?.total||0} compatible candidates. Each page ranks up to 25 candidates using the existing matching score.</p><DataPageStatus page={candidates}/></div>}
      {allMatches.length > matches.length && <p className="result-summary">Showing the top {matches.length} of {allMatches.length} suggestions.</p>}
      <div className="match-grid">
        {matches.map(({ lost, found, score, signals, confidence }) => (
          <article className="panel match-card" key={JSON.stringify([lost.id, found.id])}>
            <div className="match-top"><span className="eyebrow" style={{ letterSpacing: ".06em" }}>Potential connection</span><span className={`score-badge ${confidence !== "Strong" ? "weak" : ""}`} aria-label={`Similarity score ${score} out of 100, ${confidence}`}><Sparkles size={14} />{score}/100 · {confidence}</span></div>
            <div className="match-pair">
              <div className="match-side"><Link href={`/item/${lost.id}`}><CategoryArt category={lost.category} image={lost.image} /></Link><strong>{lost.title}</strong><small>{lost.location}</small><TypeTag type="lost" /></div>
              <span className="match-link-icon"><GitCompareArrows size={17} /></span>
              <div className="match-side"><Link href={`/item/${found.id}`}><CategoryArt category={found.category} image={found.image} /></Link><strong>{found.title}</strong><small>{found.location}</small><TypeTag type="found" /></div>
            </div>
            <div className="reason-tags" aria-label="Score explanation">
              {signals.map(({ kind, label, points }) => <span key={label} className={`reason-${kind}`}><b aria-hidden="true">{kind === "positive" ? "✓" : kind === "negative" ? "−" : "•"}</b> {label}{points !== 0 && ` (${points > 0 ? "+" : ""}${points})`}</span>)}
            </div>
            <div className="match-bottom"><span style={{ fontSize: 11, color: "#80978b" }}>Confirm details with the other person</span><Link href={`/item/${user?.id === lost.ownerId ? found.id : lost.id}`} className="btn btn-primary btn-sm">View matching item <ArrowRight size={14} /></Link></div>
          </article>
        ))}
        {matches.length === 0 && !sources?.loading && !candidates?.loading && !sources?.error && !candidates?.error && <EmptyState title="No match suggestions on this page" description="Try another report or candidate page, or add identifying details to your report." actionHref="/browse" actionText="Browse existing items" />}
      </div>
      {candidates&&<Pagination page={candidates.page} busy={candidates.loading} label="Matching candidate pages" totalPages={Math.max(1,Math.ceil(candidates.total/25))} onChange={setCandidatePage}/>}
    </section>
  );
}
