"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Bell, CheckCheck } from "lucide-react";
import { useApp } from "@/context/app-context";
import { EmptyState, PageHeading, Pagination } from "@/components/ui";
import { relativeDate } from "@/lib/format";
import { useDataPage } from "@/context/use-data-page";
import { DataPageStatus } from "@/components/data-page-status";

export default function Notifications() {
  const {db:baseDB,user,markAllRead,markNotificationRead,unreadNotifications}=useApp();
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [page,setPage]=useState(1);
  const remote=useDataPage({kind:"notifications",page,pageSize:20},Boolean(user));
  const db=remote?.db||baseDB;
  const safely=async(action:()=>void|Promise<void>)=>{if(busy)return;setBusy(true);setError("");try{await action();}catch(e){setError(e instanceof Error?e.message:"Could not update notifications");}finally{setBusy(false);}};
  if(!user)return <div className="page-section container"><EmptyState title="Sign in to view notifications" description="Your alerts and claim updates appear here." actionHref="/login"/></div>;
  const notes=db.notifications.filter((n)=>n.userId===user.id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));const count=unreadNotifications??notes.filter((n)=>!n.read).length;
  const total=remote?.total??notes.length;const currentPage=remote&&!remote.loading?remote.page:Math.min(page,Math.max(1,Math.ceil(total/20)));const visibleNotes=remote?notes:notes.slice((currentPage-1)*20,currentPage*20);
  return <section className="page-section container"><PageHeading eyebrow="Don't miss an update" title="Notifications" description={`${count} unread ${count===1?"notification":"notifications"}. Stay informed about claims, matches and item updates.`} aside={<button onClick={()=>{void safely(markAllRead);}} className="btn btn-outline" disabled={!count||busy}><CheckCheck size={17}/> Mark all as read</button>}/>
    <DataPageStatus page={remote}/>{error&&<div className="form-error" role="alert">{error}</div>}<div className="panel notification-list" aria-busy={remote?.loading || busy || undefined}>{visibleNotes.map((n)=><div className={`notification-entry ${n.read?"":"unread"}`} key={n.id}><span className="notification-icon"><Bell size={19}/></span><div className="notification-content"><strong>{n.title}</strong><p>{n.body}</p><small>{relativeDate(n.createdAt)}</small></div><div className="notification-actions"><Link className="text-link" href={n.href} aria-label={`Open ${n.title}`} onClick={()=>{void safely(()=>markNotificationRead(n.id));}}>Open <ArrowUpRight size={14}/></Link>{!n.read&&<button disabled={busy} aria-label={`Mark ${n.title} as read`} onClick={()=>{void safely(()=>markNotificationRead(n.id));}}>Mark read</button>}</div></div>)}{total===0&&!remote?.loading&&!remote?.error&&<EmptyState title="All caught up" description="Matching suggestions and claim updates will show up here." actionHref="/browse" actionText="Explore items"/>}</div>
    <Pagination page={currentPage} totalPages={Math.max(1,Math.ceil(total/20))} onChange={setPage} busy={remote?.loading} label="Notification pages"/>
  </section>;
}
