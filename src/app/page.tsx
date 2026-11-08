"use client";

import Link from "next/link";
import { ArrowRight, ArrowUpRight, BadgeCheck, Check, ClipboardList, HeartHandshake, MapPin, PackageCheck, Plus, Search, ShieldCheck, Smartphone, Sparkles, type LucideIcon } from "lucide-react";
import { useApp } from "@/context/app-context";
import { countRecoveredItems } from "@/lib/statistics";
import { ItemCard } from "@/components/ui";

function Stat({ icon: Icon, label, value, tint }: { icon: LucideIcon; label: string; value: number; tint: string }) { return <div className="stat-card"><span className={`stat-icon ${tint}`}><Icon size={23}/></span><div><div className="stat-label">{label}</div><div className="stat-value">{value.toLocaleString()}</div></div></div>; }

export default function Home() {
  const { db } = useApp();
  const reports = [...db.reports].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const activeLost = reports.filter((r) => r.type === "lost" && r.status === "open").length;
  const activeFound = reports.filter((r) => r.type === "found" && r.status === "open").length;
  const returned = countRecoveredItems(db.reports, db.claims);
  return <>
    <section className="hero-section"><div className="container hero-grid">
      <div className="hero-copy"><span className="eyebrow">Your campus, connected</span><h1>Every lost item deserves a <em>way back.</em></h1><p>Lost something on campus? Found something that belongs to someone else? FindBack makes it simple to report, reconnect, and reunite.</p><div className="hero-actions"><Link href="/report/lost" className="btn btn-primary"><Plus size={17}/> Report a Lost Item</Link><Link href="/report/found" className="btn btn-light"><PackageCheck size={17}/> I Found Something</Link></div><div className="hero-trust"><ShieldCheck size={17}/> Designed for a safer, more connected campus community</div></div>
      <div className="hero-visual" aria-hidden="true"><div className="hero-glow"/><div className="visual-orbit"/>
        <div className="visual-card first"><div className="label-top"><span className="type-tag lost">Lost item</span><small>Just now</small></div><div className="thumb"><Smartphone size={68} strokeWidth={1.5}/></div><strong>iPhone 15 Pro</strong><small>Central Library</small></div>
        <div className="visual-card second"><div className="label-top"><span className="type-tag found">Found item</span><small>2 hours ago</small></div><div className="thumb"><Smartphone size={66} strokeWidth={1.5}/></div><strong>Found an iPhone</strong><small>Library Reading Area</small></div>
        <div className="visual-match"><span className="match-check"><Check size={22}/></span><span><strong>Potential match!</strong><small>Connection made possible</small></span></div>
      </div>
    </div></section>
    <section className="container stats-wrap"><div className="stats-grid"><Stat icon={Search} label="Active lost" value={activeLost} tint="sun"/><Stat icon={MapPin} label="Items found" value={activeFound} tint="blue"/><Stat icon={HeartHandshake} label="Returned items" value={returned} tint=""/><Stat icon={ClipboardList} label="Total reports" value={reports.length} tint="purple"/></div></section>
    <section className="section-pad container"><div className="section-header"><div><span className="eyebrow">Community activity</span><h2>Recently reported items</h2><p>Take a look. Your item might already be here.</p></div><Link href="/browse" className="text-link">Explore all items <ArrowUpRight size={17}/></Link></div><div className="items-grid">{reports.slice(0,4).map((r) => <ItemCard key={r.id} report={r}/>)}{reports.length === 0 && <div className="empty-state"><h3>No reports yet</h3><p>Be the first to report a lost or found item.</p></div>}</div></section>
    <section className="steps-section"><div className="container"><div className="center-heading"><span className="eyebrow">Simple by design</span><h2>How FindBack works</h2><p>Three easy steps to make finding and returning items effortless.</p></div><div className="steps-grid">
      <div className="step-card"><div className="step-top"><span className="step-icon"><ClipboardList size={25}/></span><span className="step-number">01 / REPORT</span></div><h3>Share the details</h3><p>Submit a lost or found report with the item name, location, date, and helpful details.</p></div>
      <div className="step-card"><div className="step-top"><span className="step-icon"><Sparkles size={25}/></span><span className="step-number">02 / DISCOVER</span></div><h3>Find a connection</h3><p>Browse reports and explore smart match suggestions based on item details.</p></div>
      <div className="step-card"><div className="step-top"><span className="step-icon"><BadgeCheck size={25}/></span><span className="step-number">03 / REUNITE</span></div><h3>Get it back safely</h3><p>Send a claim request, verify the details privately, and arrange a safe handover.</p></div>
    </div></div></section>
    <section className="container" style={{paddingTop:40,paddingBottom:66}}><div className="cta-band"><div><span className="eyebrow">Make someone's day</span><h2>Small action. Big difference.</h2><p>Found an item? A quick report could reunite it with its owner.</p></div><Link href="/report/found" className="btn">Report a Found Item <ArrowRight size={18}/></Link></div></section>
  </>;
}
