"use client";

import Link from "next/link";
import { ArrowRight, ArrowUpRight, GitCompareArrows, Sparkles } from "lucide-react";
import { useApp } from "@/context/app-context";
import { CategoryArt, EmptyState, PageHeading, TypeTag } from "@/components/ui";
import { DEFAULT_MATCH_WINDOW_DAYS, findMatches } from "@/lib/matching";

export default function Matches() {
  const { db, user, isAdmin } = useApp();
  const allMatches = findMatches(db.reports, isAdmin ? undefined : user?.id);
  const matches = allMatches.slice(0, 25);
  return (
    <section className="page-section container">
      <PageHeading eyebrow="Discover more" title="Smart match suggestions"
        description={`Compare open Lost and Found reports from different people. Known item dates use a ${DEFAULT_MATCH_WINDOW_DAYS}-day window.`}
        aside={<Link href="/browse" className="btn btn-outline">Browse items <ArrowUpRight size={16} /></Link>} />
      <div className="info-note" style={{ marginBottom: 23 }}><Sparkles size={19} /><span><strong>A match suggestion is not proof of ownership.</strong> The score ranks similarity on a 0–100 scale. Verify ownership through a claim before handing over an item.</span></div>
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
        {matches.length === 0 && <EmptyState title="No match suggestions yet" description="Add identifying details to an open report, or browse items. A similar report from another person may appear here." actionHref="/browse" actionText="Browse existing items" />}
      </div>
    </section>
  );
}
