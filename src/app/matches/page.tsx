"use client";

import Link from "next/link";
import { ArrowRight, ArrowUpRight, GitCompareArrows, Sparkles } from "lucide-react";
import { useApp } from "@/context/app-context";
import { CategoryArt, EmptyState, PageHeading, TypeTag } from "@/components/ui";
import { findMatches } from "@/lib/matching";

export default function Matches() {
  const {db,user,isAdmin}=useApp();
  const matches=findMatches(db.reports,isAdmin?undefined:user?.id).slice(0,25);
  return <section className="page-section container"><PageHeading eyebrow="Discover more" title="Smart match suggestions" description="FindBack compares category, item name, brand, color, description, location and date to suggest possible connections." aside={<Link href="/browse" className="btn btn-outline">Browse items <ArrowUpRight size={16}/></Link>}/>
    <div className="info-note" style={{marginBottom:23}}><Sparkles size={19}/><span><strong>Matching is a suggestion, not proof.</strong> Scores are heuristic and may be wrong. Ownership must be verified through a claim before handing over an item.</span></div>
    <div className="match-grid">{matches.map(({lost,found,score,reasons,confidence})=><article className="panel match-card" key={`${lost.id}:${found.id}`}><div className="match-top"><span className="eyebrow" style={{letterSpacing:".06em"}}>Potential connection</span><span className={`score-badge ${score<75?"weak":""}`}><Sparkles size={14}/>{score}% · {confidence}</span></div>
      <div className="match-pair"><div className="match-side"><Link href={`/item/${lost.id}`}><CategoryArt category={lost.category} image={lost.image}/></Link><strong>{lost.title}</strong><small>{lost.location}</small><TypeTag type="lost"/></div><span className="match-link-icon"><GitCompareArrows size={17}/></span><div className="match-side"><Link href={`/item/${found.id}`}><CategoryArt category={found.category} image={found.image}/></Link><strong>{found.title}</strong><small>{found.location}</small><TypeTag type="found"/></div></div>
      <div className="reason-tags">{reasons.filter((r)=>!r.startsWith("Different")).slice(0,4).map((reason)=><span key={reason}>✓ {reason}</span>)}</div>
      <div className="match-bottom"><span style={{fontSize:11,color:"#80978b"}}>Confirm details with the other person</span><Link href={`/item/${user?.id===lost.ownerId?found.id:lost.id}`} className="btn btn-primary btn-sm">View matching item <ArrowRight size={14}/></Link></div>
    </article>)}{matches.length===0&&<EmptyState title="No match suggestions yet" description="Report a lost or found item or browse the community. Suggestions appear when reports have enough details in common." actionHref="/browse" actionText="Browse existing items"/>}</div>
  </section>;
}
