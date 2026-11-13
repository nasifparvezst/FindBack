"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Bell, CircleHelp, ClipboardList, Compass, LayoutDashboard, LogIn, Menu, Plus, Search, ShieldCheck, Sparkles, X, ArrowUpRight } from "lucide-react";
import { DEMO_MODE, useApp } from "@/context/app-context";

const links = [
  { href: "/", label: "Home", icon: Compass },
  { href: "/browse", label: "Browse Items", icon: Search },
  { href: "/matches", label: "Smart Matches", icon: Sparkles },
  { href: "/my-reports", label: "My Reports", icon: ClipboardList },
];

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { ready, user, db, isAdmin, syncError, unreadNotifications } = useApp();
  const [menuPath, setMenuPath] = useState<string | null>(null);
  const mobileOpen = menuPath === path;
  const menuButton = useRef<HTMLButtonElement>(null);
  const mobileNav = useRef<HTMLElement>(null);
  const main = useRef<HTMLElement>(null);
  const lastPath = useRef<string | null>(null);
  const unread = unreadNotifications ?? db.notifications.filter((n) => n.userId === user?.id && !n.read).length;
  useEffect(() => {
    if (!ready) return;
    const changed = lastPath.current !== null && lastPath.current !== path;
    lastPath.current = path;
    if (!changed) return;
    const frame = requestAnimationFrame(() => main.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [path, ready]);
  useEffect(() => {
    if (!mobileOpen) return;
    const frame = requestAnimationFrame(() => mobileNav.current?.querySelector<HTMLAnchorElement>("a")?.focus());
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setMenuPath(null); menuButton.current?.focus(); }
    };
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !mobileNav.current?.contains(event.target) && !menuButton.current?.contains(event.target)) setMenuPath(null);
    };
    const desktop = window.matchMedia("(min-width: 1025px)");
    const resize = () => { if (desktop.matches) setMenuPath(null); };
    document.addEventListener("keydown", close); document.addEventListener("pointerdown", outside); desktop.addEventListener("change", resize);
    return () => { cancelAnimationFrame(frame); document.removeEventListener("keydown", close); document.removeEventListener("pointerdown", outside); desktop.removeEventListener("change", resize); };
  }, [mobileOpen]);
  if (!ready) return <div className="startup" role="status" aria-live="polite"><div className="startup-mark" aria-hidden="true">↩</div><p>Preparing FindBack...</p></div>;

  return <div className="site-root">
    <a className="skip-link" href="#main-content" onClick={() => { setMenuPath(null); main.current?.focus({ preventScroll: true }); }}>Skip to main content</a>
    {DEMO_MODE && <div className="demo-strip"><span className="live-dot"/> <strong>DEMO PREVIEW</strong> &nbsp; Data stays in this browser. Shared database and secure authentication are not connected yet. <Link href="/about">Learn more <ArrowUpRight size={12}/></Link></div>}
    {syncError && <div className="demo-strip" role="alert" style={{background:"#fff1f0",color:"#9a3412"}}><strong>Connection error:</strong> {syncError} &nbsp; Check Supabase migration, URL and publishable key.</div>}
    <header className="site-header">
      <div className="nav-container">
        <Link href="/" className="brand" onClick={() => setMenuPath(null)} aria-label="FindBack home">
          <span className="brand-icon">↩</span><span>Find<span className="brand-accent">Back</span><small>Campus Recovery</small></span>
        </Link>
        <nav className="desktop-nav" aria-label="Main navigation">
          {links.map(({ href, label }) => <Link key={href} href={href} aria-current={path === href ? "page" : undefined} className={`nav-item ${path === href ? "active" : ""}`}>{label}</Link>)}
          {isAdmin && <Link href="/admin" aria-current={path === "/admin" ? "page" : undefined} className={`nav-item ${path === "/admin" ? "active" : ""}`}>Admin</Link>}
        </nav>
        <div className="header-actions">
          <Link href="/notifications" className="icon-action notification-action" aria-current={path === "/notifications" ? "page" : undefined} aria-label={`Notifications (${unread} unread)`}><Bell size={20}/>{unread > 0 && <span className="unread-count" aria-hidden="true">{unread > 99 ? "99+" : unread}</span>}</Link>
          {user ? <Link className="avatar-button" href={DEMO_MODE ? "/login" : "/account"} aria-label={DEMO_MODE ? `Switch demo account, signed in as ${user.name}` : `My account, ${user.name}`} title={DEMO_MODE ? "Switch demo account" : "My account"}><span aria-hidden="true">{user.name.split(" ").map((x)=>x[0]).slice(0,2).join("")}</span><span className="avatar-name">{user.name.split(" ")[0]}</span></Link> : <Link href="/login" className="top-login"><LogIn size={17}/> Sign in</Link>}
          <Link href="/report/lost" className="btn btn-primary header-report"><Plus size={17}/> Post an Item</Link>
          <button ref={menuButton} type="button" className="icon-action mobile-toggle" onClick={() => setMenuPath(mobileOpen ? null : path)} aria-expanded={mobileOpen} aria-controls="mobile-navigation" aria-label={mobileOpen ? "Close navigation" : "Open navigation"}>{mobileOpen ? <X size={23}/> : <Menu size={23}/>}</button>
        </div>
      </div>
      <nav id="mobile-navigation" ref={mobileNav} hidden={!mobileOpen} className="mobile-nav" aria-label="Mobile navigation">
        {[...links, {href:"/notifications",label:"Notifications",icon:Bell}, {href:"/about",label:"About",icon:CircleHelp}, ...(isAdmin ? [{href:"/admin",label:"Admin Dashboard",icon:LayoutDashboard}] : [])].map(({href,label,icon:Icon})=><Link key={href} href={href} onClick={()=>setMenuPath(null)} aria-current={path===href?"page":undefined} className={path===href?"active":""}><Icon size={18}/>{label}</Link>)}
        <Link href="/report/lost" onClick={()=>setMenuPath(null)}><Plus size={18}/> Report Lost Item</Link>
        <Link href="/report/found" onClick={()=>setMenuPath(null)}><Plus size={18}/> Report Found Item</Link>
      </nav>
    </header>
    <main id="main-content" ref={main} tabIndex={-1} className="main-content">{children}</main>
    <footer className="site-footer"><div className="container footer-inner"><div className="footer-left"><span className="brand-mini">↩</span><span><strong>FindBack 2.0</strong><small>Helping campus connections come full circle.</small></span></div><div className="footer-links"><Link href="/browse">Explore items</Link><Link href="/about">How it works</Link><Link href="/about"><ShieldCheck size={15}/> Campus safety</Link></div><span className="footer-copy">© {new Date().getFullYear()} FindBack</span></div></footer>
  </div>;
}
